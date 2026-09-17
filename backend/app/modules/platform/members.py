"""Company member list, role changes, removals, and project assignment.
Tenancy and roles live in Postgres, not Clerk Orgs."""
from __future__ import annotations

from ...core.auth import CurrentUser
from ...core.ids import is_valid_uuid
from ...core.rbac import ROLE_LABELS
from ...database.connection import execute, fetch_all, fetch_one, transaction
from .invitations import InvitationError
from .membership import CompanyMembership
from .roles import is_assignable_role, label_for_role


def list_members(company_id: str) -> list[dict]:
    rows = fetch_all(
        "SELECT u.id, u.email, u.full_name, cm.role, cm.created_at, cr.name AS custom_role_name "
        "FROM company_member cm JOIN app_user u ON u.id = cm.user_id "
        "LEFT JOIN company_role cr ON cr.company_id = cm.company_id AND cr.key = cm.role "
        "WHERE cm.company_id = %s ORDER BY cm.created_at ASC",
        (company_id,),
    )
    assigned = fetch_all(
        "SELECT pm.user_id, pm.project_id FROM project_member pm "
        "JOIN project p ON p.id = pm.project_id WHERE p.company_id = %s",
        (company_id,),
    )
    by_user: dict[str, list[str]] = {}
    for row in assigned:
        by_user.setdefault(row["user_id"], []).append(str(row["project_id"]))

    members = []
    for row in rows:
        members.append({
            "id": row["id"],
            "email": row["email"],
            "full_name": row["full_name"],
            "role": row["role"],
            "role_label": row["custom_role_name"] or ROLE_LABELS.get(row["role"], row["role"]),
            "workspace_ids": by_user.get(row["id"], []),
            "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        })
    return members


def _admin_count(company_id: str) -> int:
    row = fetch_one(
        "SELECT count(*) AS n FROM company_member WHERE company_id = %s AND role = 'admin'",
        (company_id,),
    )
    return int(row["n"] if row else 0)


def update_member_role(actor: CurrentUser, membership: CompanyMembership, target_user_id: str, role: str) -> dict:
    if target_user_id == actor.id:
        raise InvitationError("invalid", "You can't change your own role.")
    # Promoting to admin is a separate, deliberate action, not a value on this
    # dropdown — is_assignable_role() excludes it the same way invites do.
    if not is_assignable_role(membership.company_id, role):
        raise InvitationError("invalid", "Unknown role.")
    current = fetch_one(
        "SELECT user_id, role FROM company_member WHERE company_id = %s AND user_id = %s",
        (membership.company_id, target_user_id),
    )
    if not current:
        raise InvitationError("invalid", "That person is not in this company.")
    if current["role"] == "admin" and role != "admin" and _admin_count(membership.company_id) <= 1:
        raise InvitationError("invalid", "Keep at least one admin.")
    execute(
        "UPDATE company_member SET role = %s WHERE company_id = %s AND user_id = %s",
        (role, membership.company_id, target_user_id),
    )
    return {"id": target_user_id, "role": role, "role_label": label_for_role(membership.company_id, role)}


def remove_member(actor: CurrentUser, membership: CompanyMembership, target_user_id: str) -> None:
    if target_user_id == actor.id:
        raise InvitationError("invalid", "You can't remove yourself.")
    current = fetch_one(
        "SELECT user_id, role FROM company_member WHERE company_id = %s AND user_id = %s",
        (membership.company_id, target_user_id),
    )
    if not current:
        raise InvitationError("invalid", "That person is not in this company.")
    if current["role"] == "admin" and _admin_count(membership.company_id) <= 1:
        raise InvitationError("invalid", "Keep at least one admin.")
    with transaction() as conn:
        conn.execute(
            "DELETE FROM project_member WHERE user_id = %s AND project_id IN "
            "(SELECT id FROM project WHERE company_id = %s)",
            (target_user_id, membership.company_id),
        )
        conn.execute(
            "DELETE FROM company_member WHERE company_id = %s AND user_id = %s",
            (membership.company_id, target_user_id),
        )
        conn.execute(
            """INSERT INTO former_member (company_id, user_id, company_name, reason)
               VALUES (%s, %s, %s, 'removed')
               ON CONFLICT (company_id, user_id) DO UPDATE
               SET removed_at = now(), company_name = EXCLUDED.company_name, reason = 'removed'""",
            (membership.company_id, target_user_id, membership.company_name),
        )


def assign_to_project(membership: CompanyMembership, user_id: str, project_id: str) -> None:
    if not is_valid_uuid(project_id):
        raise InvitationError("invalid", "That project is not in this company.")
    member = fetch_one(
        "SELECT user_id FROM company_member WHERE company_id = %s AND user_id = %s",
        (membership.company_id, user_id),
    )
    if not member:
        raise InvitationError("invalid", "That person is not in this company.")
    project = fetch_one(
        "SELECT id FROM project WHERE id = %s AND company_id = %s",
        (project_id, membership.company_id),
    )
    if not project:
        raise InvitationError("invalid", "That project is not in this company.")
    execute(
        "INSERT INTO project_member (project_id, user_id) VALUES (%s, %s) "
        "ON CONFLICT (project_id, user_id) DO NOTHING",
        (project_id, user_id),
    )


def unassign_from_project(membership: CompanyMembership, user_id: str, project_id: str) -> None:
    if not is_valid_uuid(project_id):
        raise InvitationError("invalid", "That project is not in this company.")
    project = fetch_one(
        "SELECT id FROM project WHERE id = %s AND company_id = %s",
        (project_id, membership.company_id),
    )
    if not project:
        raise InvitationError("invalid", "That project is not in this company.")
    execute(
        "DELETE FROM project_member WHERE project_id = %s AND user_id = %s",
        (project_id, user_id),
    )
