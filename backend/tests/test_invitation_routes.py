from fastapi.testclient import TestClient

from app.api.v1.routes import platform
from app.core.auth import CurrentUser, get_current_user
from app.main import app
from app.modules.platform import membership as membership_mod
from app.modules.platform.invitations import ClaimResult, InvitationError, InviteFailure, SendInvitesResult
from app.modules.platform.membership import CompanyMembership

client = TestClient(app)
USER = CurrentUser(id="user_1", email="owner@acme.com", full_name="A")
ADMIN = CompanyMembership(company_id="c1", company_name="Acme", role="admin")
VIEWER = CompanyMembership(company_id="c1", company_name="Acme", role="viewer")


def _auth():
    app.dependency_overrides[get_current_user] = lambda: USER


def _clear():
    app.dependency_overrides.clear()


def test_send_invites_requires_authentication():
    response = client.post("/api/v1/platform/invitations", json={"invites": []})
    assert response.status_code == 401


def test_send_invites_forbidden_without_members_manage(monkeypatch):
    _auth()
    monkeypatch.setattr(membership_mod, "get_company_membership", lambda user_id: VIEWER)
    response = client.post("/api/v1/platform/invitations", json={"invites": [{"email": "a@x.com", "role": "qs"}]})
    _clear()
    assert response.status_code == 403


def test_send_invites_returns_sent_and_failures(monkeypatch):
    _auth()
    monkeypatch.setattr(membership_mod, "get_company_membership", lambda user_id: ADMIN)

    def fake_send(user, membership, rows):
        assert user.id == "user_1"
        assert membership.company_id == "c1"
        assert rows[0]["email"] == "join@acme.com"
        return SendInvitesResult(sent=1, failures=[InviteFailure(email="bad@x.com", reason="Pick an assignable role.")])

    monkeypatch.setattr(platform, "send_invites", fake_send)
    response = client.post(
        "/api/v1/platform/invitations",
        json={"invites": [{"email": "join@acme.com", "role": "qs"}]},
    )
    _clear()
    assert response.status_code == 200
    body = response.json()
    assert body["sent"] == 1
    assert body["failures"] == [{"email": "bad@x.com", "reason": "Pick an assignable role."}]


def test_claim_requires_authentication():
    response = client.post("/api/v1/platform/invitations/claim", json={})
    assert response.status_code == 401


def test_claim_returns_payload(monkeypatch):
    _auth()
    monkeypatch.setattr(
        platform,
        "claim_invitation",
        lambda user, token=None: ClaimResult(claimed=True, company_id="c1", company_name="Acme", role="qs"),
    )
    response = client.post("/api/v1/platform/invitations/claim", json={})
    _clear()
    assert response.status_code == 200
    assert response.json() == {
        "claimed": True,
        "already_member": False,
        "company_id": "c1",
        "company_name": "Acme",
        "role": "qs",
    }


def test_claim_maps_expired(monkeypatch):
    _auth()

    def boom(user, token=None):
        raise InvitationError("expired", "This invitation has expired.")

    monkeypatch.setattr(platform, "claim_invitation", boom)
    response = client.post("/api/v1/platform/invitations/claim", json={"token": "x"})
    _clear()
    assert response.status_code == 410
    assert response.json()["detail"]["code"] == "expired"
