from datetime import datetime, timezone

from fastapi import HTTPException
from starlette.requests import Request

from app.core.auth import CurrentUser
from app.modules.platform import access
from app.modules.platform.membership import CompanyMembership
from app.modules.platform.terms import CURRENT_TERMS_VERSION
import pytest

USER = CurrentUser(
    id="user_1",
    email="a@acme.com",
    full_name="A",
    terms_accepted_at=datetime.now(timezone.utc),
    terms_version=CURRENT_TERMS_VERSION,
)
ADMIN = CompanyMembership(company_id="c1", company_name="Acme", role="admin")
PROJECT_MANAGER = CompanyMembership(company_id="c1", company_name="Acme", role="project_manager")
PROJECT_ID = "11111111-1111-1111-1111-111111111111"
QA_CHECKER = CompanyMembership(company_id="c1", company_name="Acme", role="qa_checker")


def test_upload_requires_pipeline_upload():
    assert access.required_permissions("POST", "/api/v1/projects/p1/documents") == ["pipeline:upload"]


def test_freeze_requires_start_takeoff():
    assert access.required_permissions("POST", "/api/v1/projects/p1/pre/freeze") == ["pipeline:start_takeoff"]


def test_takeoff_write_requires_edit():
    assert access.required_permissions("POST", "/api/v1/projects/p1/takeoff/walls/analyze") == ["takeoff:edit"]


def test_boq_read_requires_view():
    assert access.required_permissions("GET", "/api/v1/projects/p1/boq") == ["boq:view"]


def _request(path: str, method: str = "GET", project_id: str | None = PROJECT_ID) -> Request:
    scope = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "client": ("test", 50000),
        "server": ("test", 80),
        "path_params": {"project_id": project_id} if project_id else {},
    }
    return Request(scope)


def test_enforce_allows_admin_on_owned_project(monkeypatch):
    monkeypatch.setattr(access, "get_company_membership", lambda user_id: ADMIN)
    monkeypatch.setattr(access, "_company_owns_project", lambda company_id, project_id: True)
    monkeypatch.setattr(access, "permissions_for_membership", lambda membership: ["takeoff:view"])
    result = access.enforce_workspace_access(_request("/api/v1/projects/p1/takeoff/walls"), USER)
    assert result.role == "admin"


def test_enforce_rejects_project_manager_on_takeoff_edit(monkeypatch):
    monkeypatch.setattr(access, "get_company_membership", lambda user_id: PROJECT_MANAGER)
    monkeypatch.setattr(access, "_company_owns_project", lambda company_id, project_id: True)
    monkeypatch.setattr(access, "permissions_for_membership", lambda membership: ["boq:view", "takeoff:view"])
    with pytest.raises(HTTPException) as excinfo:
        access.enforce_workspace_access(_request("/api/v1/projects/p1/takeoff/walls/analyze", method="POST"), USER)
    assert excinfo.value.status_code == 403


def test_invited_member_must_be_assigned_to_open_a_project(monkeypatch):
    monkeypatch.setattr(access, "get_company_membership", lambda user_id: QA_CHECKER)
    monkeypatch.setattr(access, "_company_owns_project", lambda company_id, project_id: True)
    monkeypatch.setattr(access, "permissions_for_membership", lambda membership: ["boq:view"])
    monkeypatch.setattr(access, "_assigned_to_project", lambda user_id, project_id: False)
    with pytest.raises(HTTPException) as excinfo:
        access.enforce_workspace_access(_request("/api/v1/projects/p1/boq"), USER)
    assert excinfo.value.status_code == 403


def test_invited_member_can_open_an_assigned_project(monkeypatch):
    monkeypatch.setattr(access, "get_company_membership", lambda user_id: QA_CHECKER)
    monkeypatch.setattr(access, "_company_owns_project", lambda company_id, project_id: True)
    monkeypatch.setattr(access, "permissions_for_membership", lambda membership: ["boq:view"])
    monkeypatch.setattr(access, "_assigned_to_project", lambda user_id, project_id: True)
    result = access.enforce_workspace_access(_request("/api/v1/projects/p1/boq"), USER)
    assert result.role == "qa_checker"


def _request_with_params(path: str, path_params: dict) -> Request:
    scope = {
        "type": "http",
        "asgi": {"spec_version": "2.3", "version": "3.0"},
        "http_version": "1.1",
        "method": "PATCH",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "headers": [],
        "client": ("test", 50000),
        "server": ("test", 80),
        "path_params": path_params,
    }
    return Request(scope)


def test_lookup_project_id_resolves_storey_id(monkeypatch):
    storey_id = "22222222-2222-2222-2222-222222222222"
    monkeypatch.setattr("app.modules.pre.access.project_for_storey", lambda storey_id: PROJECT_ID)
    result = access._lookup_project_id(_request_with_params(f"/api/v1/storeys/{storey_id}", {"storey_id": storey_id}))
    assert result == PROJECT_ID


def test_lookup_project_id_rejects_a_malformed_id_as_not_found():
    with pytest.raises(HTTPException) as excinfo:
        access._lookup_project_id(_request_with_params("/api/v1/storeys/not-a-uuid", {"storey_id": "not-a-uuid"}))
    assert excinfo.value.status_code == 404


def test_ensure_project_company_blocks_a_project_from_another_company(monkeypatch):
    request = _request_with_params("/api/v1/viewports", {})
    request.state.membership = ADMIN
    monkeypatch.setattr(access, "_company_owns_project", lambda company_id, project_id: False)
    with pytest.raises(HTTPException) as excinfo:
        access.ensure_project_company(request, "someone_elses_project")
    assert excinfo.value.status_code == 404


def test_ensure_project_company_allows_an_owned_project(monkeypatch):
    request = _request_with_params("/api/v1/viewports", {})
    request.state.membership = ADMIN
    monkeypatch.setattr(access, "_company_owns_project", lambda company_id, project_id: True)
    access.ensure_project_company(request, "p1")  # does not raise
