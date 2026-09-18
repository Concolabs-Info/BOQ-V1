"""Account and company teardown. Clerk deletes the user; tenancy lives in Postgres."""
from __future__ import annotations

from ...core.auth import CurrentUser
from ...core.clerk_client import ClerkApiError, delete_user
from ...database.connection import execute, fetch_all, fetch_one, transaction
from ...services.storage.paths import purge_project_files
from .company import purge_company_files
from .invitations import InvitationError, _revoke_clerk_invite
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
        _revoke_clerk_invite(row)


def _displace_members(company_id: str, company_name: str, *, except_user_id: str | None = None) -> None:
    with transaction() as conn:
        conn.execute(
            """UPDATE former_member
               SET company_name = COALESCE(NULLIF(btrim(company_name), ''), %s)
               WHERE company_id = %s""",
            (company_name, company_id),
        )
        conn.execute(
            """INSERT INTO former_member (company_id, user_id, company_name, reason)
               SELECT %s, user_id, %s, 'company_deleted'
               FROM company_member
               WHERE company_id = %s AND user_id <> COALESCE(%s, '')
               ON CONFLICT (company_id, user_id) DO UPDATE
               SET company_name = EXCLUDED.company_name, reason = 'company_deleted', removed_at = now()""",
            (company_id, company_name, company_id, except_user_id),
        )


def teardown_company(company_id: str, *, except_user_id: str | None = None) -> None:
    """Projects first (no ON DELETE CASCADE from company), then the company row."""
    row = fetch_one("SELECT name FROM company WHERE id = %s", (company_id,))
    name = (row["name"] if row else "").strip() or "this company"
    project_ids = [str(item["id"]) for item in fetch_all("SELECT id FROM project WHERE company_id = %s", (company_id,))]
    _revoke_pending_invites(company_id)
    _displace_members(company_id, name, except_user_id=except_user_id)
    with transaction() as conn:
        conn.execute("DELETE FROM project WHERE company_id = %s", (company_id,))
        conn.execute("DELETE FROM company WHERE id = %s", (company_id,))
    # Every table under a project cascades from project_id, but the source
    # PDFs, page renders, crops, and each takeoff module's own on-disk
    # folder live under storage_root/<project_id>/, not in Postgres at all -
    # deleting the row never touches them.
    for project_id in project_ids:
        purge_project_files(project_id)
    purge_company_files(company_id)


def _leave_company(user_id: str, company_id: str, company_name: str) -> None:
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
            """INSERT INTO former_member (company_id, user_id, company_name, reason)
               VALUES (%s, %s, %s, 'left')
               ON CONFLICT (company_id, user_id) DO UPDATE
               SET removed_at = now(), company_name = EXCLUDED.company_name, reason = 'left'""",
            (company_id, user_id, company_name),
        )


def delete_company(
    membership: CompanyMembership,
    confirm_name: str,
    *,
    actor_user_id: str | None = None,
) -> None:
    row = fetch_one("SELECT name FROM company WHERE id = %s", (membership.company_id,))
    if not row:
        raise InvitationError("invalid", "Company not found.")
    if not confirm_name_matches(confirm_name, row["name"]):
        raise InvitationError("invalid", "Type the company name to confirm.", field="confirmName")
    teardown_company(membership.company_id, except_user_id=actor_user_id)


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
            teardown_company(membership.company_id, except_user_id=user.id)
    elif membership:
        try:
            _leave_company(user.id, membership.company_id, membership.company_name)
        except InvitationError:
            raise
        except Exception as exc:
            raise InvitationError("invalid", "Could not leave your company. Try again.") from exc

    execute("UPDATE app_user SET deleted_at = now() WHERE id = %s", (user.id,))
    try:
        delete_user(user.id)
    except ClerkApiError as exc:
        execute("UPDATE app_user SET deleted_at = NULL WHERE id = %s", (user.id,))
        raise InvitationError("invalid", "Could not delete your account. Try again.") from exc
