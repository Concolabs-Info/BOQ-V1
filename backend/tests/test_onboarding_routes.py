from fastapi.testclient import TestClient

from app.api.v1.routes import platform
from app.core.auth import CurrentUser, get_current_user
from app.main import app
from app.modules.platform.onboarding import CreatedCompany, CreatedProject, OnboardingError, OnboardingStatus

client = TestClient(app)
USER = CurrentUser(id="user_1", email="a@acme.com", full_name="A")


def _auth():
    app.dependency_overrides[get_current_user] = lambda: USER


def _clear():
    app.dependency_overrides.clear()


def test_status_requires_authentication():
    response = client.get("/api/v1/platform/onboarding/status")
    assert response.status_code == 401


def test_status_returns_join_path(monkeypatch):
    _auth()
    monkeypatch.setattr(
        platform,
        "onboarding_status",
        lambda user, as_founder=False, skip_removed=False: OnboardingStatus(
            path="REQUEST_TO_JOIN",
            domain="acme.com",
            suggested_name="Acme",
            existing_company={"id": "c1", "name": "Acme", "domain": "acme.com"},
            former_company_name=None,
            has_company=False,
            has_project=False,
        ),
    )
    response = client.get("/api/v1/platform/onboarding/status")
    _clear()
    assert response.status_code == 200
    body = response.json()
    assert body["path"] == "REQUEST_TO_JOIN"
    assert body["existing_company"] == {"id": "c1", "name": "Acme", "domain": "acme.com"}
    assert body["has_company"] is False


def test_status_passes_founder_flag(monkeypatch):
    _auth()
    seen = {}

    def fake_status(user, as_founder=False, skip_removed=False):
        seen["as_founder"] = as_founder
        seen["skip_removed"] = skip_removed
        return OnboardingStatus(
            path="CREATE_MANUAL",
            domain=None,
            suggested_name="",
            existing_company=None,
            former_company_name=None,
            has_company=False,
            has_project=False,
        )

    monkeypatch.setattr(platform, "onboarding_status", fake_status)
    response = client.get("/api/v1/platform/onboarding/status?founder=true")
    _clear()
    assert response.status_code == 200
    assert seen["as_founder"] is True
    assert seen["skip_removed"] is True
    assert response.json()["path"] == "CREATE_MANUAL"


def test_status_passes_after_deleted_flag(monkeypatch):
    _auth()
    seen = {}

    def fake_status(user, as_founder=False, skip_removed=False):
        seen["as_founder"] = as_founder
        seen["skip_removed"] = skip_removed
        return OnboardingStatus(
            path="CREATE_WITH_DOMAIN_LOCK",
            domain="acme.com",
            suggested_name="Acme",
            existing_company=None,
            former_company_name=None,
            has_company=False,
            has_project=False,
        )

    monkeypatch.setattr(platform, "onboarding_status", fake_status)
    response = client.get("/api/v1/platform/onboarding/status?after_deleted=true")
    _clear()
    assert response.status_code == 200
    assert seen["as_founder"] is False
    assert seen["skip_removed"] is True
    assert response.json()["path"] == "CREATE_WITH_DOMAIN_LOCK"


def test_create_company_returns_201(monkeypatch):
    _auth()
    monkeypatch.setattr(
        platform,
        "create_company",
        lambda user, **kwargs: CreatedCompany(id="c1", name=kwargs["name"]),
    )
    response = client.post(
        "/api/v1/platform/onboarding/company",
        json={"name": "Acme", "country": "Sri Lanka", "lock_domain": True},
    )
    _clear()
    assert response.status_code == 201
    assert response.json() == {"id": "c1", "name": "Acme", "role": "admin"}


def test_create_company_maps_join_existing(monkeypatch):
    _auth()

    def boom(user, **kwargs):
        raise OnboardingError("join_existing", "That company is already on Quanto.", extra={"id": "c1", "name": "Acme", "domain": "acme.com"})

    monkeypatch.setattr(platform, "create_company", boom)
    response = client.post(
        "/api/v1/platform/onboarding/company",
        json={"name": "Acme", "country": "Sri Lanka", "lock_domain": True},
    )
    _clear()
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "join_existing"
    assert detail["existing_company"]["id"] == "c1"


def test_create_company_maps_field_error(monkeypatch):
    _auth()

    def boom(user, **kwargs):
        raise OnboardingError("invalid", "Enter a company name.", field="name")

    monkeypatch.setattr(platform, "create_company", boom)
    response = client.post(
        "/api/v1/platform/onboarding/company",
        json={"name": "Acme", "country": "Sri Lanka", "registration_type": "NONE"},
    )
    _clear()
    assert response.status_code == 400
    assert response.json()["detail"]["field"] == "name"


def test_create_project_returns_201(monkeypatch):
    _auth()
    captured: dict = {}

    def fake_create(user, **kwargs):
        captured.update(kwargs)
        return CreatedProject(id="p1", name=kwargs["name"])

    monkeypatch.setattr(platform, "create_first_project", fake_create)
    response = client.post(
        "/api/v1/platform/onboarding/project",
        json={
            "name": "Tower",
            "project_number": "P-01",
            "client_name": "City",
            "location": "Colombo",
            "description": "High-rise",
        },
    )
    _clear()
    assert response.status_code == 201
    assert response.json() == {"id": "p1", "name": "Tower"}
    assert captured == {
        "name": "Tower",
        "project_number": "P-01",
        "client_name": "City",
        "location": "Colombo",
        "description": "High-rise",
    }


def test_create_project_requires_name():
    _auth()
    response = client.post("/api/v1/platform/onboarding/project", json={"name": ""})
    _clear()
    assert response.status_code == 422


def test_accept_terms_requires_authentication():
    response = client.post("/api/v1/platform/onboarding/terms", json={"version": "2026-09-17"})
    assert response.status_code == 401


def test_accept_terms_stores_the_version(monkeypatch):
    _auth()
    seen = {}

    def fake_accept(user_id, version):
        seen["user_id"] = user_id
        seen["version"] = version
        return version

    monkeypatch.setattr(platform, "accept_terms", fake_accept)
    response = client.post("/api/v1/platform/onboarding/terms", json={"version": "2026-09-17"})
    _clear()
    assert response.status_code == 200
    assert response.json() == {"ok": True, "terms_version": "2026-09-17"}
    assert seen == {"user_id": "user_1", "version": "2026-09-17"}


def test_accept_terms_requires_version():
    _auth()
    response = client.post("/api/v1/platform/onboarding/terms", json={"version": ""})
    _clear()
    assert response.status_code == 422


def test_accept_terms_rejects_whitespace_version():
    _auth()
    response = client.post("/api/v1/platform/onboarding/terms", json={"version": "   "})
    _clear()
    assert response.status_code == 422


def test_accept_terms_maps_stale_version(monkeypatch):
    _auth()

    def boom(user_id, version):
        from app.modules.platform.terms import TermsError

        raise TermsError("invalid", "Accept the current terms to continue.")

    monkeypatch.setattr(platform, "accept_terms", boom)
    response = client.post("/api/v1/platform/onboarding/terms", json={"version": "1999-01-01"})
    _clear()
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "invalid"


def test_create_project_requires_company(monkeypatch):
    _auth()

    def boom(user, **kwargs):
        raise OnboardingError("onboarding_incomplete", "Create a company first.")

    monkeypatch.setattr(platform, "create_first_project", boom)
    response = client.post("/api/v1/platform/onboarding/project", json={"name": "Tower"})
    _clear()
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "onboarding_incomplete"
