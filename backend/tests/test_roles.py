from app.modules.platform import roles
from app.modules.platform.invitations import InvitationError
from app.modules.platform.membership import CompanyMembership
import pytest

MEMBERSHIP = CompanyMembership(company_id="c1", company_name="Acme", role="admin")


def test_list_roles_includes_built_in_and_custom(monkeypatch):
    monkeypatch.setattr(
        roles,
        "fetch_all",
        lambda sql, params=(): [
            {"id": "r1", "key": "custom_site_qs", "name": "Site QS", "description": "Field QS", "permissions": ["takeoff:view", "boq:view"]},
        ],
    )
    result = roles.list_roles("c1")
    assert result[0]["key"] == "admin"
    assert result[0]["built_in"] is True
    custom = next(item for item in result if item["key"] == "custom_site_qs")
    assert custom["built_in"] is False
    assert "billing:manage" not in custom["permissions"]


def test_create_custom_role_writes_postgres_not_clerk(monkeypatch):
    monkeypatch.setattr(roles, "fetch_all", lambda sql, params=(): [])
    seen = {}

    def fake_one(sql, params=()):
        seen["sql"] = sql
        seen["params"] = params
        return {"id": "r1", "key": params[1], "name": params[2], "description": params[3], "permissions": ["boq:view"]}

    monkeypatch.setattr(roles, "fetch_one", fake_one)
    created = roles.create_custom_role(MEMBERSHIP, name="Site QS", description="Field", permissions=["boq:view", "billing:manage"])
    assert created["key"].startswith("custom_")
    assert "INSERT INTO company_role" in seen["sql"]
    assert "billing:manage" not in created["permissions"]


def test_create_custom_role_rejects_empty_permissions(monkeypatch):
    monkeypatch.setattr(roles, "fetch_all", lambda sql, params=(): [])
    with pytest.raises(InvitationError):
        roles.create_custom_role(MEMBERSHIP, name="Empty", description=None, permissions=["billing:manage"])


def test_delete_custom_role_blocked_when_assigned(monkeypatch):
    monkeypatch.setattr(
        roles,
        "fetch_one",
        lambda sql, params=(): {"id": "r1", "key": "custom_site_qs"} if "FROM company_role" in sql else {"user_id": "u2"},
    )
    with pytest.raises(InvitationError) as excinfo:
        roles.delete_custom_role(MEMBERSHIP, "r1")
    assert "Reassign" in excinfo.value.message


def test_permissions_for_membership_uses_custom_row(monkeypatch):
    monkeypatch.setattr(
        roles,
        "custom_role_row",
        lambda company_id, key: {"permissions": ["takeoff:view", "boq:view"]},
    )
    found = CompanyMembership(company_id="c1", company_name="Acme", role="custom_site_qs")
    assert roles.permissions_for_membership(found) == ["takeoff:view", "boq:view"]
