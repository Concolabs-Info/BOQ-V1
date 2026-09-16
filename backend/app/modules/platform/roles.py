"""Company-scoped custom roles. Stored in Postgres — not Clerk Organizations."""
from __future__ import annotations

import json

from ...core.rbac import (
    ALL_PERMISSIONS,
    ASSIGNABLE_ROLES,
    CUSTOM_ROLE_PERMISSIONS,
    MAX_CUSTOM_ROLES,
    ROLE_DESCRIPTIONS,
    ROLE_LABELS,
    ROLES,
    is_built_in_role,
    is_custom_role_key,
    permissions_for_role,
    role_label,
    sanitize_custom_permissions,
    unique_custom_role_key,
)
from ...database.connection import execute, fetch_all, fetch_one
from .invitations import InvitationError
from .membership import CompanyMembership


def _permissions_list(value) -> list[str]:
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def custom_role_row(company_id: str, key: str) -> dict | None:
    row = fetch_one(
        "SELECT id, company_id, key, name, description, permissions FROM company_role "
        "WHERE company_id = %s AND key = %s",
        (company_id, key),
    )
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "company_id": str(row["company_id"]),
        "key": row["key"],
        "name": row["name"],
        "description": row["description"] or "",
        "permissions": sanitize_custom_permissions(_permissions_list(row["permissions"])),
        "built_in": False,
    }


def permissions_for_membership(membership: CompanyMembership) -> list[str]:
    if is_built_in_role(membership.role):
        return permissions_for_role(membership.role)
    found = custom_role_row(membership.company_id, membership.role)
    return found["permissions"] if found else []


def is_assignable_role(company_id: str, role: str) -> bool:
    if role in ASSIGNABLE_ROLES:
        return True
    if is_custom_role_key(role):
        return custom_role_row(company_id, role) is not None
    return False


def known_role(company_id: str, role: str) -> bool:
    return is_built_in_role(role) or custom_role_row(company_id, role) is not None


def list_roles(company_id: str) -> list[dict]:
    built_in = [
        {
            "id": key,
            "key": key,
            "name": ROLE_LABELS[key],
            "description": ROLE_DESCRIPTIONS[key],
            "permissions": permissions_for_role(key),
            "built_in": True,
        }
        for key in ROLES
    ]
    rows = fetch_all(
        "SELECT id, key, name, description, permissions FROM company_role "
        "WHERE company_id = %s ORDER BY lower(name)",
        (company_id,),
    )
    custom = []
    for row in rows:
        custom.append({
            "id": str(row["id"]),
            "key": row["key"],
            "name": row["name"],
            "description": row["description"] or "",
            "permissions": sanitize_custom_permissions(_permissions_list(row["permissions"])),
            "built_in": False,
        })
    return built_in + custom


def create_custom_role(membership: CompanyMembership, *, name: str, description: str | None, permissions: list[str]) -> dict:
    clean_name = name.strip()
    if not clean_name:
        raise InvitationError("invalid", "Enter a role name.")
    keys = sanitize_custom_permissions(permissions)
    if not keys:
        raise InvitationError("invalid", "Pick at least one permission.")
    existing = fetch_all("SELECT key, name FROM company_role WHERE company_id = %s", (membership.company_id,))
    if len(existing) >= MAX_CUSTOM_ROLES:
        raise InvitationError("invalid", "This company already has the maximum number of custom roles.")
    if any(str(row["name"]).strip().lower() == clean_name.lower() for row in existing):
        raise InvitationError("invalid", "A role with that name already exists.")
    key = unique_custom_role_key(clean_name, [row["key"] for row in existing])
    row = fetch_one(
        """INSERT INTO company_role (company_id, key, name, description, permissions)
           VALUES (%s, %s, %s, %s, %s::jsonb)
           RETURNING id, key, name, description, permissions""",
        (membership.company_id, key, clean_name, (description or "").strip() or None, json.dumps(keys)),
    )
    if not row:
        raise InvitationError("invalid", "Could not create that role.")
    return {
        "id": str(row["id"]),
        "key": row["key"],
        "name": row["name"],
        "description": row["description"] or "",
        "permissions": keys,
        "built_in": False,
    }


def update_custom_role(membership: CompanyMembership, role_id: str, *, name: str, description: str | None, permissions: list[str]) -> dict:
    current = fetch_one(
        "SELECT id, key, name FROM company_role WHERE id = %s AND company_id = %s",
        (role_id, membership.company_id),
    )
    if not current:
        raise InvitationError("invalid", "That role no longer exists.")
    clean_name = name.strip()
    if not clean_name:
        raise InvitationError("invalid", "Enter a role name.")
    keys = sanitize_custom_permissions(permissions)
    if not keys:
        raise InvitationError("invalid", "Pick at least one permission.")
    clash = fetch_one(
        "SELECT id FROM company_role WHERE company_id = %s AND lower(name) = lower(%s) AND id <> %s",
        (membership.company_id, clean_name, role_id),
    )
    if clash:
        raise InvitationError("invalid", "A role with that name already exists.")
    execute(
        "UPDATE company_role SET name = %s, description = %s, permissions = %s::jsonb WHERE id = %s AND company_id = %s",
        (clean_name, (description or "").strip() or None, json.dumps(keys), role_id, membership.company_id),
    )
    return custom_role_row(membership.company_id, current["key"]) or {
        "id": role_id,
        "key": current["key"],
        "name": clean_name,
        "description": (description or "").strip(),
        "permissions": keys,
        "built_in": False,
    }


def delete_custom_role(membership: CompanyMembership, role_id: str) -> None:
    current = fetch_one(
        "SELECT id, key FROM company_role WHERE id = %s AND company_id = %s",
        (role_id, membership.company_id),
    )
    if not current:
        raise InvitationError("invalid", "That role no longer exists.")
    in_use = fetch_one(
        "SELECT user_id FROM company_member WHERE company_id = %s AND role = %s LIMIT 1",
        (membership.company_id, current["key"]),
    )
    if in_use:
        raise InvitationError("invalid", "Reassign people off this role before deleting it.")
    pending = fetch_one(
        "SELECT id FROM invitation WHERE company_id = %s AND role = %s AND status = 'pending' LIMIT 1",
        (membership.company_id, current["key"]),
    )
    if pending:
        raise InvitationError("invalid", "Revoke pending invites for this role before deleting it.")
    execute("DELETE FROM company_role WHERE id = %s AND company_id = %s", (role_id, membership.company_id))


def label_for_role(company_id: str, role: str) -> str:
    if is_built_in_role(role):
        return role_label(role)
    found = custom_role_row(company_id, role)
    return found["name"] if found else role_label(role)


# Keep a named export used by older imports.
__all__ = [
    "ALL_PERMISSIONS",
    "CUSTOM_ROLE_PERMISSIONS",
    "create_custom_role",
    "custom_role_row",
    "delete_custom_role",
    "is_assignable_role",
    "known_role",
    "label_for_role",
    "list_roles",
    "permissions_for_membership",
    "update_custom_role",
]
