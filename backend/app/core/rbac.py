"""Role and permission model stored in this app's database.
Clerk is authentication and application invitations only — no Organizations,
no Clerk role objects, no Clerk permission keys."""
from __future__ import annotations

import re

ROLES: list[str] = [
    "admin",
    "chief_estimator",
    "qs",
    "qa_checker",
    "project_manager",
]

ROLE_LABELS: dict[str, str] = {
    "admin": "Owner / Admin",
    "chief_estimator": "Chief Estimator",
    "qs": "Quantity Surveyor",
    "qa_checker": "QA Checker",
    "project_manager": "Project Manager",
}

ROLE_DESCRIPTIONS: dict[str, str] = {
    "admin": "Company director or ops manager. Full access.",
    "chief_estimator": "Senior QS. Sets rates and final sign-off.",
    "qs": "Quantity Surveyor. Takeoff, bill items, and export. Rates and team admin stay with the Chief Estimator and Owner.",
    "qa_checker": "Independently verifies quantities before finalization.",
    "project_manager": "Approves and submits, and does not touch measurements.",
}

# Promoting to admin is a confirmed role change, not an invite option.
ASSIGNABLE_ROLES: list[str] = [
    "chief_estimator",
    "qs",
    "qa_checker",
    "project_manager",
]

DEFAULT_INVITE_ROLE = "qs"

PERMISSIONS: dict[str, str] = {
    "pipeline_upload": "pipeline:upload",
    "pipeline_configure": "pipeline:configure",
    "pipeline_start_takeoff": "pipeline:start_takeoff",
    "takeoff_edit": "takeoff:edit",
    "takeoff_resolve_dispute": "takeoff:resolve_dispute",
    "takeoff_view": "takeoff:view",
    "review_confirm": "review:confirm",
    "review_view": "review:view",
    "boq_view": "boq:view",
    "boq_rates_manage": "boq:rates_manage",
    "boq_add_item": "boq:add_item",
    "boq_templates_manage": "boq:templates_manage",
    "boq_unmeasured_input": "boq:unmeasured_input",
    "boq_export": "boq:export",
    "company_manage": "company:manage",
    "members_manage": "members:manage",
    "billing_manage": "billing:manage",
}

PERMISSION_MATRIX: dict[str, list[str]] = {
    "pipeline:upload": ["admin", "chief_estimator", "qs"],
    "pipeline:configure": ["admin", "chief_estimator", "qs"],
    "pipeline:start_takeoff": ["admin", "chief_estimator", "qs"],
    "takeoff:edit": ["admin", "chief_estimator", "qs"],
    "takeoff:resolve_dispute": ["admin", "chief_estimator", "qa_checker"],
    "takeoff:view": ["admin", "chief_estimator", "qs", "qa_checker", "project_manager"],
    "review:confirm": ["admin", "chief_estimator", "qa_checker"],
    "review:view": ["admin", "chief_estimator", "qs", "qa_checker", "project_manager"],
    "boq:view": ["admin", "chief_estimator", "qs", "qa_checker", "project_manager"],
    "boq:rates_manage": ["admin", "chief_estimator"],
    "boq:add_item": ["admin", "chief_estimator", "qs"],
    "boq:templates_manage": ["admin", "chief_estimator"],
    "boq:unmeasured_input": ["admin", "chief_estimator", "qs"],
    "boq:export": ["admin", "chief_estimator", "qs", "project_manager"],
    "company:manage": ["admin"],
    "members:manage": ["admin"],
    "billing:manage": ["admin"],
}

ALL_PERMISSIONS: list[str] = list(PERMISSION_MATRIX.keys())
CUSTOM_ROLE_PERMISSIONS: list[str] = [key for key in ALL_PERMISSIONS if key != "billing:manage"]
CUSTOM_ROLE_PREFIX = "custom_"
MAX_CUSTOM_ROLES = 20


def is_project_scoped(role: str) -> bool:
    """Owners see every project. Everyone else only sees projects they were added to."""
    return role != "admin"


def is_built_in_role(role: str) -> bool:
    return role in ROLE_LABELS


def is_custom_role_key(role: str) -> bool:
    return role.startswith(CUSTOM_ROLE_PREFIX)


def slug_to_custom_role_key(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")[:24]
    return f"{CUSTOM_ROLE_PREFIX}{slug or 'role'}"


def unique_custom_role_key(name: str, taken: list[str]) -> str:
    taken_set = set(taken) | set(ROLES)
    base = slug_to_custom_role_key(name)
    if base not in taken_set:
        return base
    prefix_len = len(CUSTOM_ROLE_PREFIX) + 21
    for index in range(2, 100):
        candidate = f"{base[:prefix_len]}_{index}"
        if candidate not in taken_set:
            return candidate
    return f"{base}_{len(taken_set)}"


def permissions_for_role(role: str) -> list[str]:
    if role == "admin":
        return list(ALL_PERMISSIONS)
    return [permission for permission, roles in PERMISSION_MATRIX.items() if role in roles]


def sanitize_custom_permissions(keys: list[str] | None) -> list[str]:
    allowed = set(CUSTOM_ROLE_PERMISSIONS)
    seen: list[str] = []
    for key in keys or []:
        if key in allowed and key not in seen:
            seen.append(key)
    return seen


def role_label(role: str, custom_name: str | None = None) -> str:
    if custom_name:
        return custom_name
    return ROLE_LABELS.get(role, role)
