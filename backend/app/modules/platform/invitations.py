"""Send and claim company invitations. Clerk delivers the email; membership lives here."""
from __future__ import annotations

import hashlib
import json
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from ...core.auth import CurrentUser
from ...core.clerk_client import ClerkApiError, create_invitation, pending_invitation_id_for_email, revoke_invitation
from ...core.config import get_settings
from ...core.rbac import ASSIGNABLE_ROLES, DEFAULT_INVITE_ROLE
from ...database.connection import execute, fetch_all, fetch_one, transaction
from .membership import CompanyMembership, get_company_membership

INVITE_TTL_DAYS = 14


class InvitationError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class InviteFailure:
    email: str
    reason: str


@dataclass
class SendInvitesResult:
    sent: int = 0
    failures: list[InviteFailure] = field(default_factory=list)


@dataclass(frozen=True)
class ClaimResult:
    claimed: bool
    already_member: bool = False
    company_id: str | None = None
    company_name: str | None = None
    role: str | None = None


def hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def new_invite_token() -> str:
    return secrets.token_urlsafe(32)


def invitation_redirect_url() -> str:
    origin = get_settings().app_origin.rstrip("/")
    return f"{origin}/sign-up"


def resolve_invite_role(role: str | None) -> str:
    value = (role or DEFAULT_INVITE_ROLE).strip()
    return value if value in ASSIGNABLE_ROLES else ""


def _email_already_in_a_company(email: str) -> bool:
    row = fetch_one(
        "SELECT cm.user_id FROM company_member cm JOIN app_user u ON u.id = cm.user_id "
        "WHERE lower(u.email) = lower(%s)",
        (email,),
    )
    return row is not None


def owned_workspace_ids(company_id: str, workspace_ids: list[str] | None) -> list[str]:
    owned: list[str] = []
    for raw in workspace_ids or []:
        value = str(raw).strip()
        if not value:
            continue
        row = fetch_one("SELECT id FROM project WHERE id = %s AND company_id = %s", (value, company_id))
        if row:
            owned.append(str(row["id"]))
    return owned


def send_invites(
    user: CurrentUser,
    membership: CompanyMembership,
    rows: list[dict],
) -> SendInvitesResult:
    result = SendInvitesResult()
    redirect_url = invitation_redirect_url()
    expires_at = datetime.now(timezone.utc) + timedelta(days=INVITE_TTL_DAYS)

    for row in rows:
        email = str(row.get("email") or "").strip().lower()
        if not email:
            continue
        role = resolve_invite_role(row.get("role"))
        if not role:
            result.failures.append(InviteFailure(email=email, reason="Pick an assignable role."))
            continue
        if _email_already_in_a_company(email):
            result.failures.append(InviteFailure(email=email, reason="That person already belongs to a company."))
            continue

        workspace_ids = owned_workspace_ids(membership.company_id, row.get("workspace_ids") or [])
        token = new_invite_token()
        try:
            with transaction() as conn:
                conn.execute(
                    "UPDATE invitation SET status = 'revoked' "
                    "WHERE company_id = %s AND lower(email) = lower(%s) AND status = 'pending'",
                    (membership.company_id, email),
                )
                created = conn.execute(
                    """INSERT INTO invitation (
                           company_id, email, role, workspace_ids, invited_by_user_id, token_hash, expires_at
                       ) VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s)
                       RETURNING id""",
                    (
                        membership.company_id,
                        email,
                        role,
                        json.dumps(workspace_ids),
                        user.id,
                        hash_invite_token(token),
                        expires_at,
                    ),
                ).fetchone()
                clerk_invite = create_invitation(
                    email,
                    redirect_url=redirect_url,
                    public_metadata={
                        "quanto_invitation_id": str(created["id"]),
                        "company_id": membership.company_id,
                        "role": role,
                    },
                    expires_in_days=INVITE_TTL_DAYS,
                )
                if clerk_invite.id:
                    conn.execute(
                        "UPDATE invitation SET clerk_invitation_id = %s WHERE id = %s",
                        (clerk_invite.id, created["id"]),
                    )
        except ClerkApiError as exc:
            result.failures.append(InviteFailure(email=email, reason=str(exc)))
            continue
        result.sent += 1

    return result


def _pending_by_token(token: str) -> dict | None:
    return fetch_one(
        "SELECT id, company_id, email, role, workspace_ids, status, expires_at "
        "FROM invitation WHERE token_hash = %s AND status = 'pending'",
        (hash_invite_token(token),),
    )


def _pending_by_email(email: str) -> dict | None:
    return fetch_one(
        "SELECT id, company_id, email, role, workspace_ids, status, expires_at "
        "FROM invitation WHERE lower(email) = lower(%s) AND status = 'pending' AND expires_at > now() "
        "ORDER BY created_at DESC LIMIT 1",
        (email,),
    )


def claim_invitation(user: CurrentUser, *, token: str | None = None) -> ClaimResult:
    existing = get_company_membership(user.id)
    if existing:
        return ClaimResult(
            claimed=False,
            already_member=True,
            company_id=existing.company_id,
            company_name=existing.company_name,
            role=existing.role,
        )

    row = _pending_by_token(token) if token and token.strip() else _pending_by_email(user.email)
    if not row:
        return ClaimResult(claimed=False)

    if str(row["email"]).strip().lower() != user.email.strip().lower():
        raise InvitationError("invalid", "This invitation is for a different email address.")

    expires_at = row["expires_at"]
    if expires_at is not None and expires_at < datetime.now(timezone.utc):
        raise InvitationError("expired", "This invitation has expired.")

    company = fetch_one("SELECT id, name FROM company WHERE id = %s", (row["company_id"],))
    if not company:
        raise InvitationError("invalid", "That company no longer exists.")

    workspace_ids = row.get("workspace_ids") or []
    if isinstance(workspace_ids, str):
        workspace_ids = json.loads(workspace_ids)

    try:
        with transaction() as conn:
            conn.execute(
                "INSERT INTO company_member (company_id, user_id, role) VALUES (%s, %s, %s)",
                (row["company_id"], user.id, row["role"]),
            )
            for project_id in workspace_ids:
                conn.execute(
                    "INSERT INTO project_member (project_id, user_id) VALUES (%s, %s) "
                    "ON CONFLICT (project_id, user_id) DO NOTHING",
                    (str(project_id), user.id),
                )
            conn.execute(
                "UPDATE invitation SET status = 'accepted' WHERE id = %s",
                (row["id"],),
            )
    except Exception as exc:
        text = str(exc).lower()
        if "company_member" in text or "user_id" in text:
            raise InvitationError("already_member", "You already belong to a company.") from exc
        raise

    return ClaimResult(
        claimed=True,
        company_id=str(company["id"]),
        company_name=company["name"],
        role=row["role"],
    )


def list_pending_invitations(company_id: str) -> list[dict]:
    rows = fetch_all(
        "SELECT id, email, role, workspace_ids, expires_at, created_at "
        "FROM invitation WHERE company_id = %s AND status = 'pending' AND expires_at > now() "
        "ORDER BY created_at DESC",
        (company_id,),
    )
    pending = []
    for row in rows:
        pending.append({
            "id": str(row["id"]),
            "email": row["email"],
            "role": row["role"],
            "workspace_ids": [str(item) for item in (row.get("workspace_ids") or [])],
            "expires_at": row["expires_at"].isoformat() if row.get("expires_at") else None,
            "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        })
    return pending


def _revoke_clerk_invite(row: dict) -> None:
    clerk_id = (row.get("clerk_invitation_id") or "").strip()
    if not clerk_id:
        try:
            clerk_id = pending_invitation_id_for_email(row["email"]) or ""
        except ClerkApiError:
            clerk_id = ""
    if not clerk_id:
        return
    try:
        revoke_invitation(clerk_id)
    except ClerkApiError:
        # Local revoke still stands; the email link may already be dead.
        pass


def revoke_invite(membership: CompanyMembership, invitation_id: str) -> None:
    row = fetch_one(
        "SELECT id, email, clerk_invitation_id, status FROM invitation WHERE id = %s AND company_id = %s",
        (invitation_id, membership.company_id),
    )
    if not row or row["status"] != "pending":
        raise InvitationError("invalid", "That invite is no longer pending.")
    _revoke_clerk_invite(row)
    execute(
        "UPDATE invitation SET status = 'revoked' WHERE id = %s AND company_id = %s",
        (invitation_id, membership.company_id),
    )


def resend_invite(user: CurrentUser, membership: CompanyMembership, invitation_id: str) -> SendInvitesResult:
    row = fetch_one(
        "SELECT id, email, role, workspace_ids, status FROM invitation WHERE id = %s AND company_id = %s",
        (invitation_id, membership.company_id),
    )
    if not row or row["status"] != "pending":
        raise InvitationError("invalid", "That invite is no longer pending.")
    _revoke_clerk_invite(row)
    workspace_ids = row.get("workspace_ids") or []
    if isinstance(workspace_ids, str):
        workspace_ids = json.loads(workspace_ids)
    return send_invites(
        user,
        membership,
        [{"email": row["email"], "role": row["role"], "workspace_ids": workspace_ids}],
    )
