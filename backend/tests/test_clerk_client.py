from dataclasses import dataclass

from app.core import clerk_client
from app.core.clerk_client import ClerkApiError, fetch_clerk_user


@dataclass
class FakeSettings:
    clerk_secret_key: str | None = "sk_test_123"


class FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


def test_fetch_clerk_user_returns_email_and_name(monkeypatch):
    monkeypatch.setattr(clerk_client, "get_settings", lambda: FakeSettings())

    def fake_get(url, headers=None, timeout=None):
        assert url == "https://api.clerk.com/v1/users/user_123"
        assert headers["Authorization"] == "Bearer sk_test_123"
        return FakeResponse(200, {
            "email_addresses": [{"id": "idn_1", "email_address": "ada@example.com"}],
            "primary_email_address_id": "idn_1",
            "first_name": "Ada",
            "last_name": "Lovelace",
        })

    monkeypatch.setattr(clerk_client.httpx, "get", fake_get)
    profile = fetch_clerk_user("user_123")
    assert profile.email == "ada@example.com"
    assert profile.full_name == "Ada Lovelace"


def test_fetch_clerk_user_raises_without_a_secret_key(monkeypatch):
    monkeypatch.setattr(clerk_client, "get_settings", lambda: FakeSettings(clerk_secret_key=None))
    try:
        fetch_clerk_user("user_123")
        assert False, "expected ClerkApiError"
    except ClerkApiError:
        pass


def test_fetch_clerk_user_raises_on_non_200(monkeypatch):
    monkeypatch.setattr(clerk_client, "get_settings", lambda: FakeSettings())
    monkeypatch.setattr(clerk_client.httpx, "get", lambda *a, **k: FakeResponse(404, {}))
    try:
        fetch_clerk_user("user_123")
        assert False, "expected ClerkApiError"
    except ClerkApiError:
        pass
