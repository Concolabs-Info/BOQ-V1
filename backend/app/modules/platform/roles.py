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


ADMIN_LOCKED_PERMISSIONS = ("company:manage", "members:manage", "billing:manage")


def _permissions_list(value) -> list[str]:
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, list):
        return []
    return [str(item) for item in value]


def sanitize_role_permissions(key: str, permissions: list[str] | None) -> list[str]:
    keys = sanitize_custom_permissions(permissions)
    if key == "admin":
        for item in ADMIN_LOCKED_PERMISSIONS:
            if item not in keys:
                keys.append(item)
    return keys


def _from_row(row: dict, *, built_in: bool) -> dict:
    key = str(row["key"])
    stored = (
        sanitize_role_permissions(key, _permissions_list(row.get("permissions")))
        if built_in
        else sanitize_custom_permissions(_permissions_list(row.get("permissions")))
    )
    return {
        "id": str(row["id"]),
        "key": key,
        "name": row["name"],
        "description": row["description"] or "",
        "permissions": stored,
        "built_in": built_in,
    }


def custom_role_row(company_id: str, key: str) -> dict | None:
    row = fetch_one(
        "SELECT id, company_id, key, name, description, permissions FROM company_role "
        "WHERE company_id = %s AND key = %s",
        (company_id, key),
    )
    if not row:
        return None
    return _from_row(row, built_in=is_built_in_role(str(row["key"])))


def permissions_for_membership(membership: CompanyMembership) -> list[str]:
    found = custom_role_row(membership.company_id, membership.role)
    if found:
        return found["permissions"]
    if is_built_in_role(membership.role):
        return permissions_for_role(membership.role)
    return []


def is_assignable_role(company_id: str, role: str) -> bool:
    if role in ASSIGNABLE_ROLES:
        return True
    if is_custom_role_key(role):
        return custom_role_row(company_id, role) is not None
    return False


def known_role(company_id: str, role: str) -> bool:
    return is_built_in_role(role) or custom_role_row(company_id, role) is not None


def list_roles(company_id: str) -> list[dict]:
    rows = fetch_all(
        "SELECT id, key, name, description, permissions FROM company_role "
        "WHERE company_id = %s ORDER BY lower(name)",
        (company_id,),
    )
    by_key = {str(row["key"]): row for row in rows}
    built_in = []
    for key in ROLES:
        override = by_key.get(key)
        if override:
            built_in.append(_from_row(override, built_in=True))
        else:
            built_in.append({
                "id": key,
                "key": key,
                "name": ROLE_LABELS[key],
                "description": ROLE_DESCRIPTIONS[key],
                "permissions": permissions_for_role(key),
                "built_in": True,
            })
    custom = [_from_row(row, built_in=False) for row in rows if not is_built_in_role(str(row["key"]))]
    return built_in + custom


def create_custom_role(membership: CompanyMembership, *, name: str, description: str | None, permissions: list[str]) -> dict:
    clean_name = name.strip()
    if not clean_name:
        raise InvitationError("invalid", "Enter a role name.")
    keys = sanitize_custom_permissions(permissions)
    if not keys:
        raise InvitationError("invalid", "Pick at least one permission.")
    existing = fetch_all("SELECT key, name FROM company_role WHERE company_id = %s", (membership.company_id,))
    custom_count = sum(1 for row in existing if is_custom_role_key(str(row["key"])))
    if custom_count >= MAX_CUSTOM_ROLES:
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


def _name_taken(company_id: str, name: str, *, exclude_id: str | None = None) -> bool:
    clash = fetch_one(
        "SELECT id FROM company_role WHERE company_id = %s AND lower(name) = lower(%s)"
        + (" AND id <> %s" if exclude_id else ""),
        (company_id, name, exclude_id) if exclude_id else (company_id, name),
    )
    return clash is not None


def upsert_built_in_role(
    membership: CompanyMembership,
    key: str,
    *,
    name: str,
    description: str | None,
    permissions: list[str],
) -> dict:
    if not is_built_in_role(key):
        raise InvitationError("invalid", "That role no longer exists.")
    clean_name = name.strip()
    if not clean_name:
        raise InvitationError("invalid", "Enter a role name.")
    keys = sanitize_role_permissions(key, permissions)
    if not keys:
        raise InvitationError("invalid", "Pick at least one permission.")
    current = fetch_one(
        "SELECT id, key FROM company_role WHERE company_id = %s AND key = %s",
        (membership.company_id, key),
    )
    if _name_taken(membership.company_id, clean_name, exclude_id=str(current["id"]) if current else None):
        raise InvitationError("invalid", "A role with that name already exists.")
    clean_description = (description or "").strip() or None
    if current:
        execute(
            "UPDATE company_role SET name = %s, description = %s, permissions = %s::jsonb "
            "WHERE id = %s AND company_id = %s",
            (clean_name, clean_description, json.dumps(keys), current["id"], membership.company_id),
        )
        return {
            "id": str(current["id"]),
            "key": key,
            "name": clean_name,
            "description": clean_description or "",
            "permissions": keys,
            "built_in": True,
        }
    row = fetch_one(
        """INSERT INTO company_role (company_id, key, name, description, permissions)
           VALUES (%s, %s, %s, %s, %s::jsonb)
           RETURNING id, key, name, description, permissions""",
        (membership.company_id, key, clean_name, clean_description, json.dumps(keys)),
    )
    if not row:
        raise InvitationError("invalid", "Could not save that role.")
    return _from_row(row, built_in=True)


def update_custom_role(membership: CompanyMembership, role_id: str, *, name: str, description: str | None, permissions: list[str]) -> dict:
    current = fetch_one(
        "SELECT id, key, name FROM company_role WHERE id = %s AND company_id = %s",
        (role_id, membership.company_id),
    )
    if not current:
        raise InvitationError("invalid", "That role no longer exists.")
    if is_built_in_role(str(current["key"])):
        return upsert_built_in_role(
            membership,
            str(current["key"]),
            name=name,
            description=description,
            permissions=permissions,
        )
    clean_name = name.strip()
    if not clean_name:
        raise InvitationError("invalid", "Enter a role name.")
    keys = sanitize_custom_permissions(permissions)
    if not keys:
        raise InvitationError("invalid", "Pick at least one permission.")
    if _name_taken(membership.company_id, clean_name, exclude_id=role_id):
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


def update_role(membership: CompanyMembership, role_id: str, *, name: str, description: str | None, permissions: list[str]) -> dict:
    if is_built_in_role(role_id):
        return upsert_built_in_role(
            membership,
            role_id,
            name=name,
            description=description,
            permissions=permissions,
        )
    return update_custom_role(
        membership,
        role_id,
        name=name,
        description=description,
        permissions=permissions,
    )


def delete_custom_role(membership: CompanyMembership, role_id: str) -> None:
    # A non-overridden built-in role's "id" (per list_roles) is its plain key
    # (e.g. "qs"), not a UUID — check before it reaches a uuid-typed column,
    # or Postgres raises InvalidTextRepresentation instead of a clean error.
    if is_built_in_role(role_id):
        raise InvitationError("invalid", "Built-in roles cannot be deleted.")
    current = fetch_one(
        "SELECT id, key FROM company_role WHERE id = %s AND company_id = %s",
        (role_id, membership.company_id),
    )
    if not current:
        raise InvitationError("invalid", "That role no longer exists.")
    if is_built_in_role(str(current["key"])):
        raise InvitationError("invalid", "Built-in roles cannot be deleted.")
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


def role_identity(company_id: str, role: str) -> tuple[str, str]:
    found = custom_role_row(company_id, role)
    if found:
        return str(found["name"]), str(found["description"] or "")
    if is_built_in_role(role):
        return ROLE_LABELS[role], ROLE_DESCRIPTIONS[role]
    return role_label(role), ""


def label_for_role(company_id: str, role: str) -> str:
    name, _description = role_identity(company_id, role)
    return name


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
    "role_identity",
    "permissions_for_membership",
    "update_custom_role",
    "update_role",
    "upsert_built_in_role",
]
