"""Role and permission model. Ported from quanto-onboard's lib/rbac.ts —
see docs/superpowers/specs/2026-09-16-org-auth-onboarding-design.md.
Roles and permissions are plain strings stored in company_member.role;
there is no Clerk Organizations concept behind them."""

ROLES: list[str] = [
    "admin",
    "chief_estimator",
    "qs",
    "technician",
    "qa_checker",
    "project_manager",
    "site_engineer",
    "viewer",
]

ROLE_LABELS: dict[str, str] = {
    "admin": "Owner / Admin",
    "chief_estimator": "Chief Estimator",
    "qs": "Quantity Surveyor",
    "technician": "Takeoff Technician",
    "qa_checker": "QA Checker",
    "project_manager": "Project Manager",
    "site_engineer": "Site Engineer",
    "viewer": "Client / Viewer",
}

# Promoting to admin is a confirmed role change, not an invite option.
ASSIGNABLE_ROLES: list[str] = [
    "chief_estimator",
    "qs",
    "technician",
    "qa_checker",
    "project_manager",
    "site_engineer",
    "viewer",
]

DEFAULT_INVITE_ROLE = "viewer"

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

# Which roles hold each permission (spec §4 matrix, ported 1:1).
PERMISSION_MATRIX: dict[str, list[str]] = {
    "pipeline:upload": ["admin", "chief_estimator", "qs", "technician"],
    "pipeline:configure": ["admin", "chief_estimator", "qs", "technician"],
    "pipeline:start_takeoff": ["admin", "chief_estimator", "qs", "technician"],
    "takeoff:edit": ["admin", "chief_estimator", "qs", "technician"],
    "takeoff:resolve_dispute": ["admin", "chief_estimator", "qa_checker"],
    "takeoff:view": ["admin", "chief_estimator", "qs", "technician", "qa_checker", "project_manager"],
    "review:confirm": ["admin", "chief_estimator", "qa_checker"],
    "review:view": ["admin", "chief_estimator", "qs", "technician", "qa_checker", "project_manager"],
    "boq:view": [
        "admin", "chief_estimator", "qs", "technician",
        "qa_checker", "project_manager", "site_engineer", "viewer",
    ],
    "boq:rates_manage": ["admin", "chief_estimator"],
    "boq:add_item": ["admin", "chief_estimator", "qs"],
    "boq:templates_manage": ["admin", "chief_estimator"],
    "boq:unmeasured_input": ["admin", "chief_estimator", "qs"],
    "boq:export": ["admin", "chief_estimator", "qs", "project_manager"],
    "company:manage": ["admin"],
    "members:manage": ["admin"],
    "billing:manage": ["admin"],
}


def permissions_for_role(role: str) -> list[str]:
    if role == "admin":
        return list(PERMISSION_MATRIX.keys())
    return [permission for permission, roles in PERMISSION_MATRIX.items() if role in roles]
