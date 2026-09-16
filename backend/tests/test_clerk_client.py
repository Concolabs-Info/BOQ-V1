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


def test_create_invitation_posts_application_invite(monkeypatch):
    monkeypatch.setattr(clerk_client, "get_settings", lambda: FakeSettings())
    seen = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        seen["url"] = url
        seen["headers"] = headers
        seen["json"] = json
        return FakeResponse(200, {"id": "inv_123"})

    monkeypatch.setattr(clerk_client.httpx, "post", fake_post)
    created = clerk_client.create_invitation(
        "join@acme.com",
        redirect_url="http://localhost:3000/sign-up",
        public_metadata={"quanto_invitation_id": "c1"},
    )
    assert created.id == "inv_123"
    assert seen["url"] == "https://api.clerk.com/v1/invitations"
    assert seen["headers"]["Authorization"] == "Bearer sk_test_123"
    assert seen["json"]["email_address"] == "join@acme.com"
    assert seen["json"]["redirect_url"] == "http://localhost:3000/sign-up"
    assert seen["json"]["ignore_existing"] is True
    assert seen["json"]["notify"] is True
    assert seen["json"]["public_metadata"]["quanto_invitation_id"] == "c1"


def test_create_invitation_surfaces_clerk_error_message(monkeypatch):
    monkeypatch.setattr(clerk_client, "get_settings", lambda: FakeSettings())
    monkeypatch.setattr(
        clerk_client.httpx,
        "post",
        lambda *a, **k: FakeResponse(422, {"errors": [{"long_message": "already invited"}]}),
    )
    try:
        clerk_client.create_invitation("join@acme.com", redirect_url="http://localhost:3000/sign-up")
        assert False, "expected ClerkApiError"
    except ClerkApiError as exc:
        assert "already invited" in str(exc)


def test_create_invitation_raises_without_a_secret_key(monkeypatch):
    monkeypatch.setattr(clerk_client, "get_settings", lambda: FakeSettings(clerk_secret_key=None))
    try:
        clerk_client.create_invitation("join@acme.com", redirect_url="http://localhost:3000/sign-up")
        assert False, "expected ClerkApiError"
    except ClerkApiError:
        pass
