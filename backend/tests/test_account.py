from contextlib import contextmanager

import pytest

from app.core.auth import CurrentUser
from app.core.clerk_client import ClerkApiError
from app.modules.platform import account
from app.modules.platform.invitations import InvitationError
from app.modules.platform.membership import CompanyMembership

USER = CurrentUser(id="user_1", email="owner@acme.com", full_name="Owner")
ADMIN = CompanyMembership(company_id="c1", company_name="Acme", role="admin")
QS = CompanyMembership(company_id="c1", company_name="Acme", role="qs")


class FakeConn:
    def __init__(self):
        self.calls = []

    def execute(self, sql, params=None):
        self.calls.append((sql, params))


def patch_tx(monkeypatch, conn):
    @contextmanager
    def fake_transaction():
        yield conn

    monkeypatch.setattr(account, "transaction", fake_transaction)


def test_confirm_name_matches_is_case_insensitive():
    assert account.confirm_name_matches("  Acme  ", "acme")
    assert not account.confirm_name_matches("Acme Co", "Acme")


def test_deletion_status_is_free_without_a_company(monkeypatch):
    monkeypatch.setattr(account, "get_company_membership", lambda user_id: None)
    assert account.account_deletion_status("user_1") == {"kind": "free"}


def test_deletion_status_is_free_for_a_non_admin(monkeypatch):
    monkeypatch.setattr(account, "get_company_membership", lambda user_id: QS)
    monkeypatch.setattr(
        account,
        "fetch_all",
        lambda sql, params=(): [
            {"user_id": "user_1", "role": "qs"},
            {"user_id": "user_admin", "role": "admin"},
        ],
    )
    assert account.account_deletion_status("user_1") == {"kind": "free"}


def test_deletion_status_is_free_when_another_admin_remains(monkeypatch):
    monkeypatch.setattr(account, "get_company_membership", lambda user_id: ADMIN)
    monkeypatch.setattr(
        account,
        "fetch_all",
        lambda sql, params=(): [
            {"user_id": "user_1", "role": "admin"},
            {"user_id": "user_2", "role": "admin"},
        ],
    )
    assert account.account_deletion_status("user_1") == {"kind": "free"}


def test_deletion_status_flags_the_last_admin(monkeypatch):
    monkeypatch.setattr(account, "get_company_membership", lambda user_id: ADMIN)
    monkeypatch.setattr(
        account,
        "fetch_all",
        lambda sql, params=(): [
            {"user_id": "user_1", "role": "admin"},
            {"user_id": "user_2", "role": "qs"},
            {"user_id": "user_3", "role": "qa_checker"},
        ],
    )
    assert account.account_deletion_status("user_1") == {
        "kind": "last-admin",
        "company_name": "Acme",
        "other_members": 2,
    }


def test_deletion_status_flags_a_solo_owner(monkeypatch):
    monkeypatch.setattr(account, "get_company_membership", lambda user_id: ADMIN)
    monkeypatch.setattr(
        account,
        "fetch_all",
        lambda sql, params=(): [{"user_id": "user_1", "role": "admin"}],
    )
    assert account.account_deletion_status("user_1") == {
        "kind": "last-admin",
        "company_name": "Acme",
        "other_members": 0,
    }


def test_delete_company_requires_the_typed_name(monkeypatch):
    monkeypatch.setattr(account, "fetch_one", lambda sql, params=(): {"name": "Acme"})
    with pytest.raises(InvitationError) as excinfo:
        account.delete_company(ADMIN, "Wrong")
    assert excinfo.value.field == "confirmName"


def test_delete_company_excludes_the_actor_from_displacement(monkeypatch):
    monkeypatch.setattr(account, "fetch_one", lambda sql, params=(): {"name": "Acme"})
    seen = {}
    monkeypatch.setattr(
        account,
        "teardown_company",
        lambda company_id, except_user_id=None: seen.update(company_id=company_id, except_user_id=except_user_id),
    )
    account.delete_company(ADMIN, "acme", actor_user_id="user_admin")
    assert seen == {"company_id": "c1", "except_user_id": "user_admin"}


def test_delete_company_removes_projects_then_the_company(monkeypatch):
    monkeypatch.setattr(account, "fetch_one", lambda sql, params=(): {"name": "Acme"})
    monkeypatch.setattr(account, "fetch_all", lambda sql, params=(): [])
    conn = FakeConn()
    patch_tx(monkeypatch, conn)
    account.delete_company(ADMIN, "acme")
    assert any("INSERT INTO former_member" in sql for sql, _ in conn.calls)
    assert any("DELETE FROM project" in sql for sql, _ in conn.calls)
    assert any("DELETE FROM company" in sql for sql, _ in conn.calls)


def test_teardown_company_purges_every_project_file_folder(monkeypatch):
    # Every child table cascades from project_id, but source PDFs, page
    # renders, and each takeoff module's own on-disk folder live under
    # storage_root/<project_id>/, not in Postgres - deleting the row alone
    # never removed them until this was added.
    monkeypatch.setattr(account, "fetch_one", lambda sql, params=(): {"name": "Acme"})
    monkeypatch.setattr(
        account,
        "fetch_all",
        lambda sql, params=(): [{"id": "p1"}, {"id": "p2"}] if "FROM project" in sql else [],
    )
    patch_tx(monkeypatch, FakeConn())
    purged = []
    monkeypatch.setattr(account, "purge_project_files", lambda project_id: purged.append(project_id))
    monkeypatch.setattr(account, "purge_company_files", lambda company_id: None)
    account.teardown_company("c1")
    assert sorted(purged) == ["p1", "p2"]


def test_delete_my_account_last_admin_requires_confirm_name(monkeypatch):
    monkeypatch.setattr(
        account,
        "account_deletion_status",
        lambda user_id: {"kind": "last-admin", "company_name": "Acme", "other_members": 1},
    )
    monkeypatch.setattr(account, "get_company_membership", lambda user_id: ADMIN)
    with pytest.raises(InvitationError) as excinfo:
        account.delete_my_account(USER, confirm_name=None)
    assert excinfo.value.field == "confirmName"


def test_delete_my_account_last_admin_tears_down_then_deletes_clerk_user(monkeypatch):
    monkeypatch.setattr(
        account,
        "account_deletion_status",
        lambda user_id: {"kind": "last-admin", "company_name": "Acme", "other_members": 0},
    )
    monkeypatch.setattr(account, "get_company_membership", lambda user_id: ADMIN)
    seen = {"teardown": False, "clerk": None, "except_user_id": None, "execute": []}
    monkeypatch.setattr(
        account,
        "teardown_company",
        lambda company_id, except_user_id=None: seen.update(teardown=True, except_user_id=except_user_id),
    )
    monkeypatch.setattr(account, "execute", lambda sql, params=(): seen["execute"].append(sql))
    monkeypatch.setattr(account, "delete_user", lambda user_id: seen.update(clerk=user_id))
    account.delete_my_account(USER, confirm_name="Acme")
    assert seen["teardown"] is True
    assert seen["except_user_id"] == "user_1"
    assert seen["clerk"] == "user_1"
    assert any("deleted_at" in sql for sql in seen["execute"])


def test_delete_my_account_free_member_leaves_the_company(monkeypatch):
    monkeypatch.setattr(account, "account_deletion_status", lambda user_id: {"kind": "free"})
    monkeypatch.setattr(account, "get_company_membership", lambda user_id: QS)
    conn = FakeConn()
    patch_tx(monkeypatch, conn)
    seen = {}
    monkeypatch.setattr(account, "execute", lambda sql, params=(): seen.setdefault("sql", sql))
    monkeypatch.setattr(account, "delete_user", lambda user_id: seen.setdefault("clerk", user_id))
    account.delete_my_account(USER)
    assert any("DELETE FROM company_member" in sql for sql, _ in conn.calls)
    assert any("INSERT INTO former_member" in sql for sql, _ in conn.calls)
    assert seen["clerk"] == "user_1"
    assert "deleted_at" in seen["sql"]


def test_delete_my_account_aborts_when_leave_fails(monkeypatch):
    monkeypatch.setattr(account, "account_deletion_status", lambda user_id: {"kind": "free"})
    monkeypatch.setattr(account, "get_company_membership", lambda user_id: QS)

    def boom(*args, **kwargs):
        raise RuntimeError("former_member missing company_name")

    monkeypatch.setattr(account, "_leave_company", boom)
    monkeypatch.setattr(account, "execute", lambda sql, params=(): (_ for _ in ()).throw(AssertionError("must not soft-delete")))
    monkeypatch.setattr(account, "delete_user", lambda user_id: (_ for _ in ()).throw(AssertionError("must not delete Clerk")))
    with pytest.raises(InvitationError) as excinfo:
        account.delete_my_account(USER)
    assert "leave your company" in excinfo.value.message


def test_delete_my_account_surfaces_clerk_failure(monkeypatch):
    monkeypatch.setattr(account, "account_deletion_status", lambda user_id: {"kind": "free"})
    monkeypatch.setattr(account, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(account, "execute", lambda sql, params=(): None)

    def boom(user_id):
        raise ClerkApiError("nope")

    monkeypatch.setattr(account, "delete_user", boom)
    with pytest.raises(InvitationError) as excinfo:
        account.delete_my_account(USER)
    assert "Could not delete your account" in excinfo.value.message
