from app.modules.platform.onboarding_path import (
    domain_of_email,
    is_personal_provider,
    resolve_onboarding_path,
    suggested_company_name,
)


def test_domain_of_email():
    assert domain_of_email("Ada@Acme.COM") == "acme.com"
    assert domain_of_email("bad") is None


def test_personal_gmail_is_manual():
    result = resolve_onboarding_path("ada@gmail.com", lambda domain: False)
    assert result.path == "CREATE_MANUAL"
    assert result.domain is None


def test_work_domain_without_company_locks_domain():
    result = resolve_onboarding_path("ada@acme.com", lambda domain: False)
    assert result.path == "CREATE_WITH_DOMAIN_LOCK"
    assert result.domain == "acme.com"


def test_work_domain_with_company_requests_to_join():
    result = resolve_onboarding_path("ada@acme.com", lambda domain: domain == "acme.com")
    assert result.path == "REQUEST_TO_JOIN"
    assert result.domain == "acme.com"


def test_suggested_company_name():
    assert suggested_company_name("riverside-build.com") == "Riverside Build"
    assert is_personal_provider("gmail.com") is True
    assert is_personal_provider("acme.com") is False
