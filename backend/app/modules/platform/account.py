"""Account and company teardown. Clerk deletes the user; tenancy lives in Postgres."""
from __future__ import annotations

from ...core.auth import CurrentUser
from ...core.clerk_client import ClerkApiError, delete_user, revoke_invitation, pending_invitation_id_for_email
from ...database.connection import fetch_all, fetch_one, transaction
from .invitations import InvitationError
from .membership import CompanyMembership, get_company_membership


def confirm_name_matches(typed: str, target: str) -> bool:
    return typed.strip().lower() == target.strip().lower()


def account_deletion_status(user_id: str) -> dict:
    """What deleting this account would do to the company they belong to.

    - free: they are not the only admin (or have no company). Membership is
      dropped; the company stays.
    - last-admin: they are the only owner. The company cannot outlive them, so
      delete either hands off ownership first or takes the company down with it.
    """
    membership = get_company_membership(user_id)
    if not membership:
        return {"kind": "free"}

    members = fetch_all(
        "SELECT user_id, role FROM company_member WHERE company_id = %s",
        (membership.company_id,),
    )
    admins = [row for row in members if row["role"] == "admin"]
    if not any(row["user_id"] == user_id for row in admins):
        return {"kind": "free"}
    if any(row["user_id"] != user_id for row in admins):
        return {"kind": "free"}
    return {
        "kind": "last-admin",
        "company_name": membership.company_name,
        "other_members": max(0, len(members) - 1),
    }


def _revoke_pending_invites(company_id: str) -> None:
    rows = fetch_all(
        "SELECT email, clerk_invitation_id FROM invitation WHERE company_id = %s AND status = 'pending'",
        (company_id,),
    )
    for row in rows:
        clerk_id = (row.get("clerk_invitation_id") or "").strip()
        if not clerk_id:
            try:
                clerk_id = pending_invitation_id_for_email(row["email"]) or ""
            except ClerkApiError:
                clerk_id = ""
        if not clerk_id:
            continue
        try:
            revoke_invitation(clerk_id)
        except ClerkApiError:
            pass


def teardown_company(company_id: str) -> None:
    """Projects first (no ON DELETE CASCADE from company), then the company row."""
    _revoke_pending_invites(company_id)
    with transaction() as conn:
        conn.execute("DELETE FROM project WHERE company_id = %s", (company_id,))
        conn.execute("DELETE FROM company WHERE id = %s", (company_id,))


def _leave_company(user_id: str, company_id: str) -> None:
    with transaction() as conn:
        conn.execute(
            "DELETE FROM project_member WHERE user_id = %s AND project_id IN "
            "(SELECT id FROM project WHERE company_id = %s)",
            (user_id, company_id),
        )
        conn.execute(
            "DELETE FROM company_member WHERE company_id = %s AND user_id = %s",
            (company_id, user_id),
        )
        conn.execute(
            """INSERT INTO former_member (company_id, user_id)
               VALUES (%s, %s)
               ON CONFLICT (company_id, user_id) DO UPDATE SET removed_at = now()""",
            (company_id, user_id),
        )


def delete_company(membership: CompanyMembership, confirm_name: str) -> None:
    row = fetch_one("SELECT name FROM company WHERE id = %s", (membership.company_id,))
    if not row:
        raise InvitationError("invalid", "Company not found.")
    if not confirm_name_matches(confirm_name, row["name"]):
        raise InvitationError("invalid", "Type the company name to confirm.", field="confirmName")
    teardown_company(membership.company_id)


def delete_my_account(user: CurrentUser, confirm_name: str | None = None) -> None:
    # Re-derived here, never trusted from the client, so a role change between
    # the page load and this call cannot slip past the last-admin guard.
    status = account_deletion_status(user.id)
    membership = get_company_membership(user.id)

    if status["kind"] == "last-admin":
        if not confirm_name_matches(confirm_name or "", status["company_name"]):
            raise InvitationError(
                "invalid",
                "Type the company name to delete it with your account.",
                field="confirmName",
            )
        if membership:
            teardown_company(membership.company_id)
    elif membership:
        try:
            _leave_company(user.id, membership.company_id)
        except Exception:
            # Local cleanup failing should not block deleting the Clerk user.
            pass

    try:
        delete_user(user.id)
    except ClerkApiError as exc:
        raise InvitationError("invalid", "Could not delete your account. Try again.") from exc
