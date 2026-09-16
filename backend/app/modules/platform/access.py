"""Gate Pre / Takeoff / BOQ HTTP routes using Postgres membership and roles.
Clerk is only used to identify the signed-in user."""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request

from ...core.auth import CurrentUser, get_current_user
from ...core.rbac import WORKSPACE_SCOPED_ROLES
from ...database.connection import fetch_one
from .membership import CompanyMembership, get_company_membership
from .roles import permissions_for_membership


def required_permissions(method: str, path: str) -> list[str]:
    """Permissions of which the caller needs any one. Empty means company membership is enough."""
    write = method.upper() not in {"GET", "HEAD", "OPTIONS"}
    p = path.lower()

    if p.rstrip("/").endswith("/projects"):
        return ["pipeline:upload"] if write else []

    if "/boq" in p:
        if not write:
            return ["boq:view"]
        if "template" in p:
            return ["boq:templates_manage"]
        if "rate" in p:
            return ["boq:rates_manage"]
        if "export" in p:
            return ["boq:export"]
        return ["boq:add_item", "boq:rates_manage", "boq:templates_manage", "boq:unmeasured_input", "boq:export"]

    if "/review" in p:
        return ["review:confirm"] if write else ["review:view"]

    if any(token in p for token in ("/takeoff", "/floor-finishes", "/floor-works", "/floor-boundaries", "/roofs")):
        if not write:
            return ["takeoff:view"]
        if "dispute" in p or "resolve" in p:
            return ["takeoff:resolve_dispute"]
        return ["takeoff:edit"]

    if "/pre/freeze" in p and write:
        return ["pipeline:start_takeoff"]

    if "/documents" in p and write:
        return ["pipeline:upload"]

    if any(token in p for token in (
        "/pre", "/documents", "/triage", "/scale", "/heights", "/specs", "/spec-items",
        "/storeys", "/viewports", "/sheets", "/workflow", "/pages/", "/confirmations", "/renders",
    )):
        if write:
            return ["pipeline:configure"]
        return ["pipeline:configure", "takeoff:view"]

    if write:
        return ["pipeline:configure", "takeoff:edit"]
    return ["takeoff:view", "pipeline:configure", "review:view", "boq:view"]


def _lookup_project_id(request: Request) -> str | None:
    params = request.path_params
    if params.get("project_id"):
        return str(params["project_id"])
    from ...modules.pre.access import project_for_sheet, project_for_spec, project_for_storey, project_for_viewport

    if params.get("viewport_id"):
        return project_for_viewport(str(params["viewport_id"]))
    if params.get("sheet_id"):
        return project_for_sheet(str(params["sheet_id"]))
    if params.get("storey_id"):
        return project_for_storey(str(params["storey_id"]))
    if params.get("item_id"):
        return project_for_spec(str(params["item_id"]))
    if params.get("document_id"):
        row = fetch_one("SELECT project_id FROM document WHERE id = %s", (str(params["document_id"]),))
        return str(row["project_id"]) if row and row.get("project_id") else None
    if params.get("render_id"):
        row = fetch_one(
            """SELECT d.project_id FROM page_render pr JOIN page p ON p.id = pr.page_id
               JOIN document d ON d.id = p.document_id WHERE pr.id = %s""",
            (str(params["render_id"]),),
        )
        return str(row["project_id"]) if row and row.get("project_id") else None
    return None


def _company_owns_project(company_id: str, project_id: str) -> bool:
    row = fetch_one("SELECT id FROM project WHERE id = %s AND company_id = %s", (project_id, company_id))
    return row is not None


def ensure_project_company(request: Request, project_id: str | None) -> None:
    """For routes whose resource id comes from the request body rather than
    the URL path, so enforce_workspace_access's own path-param lookup can't
    see it (e.g. POST /viewports with sheet_id in the body, POST
    /confirmations with entity_id in the body). Call this once the handler
    has resolved project_id itself, before writing anything."""
    membership: CompanyMembership | None = getattr(request.state, "membership", None)
    if membership is None or project_id is None:
        return
    if not _company_owns_project(membership.company_id, project_id):
        raise HTTPException(status_code=404, detail="Project not found")


def _assigned_to_project(user_id: str, project_id: str) -> bool:
    row = fetch_one(
        "SELECT id FROM project_member WHERE project_id = %s AND user_id = %s",
        (project_id, user_id),
    )
    return row is not None


def enforce_workspace_access(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
) -> CompanyMembership:
    membership = get_company_membership(current_user.id)
    if membership is None:
        raise HTTPException(status_code=409, detail="onboarding_incomplete")

    request.state.current_user = current_user
    request.state.membership = membership

    needed = required_permissions(request.method, request.url.path)
    if needed:
        held = set(permissions_for_membership(membership))
        if held.isdisjoint(needed):
            raise HTTPException(status_code=403, detail="insufficient_permission")

    project_id = _lookup_project_id(request)
    if project_id:
        if not _company_owns_project(membership.company_id, project_id):
            raise HTTPException(status_code=404, detail="Project not found")
        if membership.role in WORKSPACE_SCOPED_ROLES and not _assigned_to_project(current_user.id, project_id):
            raise HTTPException(status_code=403, detail="insufficient_permission")

    return membership
