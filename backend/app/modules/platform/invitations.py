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
from ...core.rbac import ASSIGNABLE_ROLES, DEFAULT_INVITE_ROLE, is_custom_role_key
from ...database.connection import execute, fetch_all, fetch_one, transaction
from .membership import CompanyMembership, get_company_membership
from .terms import has_accepted_current

try:
    from psycopg.errors import UniqueViolation
except ModuleNotFoundError:  # unit tests can raise a stand-in
    class UniqueViolation(Exception):
        pass

INVITE_TTL_DAYS = 14


class InvitationError(Exception):
    def __init__(self, code: str, message: str, field: str | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.field = field


@dataclass(frozen=True)
class InviteFailure:
    email: str
    reason: str


@dataclass
class SendInvitesResult:
    sent: int = 0
    existing_accounts: list[str] = field(default_factory=list)
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


def resolve_invite_role(role: str | None, company_id: str | None = None) -> str:
    value = (role or DEFAULT_INVITE_ROLE).strip()
    if value in ASSIGNABLE_ROLES:
        return value
    if company_id and is_custom_role_key(value):
        row = fetch_one(
            "SELECT key FROM company_role WHERE company_id = %s AND key = %s",
            (company_id, value),
        )
        if row:
            return value
    return ""


def _email_already_in_a_company(email: str) -> bool:
    row = fetch_one(
        "SELECT cm.user_id FROM company_member cm JOIN app_user u ON u.id = cm.user_id "
        "WHERE lower(u.email) = lower(%s) AND u.deleted_at IS NULL",
        (email,),
    )
    return row is not None


def _account_exists(email: str) -> bool:
    row = fetch_one(
        "SELECT id FROM app_user WHERE lower(email) = lower(%s) AND deleted_at IS NULL LIMIT 1",
        (email,),
    )
    return row is not None


def _pending_other_company(email: str, company_id: str) -> bool:
    row = fetch_one(
        "SELECT id FROM invitation WHERE lower(email) = lower(%s) AND status = 'pending' "
        "AND expires_at > now() AND company_id <> %s LIMIT 1",
        (email, company_id),
    )
    return row is not None


def _clerk_existing_identifier(exc: ClerkApiError) -> bool:
    text = str(exc).lower()
    return any(
        needle in text
        for needle in (
            "already associated",
            "already exists",
            "already a user",
            "already taken",
            "already registered",
            "identifier is taken",
            "duplicate_record",
            "form_identifier_exists",
        )
    )


def _record_existing_account(result: SendInvitesResult, email: str) -> None:
    result.sent += 1
    result.existing_accounts.append(email)


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


def _workspace_id_list(value) -> list[str]:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return []
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if str(item).strip()]


def _pending_invite_out(
    row: dict,
    *,
    role: str | None = None,
    workspace_ids: list[str] | None = None,
) -> dict:
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "role": row["role"] if role is None else role,
        "workspace_ids": _workspace_id_list(row.get("workspace_ids")) if workspace_ids is None else workspace_ids,
        "expires_at": row["expires_at"].isoformat() if row.get("expires_at") else None,
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "existing_account": _account_exists(row["email"]),
    }


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
        role = resolve_invite_role(row.get("role"), membership.company_id)
        if not role:
            result.failures.append(InviteFailure(email=email, reason="Pick an assignable role."))
            continue
        if _email_already_in_a_company(email):
            result.failures.append(InviteFailure(email=email, reason="That person already belongs to a company."))
            continue
        if _pending_other_company(email, membership.company_id):
            result.failures.append(
                InviteFailure(email=email, reason="That person already has a pending invitation from another company.")
            )
            continue

        workspace_ids = owned_workspace_ids(membership.company_id, row.get("workspace_ids") or [])
        token = new_invite_token()
        try:
            with transaction() as conn:
                conn.execute(
                    "UPDATE invitation SET status = 'revoked' "
                    "WHERE lower(email) = lower(%s) AND status = 'pending' "
                    "AND (company_id = %s OR expires_at <= now())",
                    (email, membership.company_id),
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
        except UniqueViolation:
            result.failures.append(
                InviteFailure(email=email, reason="That person already has a pending invitation from another company.")
            )
            continue
        except Exception:
            result.failures.append(InviteFailure(email=email, reason="We couldn't save that invitation. Try again."))
            continue

        invitation_id = str(created["id"]) if created and created.get("id") else ""
        if not invitation_id:
            result.failures.append(InviteFailure(email=email, reason="We couldn't save that invitation. Try again."))
            continue
        if _account_exists(email):
            _record_existing_account(result, email)
            continue

        try:
            clerk_invite = create_invitation(
                email,
                redirect_url=redirect_url,
                public_metadata={
                    "quanto_invitation_id": invitation_id,
                    "company_id": membership.company_id,
                    "role": role,
                },
                expires_in_days=INVITE_TTL_DAYS,
            )
            if clerk_invite.id:
                with transaction() as conn:
                    conn.execute(
                        "UPDATE invitation SET clerk_invitation_id = %s WHERE id = %s",
                        (clerk_invite.id, invitation_id),
                    )
        except ClerkApiError as exc:
            if _clerk_existing_identifier(exc):
                _record_existing_account(result, email)
                continue
            with transaction() as conn:
                conn.execute(
                    "UPDATE invitation SET status = 'revoked' WHERE id = %s AND status = 'pending'",
                    (invitation_id,),
                )
            detail = str(exc).lower()
            reason = (
                "That email already has a pending invitation."
                if "already" in detail
                else "We couldn't send that invitation. Try again."
            )
            result.failures.append(InviteFailure(email=email, reason=reason))
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


def pending_invite_for_email(email: str) -> dict | None:
    """Open invitation for this email, if any. Used to send invitees into join
    instead of founder setup or 'request to join'."""
    row = _pending_by_email(email)
    if not row:
        return None
    company = fetch_one("SELECT id, name, domain FROM company WHERE id = %s", (row["company_id"],))
    if not company:
        return None
    workspace_ids = _workspace_id_list(row.get("workspace_ids"))
    return {
        "company_id": str(company["id"]),
        "company_name": company["name"],
        "domain": company.get("domain"),
        "role": row["role"],
        "project_count": len([item for item in workspace_ids if item]),
    }


def claim_invitation(user: CurrentUser, *, token: str | None = None) -> ClaimResult:
    """`token` is accepted for a future accept-link flow, but nothing wires
    it through yet — the redirect_url Clerk emails today carries no token.
    The security boundary is the email check below (row["email"] must match
    the Clerk-verified `user.email`), not `token`; do not rely on token
    presence alone to authorize a claim."""
    existing = get_company_membership(user.id)
    if existing:
        return ClaimResult(
            claimed=False,
            already_member=True,
            company_id=existing.company_id,
            company_name=existing.company_name,
            role=existing.role,
        )
    if not has_accepted_current(user.terms_accepted_at, user.terms_version):
        raise InvitationError("terms", "Accept the current terms to continue.")

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

    workspace_ids = _workspace_id_list(row.get("workspace_ids"))

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
            conn.execute(
                "UPDATE invitation SET status = 'revoked' "
                "WHERE lower(email) = lower(%s) AND status = 'pending' AND id <> %s",
                (user.email, row["id"]),
            )
            conn.execute("DELETE FROM former_member WHERE user_id = %s", (user.id,))
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


def pending_invite_rows_for_email(email: str) -> list[dict]:
    return fetch_all(
        "SELECT id, email, clerk_invitation_id, status FROM invitation "
        "WHERE lower(email) = lower(%s) AND status = 'pending'",
        (email,),
    )


def decline_pending_invites(user: CurrentUser) -> int:
    """Drop open invites for this email so they can set up their own company."""
    if get_company_membership(user.id):
        return 0
    rows = fetch_all(
        "SELECT id, email, clerk_invitation_id, status FROM invitation "
        "WHERE lower(email) = lower(%s) AND status = 'pending'",
        (user.email,),
    )
    count = 0
    for row in rows:
        _revoke_clerk_invite(row)
        execute(
            "UPDATE invitation SET status = 'revoked' WHERE id = %s AND status = 'pending'",
            (row["id"],),
        )
        count += 1
    return count


def list_pending_invitations(company_id: str) -> list[dict]:
    rows = fetch_all(
        "SELECT id, email, role, workspace_ids, expires_at, created_at "
        "FROM invitation WHERE company_id = %s AND status = 'pending' AND expires_at > now() "
        "ORDER BY created_at DESC",
        (company_id,),
    )
    return [_pending_invite_out(row) for row in rows]


def update_invite(
    membership: CompanyMembership,
    invitation_id: str,
    *,
    role: str | None = None,
    workspace_ids: list[str] | None = None,
) -> dict:
    row = fetch_one(
        "SELECT id, email, role, workspace_ids, status, expires_at, created_at "
        "FROM invitation WHERE id = %s AND company_id = %s",
        (invitation_id, membership.company_id),
    )
    if not row or row["status"] != "pending":
        raise InvitationError("invalid", "That invite is no longer pending.")

    expires_at = row.get("expires_at")
    if expires_at is not None and expires_at < datetime.now(timezone.utc):
        raise InvitationError("expired", "This invitation has expired.")

    next_role = row["role"]
    if role is not None:
        resolved = resolve_invite_role(role, membership.company_id)
        if not resolved:
            raise InvitationError("invalid", "Pick an assignable role.")
        next_role = resolved

    next_ids = (
        owned_workspace_ids(membership.company_id, workspace_ids)
        if workspace_ids is not None
        else _workspace_id_list(row.get("workspace_ids"))
    )

    execute(
        "UPDATE invitation SET role = %s, workspace_ids = %s::jsonb WHERE id = %s AND company_id = %s",
        (next_role, json.dumps(next_ids), invitation_id, membership.company_id),
    )
    return _pending_invite_out(row, role=next_role, workspace_ids=next_ids)


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
    workspace_ids = _workspace_id_list(row.get("workspace_ids"))
    return send_invites(
        user,
        membership,
        [{"email": row["email"], "role": row["role"], "workspace_ids": workspace_ids}],
    )
