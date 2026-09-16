from fastapi.testclient import TestClient

from app.api.v1.routes import platform
from app.core.auth import CurrentUser, get_current_user
from app.main import app
from app.modules.platform import membership as membership_mod
from app.modules.platform.invitations import SendInvitesResult
from app.modules.platform.membership import CompanyMembership

client = TestClient(app)
USER = CurrentUser(id="user_1", email="owner@acme.com", full_name="A")
ADMIN = CompanyMembership(company_id="c1", company_name="Acme", role="admin")


def _auth():
    app.dependency_overrides[get_current_user] = lambda: USER


def _clear():
    app.dependency_overrides.clear()


def test_list_members_requires_auth():
    assert client.get("/api/v1/platform/company/members").status_code == 401


def test_list_members_returns_directory(monkeypatch):
    _auth()
    monkeypatch.setattr(membership_mod, "get_company_membership", lambda user_id: ADMIN)
    monkeypatch.setattr(
        platform,
        "list_members",
        lambda company_id: [{"id": "user_1", "email": "owner@acme.com", "full_name": "A", "role": "admin", "role_label": "Owner / Admin", "created_at": None}],
    )
    monkeypatch.setattr(
        platform,
        "list_pending_invitations",
        lambda company_id: [{"id": "inv-1", "email": "join@acme.com", "role": "qs", "workspace_ids": [], "expires_at": None, "created_at": None}],
    )
    response = client.get("/api/v1/platform/company/members")
    _clear()
    assert response.status_code == 200
    body = response.json()
    assert body["members"][0]["role"] == "admin"
    assert body["invitations"][0]["email"] == "join@acme.com"


def test_revoke_invite_route(monkeypatch):
    _auth()
    monkeypatch.setattr(membership_mod, "get_company_membership", lambda user_id: ADMIN)
    seen = {}
    monkeypatch.setattr(platform, "revoke_invite", lambda membership, invitation_id: seen.setdefault("id", invitation_id))
    response = client.post("/api/v1/platform/invitations/inv-1/revoke")
    _clear()
    assert response.status_code == 204
    assert seen["id"] == "inv-1"


def test_resend_invite_route(monkeypatch):
    _auth()
    monkeypatch.setattr(membership_mod, "get_company_membership", lambda user_id: ADMIN)
    monkeypatch.setattr(
        platform,
        "resend_invite",
        lambda user, membership, invitation_id: SendInvitesResult(sent=1, failures=[]),
    )
    response = client.post("/api/v1/platform/invitations/inv-1/resend")
    _clear()
    assert response.status_code == 200
    assert response.json()["sent"] == 1
