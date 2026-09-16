from fastapi import HTTPException
from starlette.requests import Request

from app.core.auth import CurrentUser
from app.modules.platform import access
from app.modules.platform.membership import CompanyMembership
import pytest

USER = CurrentUser(id="user_1", email="a@acme.com", full_name="A")
ADMIN = CompanyMembership(company_id="c1", company_name="Acme", role="admin")
VIEWER = CompanyMembership(company_id="c1", company_name="Acme", role="viewer")


def test_upload_requires_pipeline_upload():
    assert access.required_permissions("POST", "/api/v1/projects/p1/documents") == ["pipeline:upload"]


def test_freeze_requires_start_takeoff():
    assert access.required_permissions("POST", "/api/v1/projects/p1/pre/freeze") == ["pipeline:start_takeoff"]


def test_takeoff_write_requires_edit():
    assert access.required_permissions("POST", "/api/v1/projects/p1/takeoff/walls/analyze") == ["takeoff:edit"]


def test_boq_read_requires_view():
    assert access.required_permissions("GET", "/api/v1/projects/p1/boq") == ["boq:view"]


def _request(path: str, method: str = "GET", project_id: str | None = "p1") -> Request:
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
    result = access.enforce_workspace_access(_request("/api/v1/projects/p1/takeoff/walls"), USER)
    assert result.role == "admin"


def test_enforce_rejects_viewer_on_takeoff(monkeypatch):
    monkeypatch.setattr(access, "get_company_membership", lambda user_id: VIEWER)
    monkeypatch.setattr(access, "_company_owns_project", lambda company_id, project_id: True)
    monkeypatch.setattr(access, "_assigned_to_project", lambda user_id, project_id: True)
    with pytest.raises(HTTPException) as excinfo:
        access.enforce_workspace_access(_request("/api/v1/projects/p1/takeoff/walls"), USER)
    assert excinfo.value.status_code == 403


def test_enforce_scopes_viewer_to_assigned_projects(monkeypatch):
    monkeypatch.setattr(access, "get_company_membership", lambda user_id: VIEWER)
    monkeypatch.setattr(access, "_company_owns_project", lambda company_id, project_id: True)
    monkeypatch.setattr(access, "_assigned_to_project", lambda user_id, project_id: False)
    with pytest.raises(HTTPException) as excinfo:
        access.enforce_workspace_access(_request("/api/v1/projects/p1/boq"), USER)
    assert excinfo.value.status_code == 403
