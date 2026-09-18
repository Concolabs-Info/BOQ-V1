from app.core.auth import CurrentUser
from app.modules.platform import members
from app.modules.platform.invitations import InvitationError
from app.modules.platform.membership import CompanyMembership
import pytest

ACTOR = CurrentUser(id="user_admin", email="owner@acme.com", full_name="Owner")
MEMBERSHIP = CompanyMembership(company_id="c1", company_name="Acme", role="admin")


def test_list_members_maps_role_labels(monkeypatch):
    def fake_all(sql, params=()):
        if "project_member" in sql:
            return [{"user_id": "user_2", "project_id": "p1"}]
        return [
            {"id": "user_admin", "email": "owner@acme.com", "full_name": "Owner", "role": "admin", "created_at": None, "custom_role_name": None},
            {"id": "user_2", "email": "qs@acme.com", "full_name": "Pat", "role": "qs", "created_at": None, "custom_role_name": None},
        ]

    monkeypatch.setattr(members, "fetch_all", fake_all)
    result = members.list_members("c1")
    assert result[0]["role_label"] == "Owner / Admin"
    assert result[1]["role_label"] == "Quantity Surveyor"
    assert result[1]["workspace_ids"] == ["p1"]


def test_update_member_role_rejects_self():
    with pytest.raises(InvitationError) as excinfo:
        members.update_member_role(ACTOR, MEMBERSHIP, "user_admin", "qs")
    assert "own role" in excinfo.value.message


def test_update_member_role_allows_promotion_to_admin(monkeypatch):
    from app.modules.platform import roles as roles_mod

    monkeypatch.setattr(members, "fetch_one", lambda sql, params=(): {"user_id": "user_2", "role": "qs"})
    monkeypatch.setattr(roles_mod, "custom_role_row", lambda company_id, key: None)
    seen = {}
    monkeypatch.setattr(members, "execute", lambda sql, params=(): seen.update(sql=sql, params=params))
    result = members.update_member_role(ACTOR, MEMBERSHIP, "user_2", "admin")
    assert result["role"] == "admin"
    assert result["role_label"] == "Owner / Admin"
    assert seen["params"] == ("admin", MEMBERSHIP.company_id, "user_2")


def test_update_member_role_rejects_an_unknown_role(monkeypatch):
    monkeypatch.setattr(members, "fetch_one", lambda sql, params=(): {"user_id": "user_2", "role": "qs"})
    with pytest.raises(InvitationError) as excinfo:
        members.update_member_role(ACTOR, MEMBERSHIP, "user_2", "not_a_real_role")
    assert "Unknown role" in excinfo.value.message


def test_update_member_role_rejects_last_admin(monkeypatch):
    calls = {"n": 0}

    def fake_fetch(sql, params=()):
        calls["n"] += 1
        if calls["n"] == 1:
            return {"user_id": "user_2", "role": "admin"}
        return {"n": 1}

    monkeypatch.setattr(members, "fetch_one", fake_fetch)
    with pytest.raises(InvitationError) as excinfo:
        members.update_member_role(ACTOR, MEMBERSHIP, "user_2", "qs")
    assert "at least one admin" in excinfo.value.message


def test_remove_member_writes_former_member(monkeypatch):
    calls = {"n": 0}

    def fake_fetch(sql, params=()):
        calls["n"] += 1
        if "count(*)" in sql:
            return {"n": 2}
        return {"user_id": "user_2", "role": "qs"}

    monkeypatch.setattr(members, "fetch_one", fake_fetch)
    recorded = []

    class FakeConn:
        def execute(self, sql, params=None):
            recorded.append(sql)

    from contextlib import contextmanager

    @contextmanager
    def fake_tx():
        yield FakeConn()

    monkeypatch.setattr(members, "transaction", fake_tx)
    members.remove_member(ACTOR, MEMBERSHIP, "user_2")
    assert any("former_member" in sql for sql in recorded)
    assert any("DELETE FROM company_member" in sql for sql in recorded)


def test_assign_to_project_rejects_a_malformed_project_id_without_a_db_call(monkeypatch):
    def fail_if_called(sql, params=()):
        raise AssertionError("fetch_one should not be called for a non-uuid project id")

    monkeypatch.setattr(members, "fetch_one", fail_if_called)
    with pytest.raises(InvitationError):
        members.assign_to_project(MEMBERSHIP, "user_2", "not-a-uuid")


def test_unassign_from_project_rejects_a_malformed_project_id_without_a_db_call(monkeypatch):
    def fail_if_called(sql, params=()):
        raise AssertionError("fetch_one should not be called for a non-uuid project id")

    monkeypatch.setattr(members, "fetch_one", fail_if_called)
    with pytest.raises(InvitationError):
        members.unassign_from_project(MEMBERSHIP, "user_2", "not-a-uuid")
