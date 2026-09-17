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


def test_list_roles_overlays_built_in_override(monkeypatch):
    monkeypatch.setattr(
        roles,
        "fetch_all",
        lambda sql, params=(): [
            {"id": "r-qs", "key": "qs", "name": "QS Lead", "description": "Field", "permissions": ["takeoff:view"]},
            {"id": "r1", "key": "custom_site_qs", "name": "Site QS", "description": "Field QS", "permissions": ["takeoff:view", "boq:view"]},
        ],
    )
    result = roles.list_roles("c1")
    qs = next(item for item in result if item["key"] == "qs")
    assert qs["built_in"] is True
    assert qs["id"] == "r-qs"
    assert qs["name"] == "QS Lead"
    custom = [item for item in result if not item["built_in"]]
    assert [item["key"] for item in custom] == ["custom_site_qs"]


def test_update_built_in_role_inserts_company_override(monkeypatch):
    seen = {}

    def fake_one(sql, params=()):
        if "INSERT INTO company_role" in sql:
            seen["sql"] = sql
            seen["params"] = params
            return {"id": "r-qs", "key": params[1], "name": params[2], "description": params[3], "permissions": ["takeoff:view"]}
        return None

    monkeypatch.setattr(roles, "fetch_one", fake_one)
    updated = roles.update_role(
        MEMBERSHIP,
        "qs",
        name="QS Lead",
        description="Field",
        permissions=["takeoff:view", "billing:manage"],
    )
    assert updated["built_in"] is True
    assert updated["key"] == "qs"
    assert updated["name"] == "QS Lead"
    assert "billing:manage" not in updated["permissions"]
    assert "INSERT INTO company_role" in seen["sql"]
    assert seen["params"][1] == "qs"


def test_update_admin_keeps_locked_permissions(monkeypatch):
    def fake_one(sql, params=()):
        if "INSERT INTO company_role" in sql:
            return {
                "id": "r-admin",
                "key": params[1],
                "name": params[2],
                "description": params[3],
                "permissions": ["takeoff:view"],
            }
        return None

    monkeypatch.setattr(roles, "fetch_one", fake_one)
    updated = roles.update_role(MEMBERSHIP, "admin", name="Owner", description=None, permissions=["takeoff:view"])
    assert updated["built_in"] is True
    for key in ("company:manage", "members:manage", "billing:manage", "takeoff:view"):
        assert key in updated["permissions"]


def test_permissions_for_membership_uses_built_in_override(monkeypatch):
    monkeypatch.setattr(
        roles,
        "custom_role_row",
        lambda company_id, key: {"permissions": ["takeoff:view"]} if key == "qs" else None,
    )
    found = CompanyMembership(company_id="c1", company_name="Acme", role="qs")
    assert roles.permissions_for_membership(found) == ["takeoff:view"]


def test_delete_built_in_role_rejected(monkeypatch):
    monkeypatch.setattr(roles, "fetch_one", lambda sql, params=(): {"id": "r-qs", "key": "qs"})
    with pytest.raises(InvitationError) as excinfo:
        roles.delete_custom_role(MEMBERSHIP, "r-qs")
    assert "cannot be deleted" in excinfo.value.message


def test_delete_built_in_role_by_plain_key_rejected_without_a_db_call(monkeypatch):
    """A non-overridden built-in role's id (per list_roles) is its plain key,
    e.g. "qs" - not a UUID. This must be rejected before any query runs
    against the uuid-typed company_role.id column, or Postgres raises
    InvalidTextRepresentation instead of a clean InvitationError."""
    def fail_if_called(sql, params=()):
        raise AssertionError("fetch_one should not be called for a plain built-in role key")

    monkeypatch.setattr(roles, "fetch_one", fail_if_called)
    with pytest.raises(InvitationError) as excinfo:
        roles.delete_custom_role(MEMBERSHIP, "qs")
    assert "cannot be deleted" in excinfo.value.message


def test_permissions_for_membership_uses_custom_row(monkeypatch):
    monkeypatch.setattr(
        roles,
        "custom_role_row",
        lambda company_id, key: {"permissions": ["takeoff:view", "boq:view"]},
    )
    found = CompanyMembership(company_id="c1", company_name="Acme", role="custom_site_qs")
    assert roles.permissions_for_membership(found) == ["takeoff:view", "boq:view"]


def test_role_identity_uses_built_in_copy(monkeypatch):
    monkeypatch.setattr(roles, "fetch_one", lambda *args, **kwargs: None)
    assert roles.role_identity("c1", "project_manager") == (
        "Project Manager",
        "Approves and submits, and does not touch measurements.",
    )


def test_role_identity_uses_custom_role_row(monkeypatch):
    monkeypatch.setattr(
        roles,
        "fetch_one",
        lambda *args, **kwargs: {
            "id": "r1",
            "key": "custom_site_qs",
            "name": "Site QS",
            "description": "Field QS",
            "permissions": ["takeoff:view"],
        },
    )
    assert roles.role_identity("c1", "custom_site_qs") == ("Site QS", "Field QS")
    assert roles.label_for_role("c1", "custom_site_qs") == "Site QS"
