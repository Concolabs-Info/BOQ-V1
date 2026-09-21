from contextlib import contextmanager

import pytest

from app.core.auth import CurrentUser
from app.modules.platform import onboarding
from app.modules.platform.membership import CompanyMembership

USER = CurrentUser(id="user_1", email="tharu@acme.com", full_name="Tharu")
GMAIL = CurrentUser(id="user_2", email="tharu@gmail.com", full_name="Tharu")


class FakeResult:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class FakeConn:
    def __init__(self, *, company=None, project=None, fail=None):
        self.calls = []
        self.company = company or {"id": "c1", "name": "Acme"}
        self.project = project or {"id": "p1", "name": "Tower"}
        self.fail = fail

    def execute(self, sql, params):
        self.calls.append((sql, params))
        if self.fail:
            raise self.fail
        if "INSERT INTO company" in sql:
            return FakeResult(self.company)
        if "INSERT INTO project" in sql:
            return FakeResult(self.project)
        return FakeResult(None)


def patch_tx(monkeypatch, conn):
    @contextmanager
    def fake_transaction():
        yield conn

    monkeypatch.setattr(onboarding, "transaction", fake_transaction)


def test_currency_defaults_to_usd():
    assert onboarding.currency_for_country("Sri Lanka") == "LKR"
    assert onboarding.currency_for_country("Narnia") == "USD"


def test_status_gmail_is_manual_create(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "former_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "pending_invite_for_email", lambda email: None)
    monkeypatch.setattr(onboarding, "find_company_by_domain", lambda domain: None)
    status = onboarding.onboarding_status(GMAIL)
    assert status.path == "CREATE_MANUAL"
    assert status.domain is None
    assert status.has_company is False


def test_status_work_email_without_company_locks_domain(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "former_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "pending_invite_for_email", lambda email: None)
    monkeypatch.setattr(onboarding, "find_company_by_domain", lambda domain: None)
    status = onboarding.onboarding_status(USER)
    assert status.path == "CREATE_WITH_DOMAIN_LOCK"
    assert status.domain == "acme.com"
    assert status.suggested_name == "Acme"


def test_status_work_email_with_company_asks_to_join(monkeypatch):
    existing = {"id": "c1", "name": "Acme", "domain": "acme.com"}
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "former_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "pending_invite_for_email", lambda email: None)
    monkeypatch.setattr(onboarding, "find_company_by_domain", lambda domain: existing)
    status = onboarding.onboarding_status(USER)
    assert status.path == "REQUEST_TO_JOIN"
    assert status.existing_company == existing


def test_status_founder_escape_is_manual(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "pending_invite_for_email", lambda email: None)
    monkeypatch.setattr(onboarding, "former_membership", lambda user_id: {"name": "Old Co", "reason": "company_deleted"})
    status = onboarding.onboarding_status(USER, as_founder=True)
    assert status.path == "CREATE_MANUAL"
    assert status.former_company_name is None


def test_status_removed_member_is_called_out(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "pending_invite_for_email", lambda email: None)
    monkeypatch.setattr(onboarding, "former_membership", lambda user_id: {"name": "Old Co", "reason": "removed"})
    status = onboarding.onboarding_status(USER)
    assert status.path == "REMOVED"
    assert status.former_company_name == "Old Co"
    assert status.former_reason == "removed"


def test_status_company_deleted_is_called_out(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "pending_invite_for_email", lambda email: None)
    monkeypatch.setattr(onboarding, "former_membership", lambda user_id: {"name": "Acme", "reason": "company_deleted"})
    status = onboarding.onboarding_status(USER)
    assert status.path == "REMOVED"
    assert status.former_company_name == "Acme"
    assert status.former_reason == "company_deleted"


def test_status_member_without_project_continues_wizard(monkeypatch):
    monkeypatch.setattr(
        onboarding,
        "get_company_membership",
        lambda user_id: CompanyMembership(company_id="c1", company_name="Acme", role="admin"),
    )
    monkeypatch.setattr(onboarding, "company_project_count", lambda company_id: 0)
    status = onboarding.onboarding_status(USER)
    assert status.path == "CONTINUE_WIZARD"
    assert status.has_company is True
    assert status.has_project is False


def test_status_invited_member_without_project_is_done(monkeypatch):
    monkeypatch.setattr(
        onboarding,
        "get_company_membership",
        lambda user_id: CompanyMembership(company_id="c1", company_name="Acme", role="qs"),
    )
    monkeypatch.setattr(onboarding, "company_project_count", lambda company_id: 0)
    status = onboarding.onboarding_status(USER)
    assert status.path == "DONE"
    assert status.has_company is True
    assert status.has_project is False


def test_status_pending_invite_is_accept_invite(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(
        onboarding,
        "pending_invite_for_email",
        lambda email: {
            "company_id": "c1",
            "company_name": "Acme",
            "domain": "acme.com",
            "role": "qs",
            "project_count": 1,
        },
    )
    status = onboarding.onboarding_status(USER)
    assert status.path == "ACCEPT_INVITE"
    assert status.existing_company["name"] == "Acme"
    assert status.pending_project_count == 1


def test_status_pending_invite_beats_removed_and_join(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "former_membership", lambda user_id: {"name": "Old Co", "reason": "removed"})
    monkeypatch.setattr(
        onboarding,
        "pending_invite_for_email",
        lambda email: {
            "company_id": "c1",
            "company_name": "Acme",
            "domain": "acme.com",
            "role": "qs",
            "project_count": 0,
        },
    )
    status = onboarding.onboarding_status(USER, as_founder=True)
    assert status.path == "ACCEPT_INVITE"
    assert status.former_company_name is None


def test_status_skip_removed_uses_domain_path(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "pending_invite_for_email", lambda email: None)
    monkeypatch.setattr(onboarding, "former_membership", lambda user_id: {"name": "Old Co", "reason": "company_deleted"})
    monkeypatch.setattr(onboarding, "find_company_by_domain", lambda domain: None)
    status = onboarding.onboarding_status(USER, skip_removed=True)
    assert status.path == "CREATE_WITH_DOMAIN_LOCK"
    assert status.former_company_name is None


def test_create_company_rejects_existing_member(monkeypatch):
    monkeypatch.setattr(
        onboarding,
        "get_company_membership",
        lambda user_id: CompanyMembership(company_id="c1", company_name="Acme", role="admin"),
    )
    with pytest.raises(onboarding.OnboardingError) as excinfo:
        onboarding.create_company(USER, name="Acme", country="Sri Lanka", lock_domain=True)
    assert excinfo.value.code == "already_member"


def test_create_company_domain_lock_joins_when_taken(monkeypatch):
    existing = {"id": "c1", "name": "Acme", "domain": "acme.com"}
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "find_company_by_domain", lambda domain: existing)
    with pytest.raises(onboarding.OnboardingError) as excinfo:
        onboarding.create_company(USER, name="Acme", country="Sri Lanka", lock_domain=True)
    assert excinfo.value.code == "join_existing"
    assert excinfo.value.extra == existing


def test_create_company_manual_requires_registration_type(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    with pytest.raises(onboarding.OnboardingError) as excinfo:
        onboarding.create_company(GMAIL, name="Solo QS", country="Sri Lanka")
    assert excinfo.value.field == "regType"


def test_create_company_inserts_company_and_admin_member(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "find_company_by_domain", lambda domain: None)
    monkeypatch.setattr(onboarding, "pending_invite_rows_for_email", lambda email: [{"id": "inv-1", "email": email, "clerk_invitation_id": "clerk_1"}])
    seen = {"clerk": None}
    monkeypatch.setattr(onboarding, "_revoke_clerk_invite", lambda row: seen.update(clerk=row["id"]))
    conn = FakeConn(company={"id": "c9", "name": "Acme"})
    patch_tx(monkeypatch, conn)

    created = onboarding.create_company(USER, name="Acme", country="Sri Lanka", lock_domain=True)
    assert created == onboarding.CreatedCompany(id="c9", name="Acme")
    assert any("INSERT INTO company" in sql for sql, _params in conn.calls)
    assert any("INSERT INTO company_member" in sql for sql, _params in conn.calls)
    member_params = next(params for sql, params in conn.calls if "INSERT INTO company_member" in sql)
    assert member_params == ("c9", "user_1", "admin")
    assert any("DELETE FROM former_member" in sql for sql, _params in conn.calls)
    assert any("UPDATE invitation SET status = 'revoked'" in sql for sql, _params in conn.calls)
    assert seen["clerk"] == "inv-1"
    terms_params = next(params for sql, params in conn.calls if "UPDATE app_user SET terms_accepted_at" in sql)
    assert terms_params == (onboarding.CURRENT_TERMS_VERSION, "user_1")


def test_create_company_none_registration_flags_duplicate_review(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    monkeypatch.setattr(onboarding, "pending_invite_rows_for_email", lambda email: [])
    conn = FakeConn()
    patch_tx(monkeypatch, conn)

    onboarding.create_company(
        GMAIL,
        name="Solo QS",
        country="Sri Lanka",
        registration_type="NONE",
    )
    company_params = next(params for sql, params in conn.calls if "INSERT INTO company" in sql)
    assert company_params[2] == "NONE"
    assert company_params[3] is None
    assert company_params[7] is True
    assert company_params[1] is None


def test_create_company_maps_domain_unique_violation(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    lookups = {"n": 0}

    def find(domain):
        lookups["n"] += 1
        if lookups["n"] == 1:
            return None
        return {"id": "c1", "name": "Acme", "domain": "acme.com"}

    monkeypatch.setattr(onboarding, "find_company_by_domain", find)
    monkeypatch.setattr(onboarding, "pending_invite_rows_for_email", lambda email: [])
    conn = FakeConn(fail=onboarding.UniqueViolation('duplicate key value violates unique constraint "uq_company_domain_ci"'))
    patch_tx(monkeypatch, conn)
    with pytest.raises(onboarding.OnboardingError) as excinfo:
        onboarding.create_company(USER, name="Acme", country="Sri Lanka", lock_domain=True)
    assert excinfo.value.code == "join_existing"


def test_create_first_project_requires_company(monkeypatch):
    monkeypatch.setattr(onboarding, "get_company_membership", lambda user_id: None)
    with pytest.raises(onboarding.OnboardingError) as excinfo:
        onboarding.create_first_project(USER, name="Tower")
    assert excinfo.value.code == "onboarding_incomplete"


def test_create_first_project_inserts_project_and_member(monkeypatch):
    monkeypatch.setattr(
        onboarding,
        "get_company_membership",
        lambda user_id: CompanyMembership(company_id="c1", company_name="Acme", role="admin"),
    )
    conn = FakeConn(project={"id": "p9", "name": "Tower"})
    patch_tx(monkeypatch, conn)
    created = onboarding.create_first_project(
        USER,
        name="Tower",
        project_number="P-01",
        client_name="City",
        location="Colombo",
        description="High-rise",
    )
    assert created == onboarding.CreatedProject(id="p9", name="Tower")
    project_params = next(params for sql, params in conn.calls if "INSERT INTO project " in sql)
    assert project_params == ("Tower", "P-01", "City", "Colombo", "High-rise", "c1", USER.id)
    assert any("INSERT INTO project_member" in sql for sql, _params in conn.calls)


def test_former_membership_uses_snapshot_when_company_is_gone(monkeypatch):
    monkeypatch.setattr(
        onboarding,
        "fetch_one",
        lambda sql, params=(): {"name": "Acme", "reason": "company_deleted"},
    )
    assert onboarding.former_membership("user_1") == {"name": "Acme", "reason": "company_deleted"}
    assert onboarding.former_company_name("user_1") == "Acme"


def test_create_first_project_requires_name(monkeypatch):
    monkeypatch.setattr(
        onboarding,
        "get_company_membership",
        lambda user_id: CompanyMembership(company_id="c1", company_name="Acme", role="admin"),
    )
    with pytest.raises(onboarding.OnboardingError) as excinfo:
        onboarding.create_first_project(USER, name="   ")
    assert excinfo.value.code == "invalid"
    assert excinfo.value.field == "name"
