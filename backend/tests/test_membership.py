import pytest
from fastapi import HTTPException

from app.core.auth import CurrentUser
from app.modules.platform import membership


def test_get_company_membership_returns_none_when_no_row(monkeypatch):
    monkeypatch.setattr(membership, "fetch_one", lambda sql, params=(): None)
    assert membership.get_company_membership("user_1") is None


def test_get_company_membership_maps_the_row(monkeypatch):
    monkeypatch.setattr(
        membership,
        "fetch_one",
        lambda sql, params=(): {"company_id": "c1", "company_name": "Acme", "role": "admin"},
    )
    result = membership.get_company_membership("user_1")
    assert result == membership.CompanyMembership(company_id="c1", company_name="Acme", role="admin")


def test_require_permission_raises_409_with_no_company(monkeypatch):
    monkeypatch.setattr(membership, "get_company_membership", lambda user_id: None)
    dependency = membership.require_permission("company:manage")
    with pytest.raises(HTTPException) as excinfo:
        dependency(current_user=CurrentUser(id="user_1", email="a@example.com", full_name=None))
    assert excinfo.value.status_code == 409


def test_require_permission_raises_403_when_role_lacks_it(monkeypatch):
    monkeypatch.setattr(
        membership,
        "get_company_membership",
        lambda user_id: membership.CompanyMembership(company_id="c1", company_name="Acme", role="qs"),
    )
    dependency = membership.require_permission("company:manage")
    with pytest.raises(HTTPException) as excinfo:
        dependency(current_user=CurrentUser(id="user_1", email="a@example.com", full_name=None))
    assert excinfo.value.status_code == 403


def test_require_permission_passes_through_for_admin(monkeypatch):
    monkeypatch.setattr(
        membership,
        "get_company_membership",
        lambda user_id: membership.CompanyMembership(company_id="c1", company_name="Acme", role="admin"),
    )
    dependency = membership.require_permission("company:manage")
    result = dependency(current_user=CurrentUser(id="user_1", email="a@example.com", full_name=None))
    assert result.role == "admin"
