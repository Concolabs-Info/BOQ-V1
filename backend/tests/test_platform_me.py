from fastapi.testclient import TestClient

from app.api.v1.routes import platform
from app.core.auth import CurrentUser, get_current_user
from app.main import app
from app.modules.platform.membership import CompanyMembership

client = TestClient(app)


def test_me_reports_no_organization_when_not_a_member(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="user_1", email="a@example.com", full_name="A")
    monkeypatch.setattr(platform, "get_company_membership", lambda user_id: None)

    response = client.get("/api/v1/platform/me")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["user"] == {"id": "user_1", "email": "a@example.com", "full_name": "A", "role": "none", "status": "active"}
    assert body["organization"] is None
    assert body["membership_role"] is None
    assert body["permissions"] == []
    assert body["is_super_admin"] is False


def test_me_reports_the_company_and_permissions_for_a_member(monkeypatch):
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="user_1", email="a@example.com", full_name="A")
    monkeypatch.setattr(
        platform,
        "get_company_membership",
        lambda user_id: CompanyMembership(company_id="c1", company_name="Acme", role="admin"),
    )

    response = client.get("/api/v1/platform/me")
    app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["organization"] == {"id": "c1", "name": "Acme", "status": "active", "membership_role": "admin"}
    assert body["membership_role"] == "admin"
    assert "company:manage" in body["permissions"]


def test_me_requires_authentication():
    response = client.get("/api/v1/platform/me")
    assert response.status_code == 401
