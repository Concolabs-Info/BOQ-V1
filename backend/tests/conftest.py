import pytest

from app.modules.platform import roles as roles_mod


@pytest.fixture(autouse=True)
def _no_role_overrides_by_default(monkeypatch):
    """membership_permissions() now always checks for a company override of
    the caller's role, even a built-in one, so every test that reaches it
    needs company_role looked up. Default to "no override exists" here;
    tests that care about an override still set their own roles.fetch_one
    or roles.custom_role_row patch, which simply takes effect after this."""
    monkeypatch.setattr(roles_mod, "fetch_one", lambda sql, params=(): None)
