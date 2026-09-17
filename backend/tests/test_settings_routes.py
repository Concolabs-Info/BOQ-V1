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


def test_list_roles_route(monkeypatch):
    _auth()
    monkeypatch.setattr(membership_mod, "get_company_membership", lambda user_id: ADMIN)
    monkeypatch.setattr(
        platform,
        "list_roles",
        lambda company_id: [{"id": "admin", "key": "admin", "name": "Owner / Admin", "description": "", "permissions": ["company:manage"], "built_in": True}],
    )
    response = client.get("/api/v1/platform/company/roles")
    _clear()
    assert response.status_code == 200
    assert response.json()["roles"][0]["key"] == "admin"


def test_create_role_route(monkeypatch):
    _auth()
    monkeypatch.setattr(membership_mod, "get_company_membership", lambda user_id: ADMIN)
    monkeypatch.setattr(
        platform,
        "create_custom_role",
        lambda membership, **kwargs: {
            "id": "r1",
            "key": "custom_site_qs",
            "name": kwargs["name"],
            "description": kwargs.get("description") or "",
            "permissions": ["boq:view"],
            "built_in": False,
        },
    )
    response = client.post("/api/v1/platform/company/roles", json={"name": "Site QS", "permissions": ["boq:view"]})
    _clear()
    assert response.status_code == 201
    assert response.json()["key"] == "custom_site_qs"


def test_update_built_in_role_route(monkeypatch):
    _auth()
    monkeypatch.setattr(membership_mod, "get_company_membership", lambda user_id: ADMIN)
    seen = {}
    monkeypatch.setattr(
        platform,
        "update_role",
        lambda membership, role_id, **kwargs: seen.update(role_id=role_id, **kwargs) or {
            "id": "r-qs",
            "key": "qs",
            "name": kwargs["name"],
            "description": kwargs.get("description") or "",
            "permissions": kwargs["permissions"],
            "built_in": True,
        },
    )
    response = client.patch(
        "/api/v1/platform/company/roles/qs",
        json={"name": "QS Lead", "description": "Field", "permissions": ["takeoff:view"]},
    )
    _clear()
    assert response.status_code == 200
    assert response.json()["built_in"] is True
    assert seen["role_id"] == "qs"


def test_account_deletion_status_route(monkeypatch):
    _auth()
    monkeypatch.setattr(
        platform,
        "account_deletion_status",
        lambda user_id: {"kind": "last-admin", "company_name": "Acme", "other_members": 1},
    )
    response = client.get("/api/v1/platform/account/deletion-status")
    _clear()
    assert response.status_code == 200
    assert response.json() == {"kind": "last-admin", "company_name": "Acme", "other_members": 1}


def test_delete_account_route(monkeypatch):
    _auth()
    seen = {}
    monkeypatch.setattr(
        platform,
        "delete_my_account",
        lambda user, confirm_name=None: seen.update(user=user.id, confirm_name=confirm_name),
    )
    response = client.request("DELETE", "/api/v1/platform/account", json={"confirm_name": "Acme"})
    _clear()
    assert response.status_code == 204
    assert seen == {"user": "user_1", "confirm_name": "Acme"}


def test_delete_company_requires_billing_manage(monkeypatch):
    _auth()
    monkeypatch.setattr(
        membership_mod,
        "get_company_membership",
        lambda user_id: CompanyMembership(company_id="c1", company_name="Acme", role="qs"),
    )
    response = client.request("DELETE", "/api/v1/platform/company", json={"confirm_name": "Acme"})
    _clear()
    assert response.status_code == 403


def test_delete_company_route(monkeypatch):
    _auth()
    monkeypatch.setattr(membership_mod, "get_company_membership", lambda user_id: ADMIN)
    seen = {}
    monkeypatch.setattr(platform, "delete_company", lambda membership, confirm_name: seen.update(confirm_name=confirm_name))
    response = client.request("DELETE", "/api/v1/platform/company", json={"confirm_name": "Acme"})
    _clear()
    assert response.status_code == 204
    assert seen["confirm_name"] == "Acme"
