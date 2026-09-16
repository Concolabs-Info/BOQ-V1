"""Company member list, role changes, and removals. Tenancy lives in Postgres, not Clerk Orgs."""
from __future__ import annotations

from ...core.auth import CurrentUser
from ...core.rbac import ROLE_LABELS, ROLES
from ...database.connection import execute, fetch_all, fetch_one, transaction
from .invitations import InvitationError
from .membership import CompanyMembership


def list_members(company_id: str) -> list[dict]:
    rows = fetch_all(
        "SELECT u.id, u.email, u.full_name, cm.role, cm.created_at "
        "FROM company_member cm JOIN app_user u ON u.id = cm.user_id "
        "WHERE cm.company_id = %s ORDER BY cm.created_at ASC",
        (company_id,),
    )
    members = []
    for row in rows:
        members.append({
            "id": row["id"],
            "email": row["email"],
            "full_name": row["full_name"],
            "role": row["role"],
            "role_label": ROLE_LABELS.get(row["role"], row["role"]),
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
    if role not in ROLES:
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
    return {"id": target_user_id, "role": role, "role_label": ROLE_LABELS.get(role, role)}


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
            """INSERT INTO former_member (company_id, user_id)
               VALUES (%s, %s)
               ON CONFLICT (company_id, user_id) DO UPDATE SET removed_at = now()""",
            (membership.company_id, target_user_id),
        )
