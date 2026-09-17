from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

import pytest

from app.core.auth import CurrentUser
from app.core.clerk_client import ClerkApiError
from app.modules.platform import invitations
from app.modules.platform.membership import CompanyMembership

ADMIN = CurrentUser(id="user_admin", email="owner@acme.com", full_name="Owner")
GUEST = CurrentUser(id="user_guest", email="join@acme.com", full_name="Join")
MEMBERSHIP = CompanyMembership(company_id="c1", company_name="Acme", role="admin")


class FakeResult:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class FakeConn:
    def __init__(self, *, insert_id="inv-1", fail=None):
        self.calls = []
        self.insert_id = insert_id
        self.fail = fail

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        if self.fail:
            raise self.fail
        if "INSERT INTO invitation" in sql:
            return FakeResult({"id": self.insert_id})
        return FakeResult(None)


def patch_tx(monkeypatch, conn):
    @contextmanager
    def fake_transaction():
        yield conn

    monkeypatch.setattr(invitations, "transaction", fake_transaction)


def test_hash_invite_token_is_stable():
    assert invitations.hash_invite_token("abc") == invitations.hash_invite_token("abc")
    assert invitations.hash_invite_token("abc") != invitations.hash_invite_token("abd")


def test_resolve_invite_role_rejects_admin():
    assert invitations.resolve_invite_role("admin") == ""
    assert invitations.resolve_invite_role("qs") == "qs"
    assert invitations.resolve_invite_role(None) == "qs"


def test_send_invites_skips_blank_emails(monkeypatch):
    monkeypatch.setattr(invitations, "invitation_redirect_url", lambda: "http://localhost:3000/sign-up")
    result = invitations.send_invites(ADMIN, MEMBERSHIP, [{"email": "  ", "role": "qs"}])
    assert result.sent == 0
    assert result.failures == []


def test_send_invites_rejects_admin_role(monkeypatch):
    monkeypatch.setattr(invitations, "invitation_redirect_url", lambda: "http://localhost:3000/sign-up")
    result = invitations.send_invites(ADMIN, MEMBERSHIP, [{"email": "join@acme.com", "role": "admin"}])
    assert result.sent == 0
    assert result.failures[0].reason == "Pick an assignable role."


def test_send_invites_rejects_existing_member_email(monkeypatch):
    monkeypatch.setattr(invitations, "invitation_redirect_url", lambda: "http://localhost:3000/sign-up")
    monkeypatch.setattr(invitations, "_email_already_in_a_company", lambda email: True)
    result = invitations.send_invites(ADMIN, MEMBERSHIP, [{"email": "join@acme.com", "role": "qs"}])
    assert result.failures[0].reason == "That person already belongs to a company."


def test_send_invites_inserts_hashed_token_and_calls_clerk(monkeypatch):
    monkeypatch.setattr(invitations, "invitation_redirect_url", lambda: "http://localhost:3000/sign-up")
    monkeypatch.setattr(invitations, "_email_already_in_a_company", lambda email: False)
    monkeypatch.setattr(invitations, "owned_workspace_ids", lambda company_id, ids: [])
    monkeypatch.setattr(invitations, "new_invite_token", lambda: "plain-token")
    seen = {}

    def fake_create(email, *, redirect_url, public_metadata=None, expires_in_days=14):
        seen["email"] = email
        seen["redirect_url"] = redirect_url
        seen["public_metadata"] = public_metadata
        seen["expires_in_days"] = expires_in_days
        return type("Invite", (), {"id": "clerk_inv_9", "email": email})()

    monkeypatch.setattr(invitations, "create_invitation", fake_create)
    conn = FakeConn(insert_id="inv-9")
    patch_tx(monkeypatch, conn)

    result = invitations.send_invites(ADMIN, MEMBERSHIP, [{"email": "Join@Acme.com", "role": "qs"}])
    assert result.sent == 1
    insert = next(params for sql, params in conn.calls if "INSERT INTO invitation" in sql)
    assert insert[1] == "join@acme.com"
    assert insert[2] == "qs"
    assert insert[5] == invitations.hash_invite_token("plain-token")
    assert seen["email"] == "join@acme.com"
    assert seen["public_metadata"]["quanto_invitation_id"] == "inv-9"
    assert seen["redirect_url"] == "http://localhost:3000/sign-up"
    assert any("clerk_invitation_id" in sql for sql, _params in conn.calls)


def test_send_invites_stores_project_ids(monkeypatch):
    monkeypatch.setattr(invitations, "invitation_redirect_url", lambda: "http://localhost:3000/sign-up")
    monkeypatch.setattr(invitations, "_email_already_in_a_company", lambda email: False)
    monkeypatch.setattr(invitations, "owned_workspace_ids", lambda company_id, ids: list(ids))
    monkeypatch.setattr(
        invitations,
        "create_invitation",
        lambda email, **kwargs: type("Invite", (), {"id": "clerk_inv_2", "email": email})(),
    )
    conn = FakeConn(insert_id="inv-2")
    patch_tx(monkeypatch, conn)
    result = invitations.send_invites(
        ADMIN,
        MEMBERSHIP,
        [{"email": "join@acme.com", "role": "qs", "workspace_ids": ["p1", "p2"]}],
    )
    assert result.sent == 1
    insert = next(params for sql, params in conn.calls if "INSERT INTO invitation" in sql)
    assert insert[3] == '["p1", "p2"]'


def test_send_invites_records_clerk_failure(monkeypatch):
    monkeypatch.setattr(invitations, "invitation_redirect_url", lambda: "http://localhost:3000/sign-up")
    monkeypatch.setattr(invitations, "_email_already_in_a_company", lambda email: False)
    monkeypatch.setattr(invitations, "owned_workspace_ids", lambda company_id, ids: [])
    monkeypatch.setattr(invitations, "create_invitation", lambda *a, **k: (_ for _ in ()).throw(ClerkApiError("already invited")))
    patch_tx(monkeypatch, FakeConn())
    result = invitations.send_invites(ADMIN, MEMBERSHIP, [{"email": "join@acme.com", "role": "qs"}])
    assert result.sent == 0
    assert result.failures[0].reason == "That email already has a pending invitation."


def test_claim_returns_already_member(monkeypatch):
    monkeypatch.setattr(invitations, "get_company_membership", lambda user_id: MEMBERSHIP)
    result = invitations.claim_invitation(ADMIN)
    assert result.claimed is False
    assert result.already_member is True


def test_claim_by_email_inserts_membership(monkeypatch):
    monkeypatch.setattr(invitations, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(
        invitations,
        "_pending_by_email",
        lambda email: {
            "id": "inv-1",
            "company_id": "c1",
            "email": "join@acme.com",
            "role": "qs",
            "workspace_ids": ["p1"],
            "status": "pending",
            "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        },
    )
    monkeypatch.setattr(invitations, "fetch_one", lambda sql, params=(): {"id": "c1", "name": "Acme"})
    conn = FakeConn()
    patch_tx(monkeypatch, conn)
    result = invitations.claim_invitation(GUEST)
    assert result == invitations.ClaimResult(claimed=True, company_id="c1", company_name="Acme", role="qs")
    assert any("INSERT INTO company_member" in sql for sql, _params in conn.calls)
    assert any(
        "INSERT INTO project_member" in sql and params == ("p1", GUEST.id) for sql, params in conn.calls
    )
    assert any("status = 'accepted'" in sql for sql, _params in conn.calls)


def test_pending_invite_for_email_counts_projects(monkeypatch):
    monkeypatch.setattr(
        invitations,
        "_pending_by_email",
        lambda email: {
            "id": "inv-1",
            "company_id": "c1",
            "email": email,
            "role": "qs",
            "workspace_ids": ["p1", "p2"],
            "status": "pending",
        },
    )
    monkeypatch.setattr(
        invitations,
        "fetch_one",
        lambda sql, params=(): {"id": "c1", "name": "Acme", "domain": "acme.com"},
    )
    pending = invitations.pending_invite_for_email("join@acme.com")
    assert pending["company_name"] == "Acme"
    assert pending["project_count"] == 2


def test_pending_invite_for_email_none(monkeypatch):
    monkeypatch.setattr(invitations, "_pending_by_email", lambda email: None)
    assert invitations.pending_invite_for_email("join@acme.com") is None


def test_claim_without_projects_skips_project_member(monkeypatch):
    monkeypatch.setattr(invitations, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(
        invitations,
        "_pending_by_email",
        lambda email: {
            "id": "inv-1",
            "company_id": "c1",
            "email": "join@acme.com",
            "role": "qs",
            "workspace_ids": [],
            "status": "pending",
            "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        },
    )
    monkeypatch.setattr(invitations, "fetch_one", lambda sql, params=(): {"id": "c1", "name": "Acme"})
    conn = FakeConn()
    patch_tx(monkeypatch, conn)
    result = invitations.claim_invitation(GUEST)
    assert result.claimed is True
    assert not any("INSERT INTO project_member" in sql for sql, _params in conn.calls)


def test_claim_by_token_rejects_email_mismatch(monkeypatch):
    monkeypatch.setattr(invitations, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(
        invitations,
        "_pending_by_token",
        lambda token: {
            "id": "inv-1",
            "company_id": "c1",
            "email": "other@acme.com",
            "role": "qs",
            "workspace_ids": [],
            "status": "pending",
            "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
        },
    )
    with pytest.raises(invitations.InvitationError) as excinfo:
        invitations.claim_invitation(GUEST, token="plain-token")
    assert excinfo.value.code == "invalid"


def test_claim_expired_invitation(monkeypatch):
    monkeypatch.setattr(invitations, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(
        invitations,
        "_pending_by_email",
        lambda email: {
            "id": "inv-1",
            "company_id": "c1",
            "email": "join@acme.com",
            "role": "qs",
            "workspace_ids": [],
            "status": "pending",
            "expires_at": datetime.now(timezone.utc) - timedelta(days=1),
        },
    )
    with pytest.raises(invitations.InvitationError) as excinfo:
        invitations.claim_invitation(GUEST)
    assert excinfo.value.code == "expired"


def test_revoke_invite_marks_row_and_calls_clerk(monkeypatch):
    monkeypatch.setattr(
        invitations,
        "fetch_one",
        lambda sql, params=(): {"id": "inv-1", "email": "join@acme.com", "clerk_invitation_id": "clerk_1", "status": "pending"},
    )
    seen = {}
    monkeypatch.setattr(invitations, "revoke_invitation", lambda invitation_id: seen.setdefault("id", invitation_id))
    monkeypatch.setattr(invitations, "execute", lambda sql, params=(): seen.setdefault("sql", sql))
    invitations.revoke_invite(MEMBERSHIP, "inv-1")
    assert seen["id"] == "clerk_1"
    assert "revoked" in seen["sql"]


def test_resend_invite_sends_again(monkeypatch):
    monkeypatch.setattr(
        invitations,
        "fetch_one",
        lambda sql, params=(): {
            "id": "inv-1",
            "email": "join@acme.com",
            "role": "qs",
            "workspace_ids": [],
            "status": "pending",
            "clerk_invitation_id": "clerk_1",
        },
    )
    monkeypatch.setattr(invitations, "_revoke_clerk_invite", lambda row: None)
    monkeypatch.setattr(
        invitations,
        "send_invites",
        lambda user, membership, rows: invitations.SendInvitesResult(sent=1, failures=[]),
    )
    result = invitations.resend_invite(ADMIN, MEMBERSHIP, "inv-1")
    assert result.sent == 1


def _pending_row(**overrides):
    row = {
        "id": "inv-1",
        "email": "join@acme.com",
        "role": "qs",
        "workspace_ids": [],
        "status": "pending",
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    }
    row.update(overrides)
    return row


def test_update_invite_sets_projects_and_role(monkeypatch):
    row = _pending_row()

    def fake_fetch_one(sql, params=()):
        if "FROM invitation" in sql:
            return row
        if "FROM project" in sql:
            return {"id": params[0]}
        return None

    seen = {}
    monkeypatch.setattr(invitations, "fetch_one", fake_fetch_one)
    monkeypatch.setattr(
        invitations,
        "execute",
        lambda sql, params=(): seen.update({"sql": sql, "params": params}),
    )
    result = invitations.update_invite(
        MEMBERSHIP,
        "inv-1",
        role="chief_estimator",
        workspace_ids=["p1", "p2"],
    )
    assert result["role"] == "chief_estimator"
    assert result["workspace_ids"] == ["p1", "p2"]
    assert seen["params"][0] == "chief_estimator"
    assert seen["params"][1] == '["p1", "p2"]'


def test_update_invite_clears_projects(monkeypatch):
    row = _pending_row(workspace_ids=["p1"])
    monkeypatch.setattr(invitations, "fetch_one", lambda sql, params=(): row)
    seen = {}
    monkeypatch.setattr(
        invitations,
        "execute",
        lambda sql, params=(): seen.update({"params": params}),
    )
    result = invitations.update_invite(MEMBERSHIP, "inv-1", workspace_ids=[])
    assert result["workspace_ids"] == []
    assert result["role"] == "qs"
    assert seen["params"][1] == "[]"


def test_update_invite_rejects_admin_role(monkeypatch):
    monkeypatch.setattr(invitations, "fetch_one", lambda sql, params=(): _pending_row())
    with pytest.raises(invitations.InvitationError) as excinfo:
        invitations.update_invite(MEMBERSHIP, "inv-1", role="admin")
    assert "assignable" in excinfo.value.message.lower()


def test_update_invite_rejects_missing(monkeypatch):
    monkeypatch.setattr(invitations, "fetch_one", lambda sql, params=(): None)
    with pytest.raises(invitations.InvitationError):
        invitations.update_invite(MEMBERSHIP, "inv-1", role="qs")


def test_update_invite_rejects_expired(monkeypatch):
    monkeypatch.setattr(
        invitations,
        "fetch_one",
        lambda sql, params=(): _pending_row(expires_at=datetime.now(timezone.utc) - timedelta(days=1)),
    )
    with pytest.raises(invitations.InvitationError) as excinfo:
        invitations.update_invite(MEMBERSHIP, "inv-1", role="qs")
    assert excinfo.value.code == "expired"
