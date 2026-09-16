import time

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from app.core import auth
from app.core.clerk_client import ClerkProfile

ISSUER = "https://example.clerk.accounts.dev"


def _generate_keypair() -> tuple[bytes, str]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode()
    return private_pem, public_pem


def _sign(private_pem: bytes, claims: dict) -> str:
    return jwt.encode(claims, private_pem, algorithm="RS256")


def test_verify_clerk_token_accepts_a_validly_signed_token():
    private_pem, public_pem = _generate_keypair()
    now = int(time.time())
    token = _sign(private_pem, {"sub": "user_1", "iss": ISSUER, "iat": now, "exp": now + 60})
    claims = auth.verify_clerk_token(token, jwt_key=public_pem, issuer=ISSUER)
    assert claims["sub"] == "user_1"


def test_verify_clerk_token_rejects_the_wrong_issuer():
    private_pem, public_pem = _generate_keypair()
    now = int(time.time())
    token = _sign(private_pem, {"sub": "user_1", "iss": "https://someone-else.clerk.accounts.dev", "iat": now, "exp": now + 60})
    with pytest.raises(auth.ClerkTokenError):
        auth.verify_clerk_token(token, jwt_key=public_pem, issuer=ISSUER)


def test_verify_clerk_token_rejects_an_expired_token():
    private_pem, public_pem = _generate_keypair()
    now = int(time.time())
    token = _sign(private_pem, {"sub": "user_1", "iss": ISSUER, "iat": now - 120, "exp": now - 60})
    with pytest.raises(auth.ClerkTokenError):
        auth.verify_clerk_token(token, jwt_key=public_pem, issuer=ISSUER)


def test_verify_clerk_token_rejects_a_signature_from_a_different_key():
    _, public_pem = _generate_keypair()
    other_private_pem, _ = _generate_keypair()
    now = int(time.time())
    token = _sign(other_private_pem, {"sub": "user_1", "iss": ISSUER, "iat": now, "exp": now + 60})
    with pytest.raises(auth.ClerkTokenError):
        auth.verify_clerk_token(token, jwt_key=public_pem, issuer=ISSUER)


def test_upsert_app_user_returns_the_cached_row_without_calling_clerk(monkeypatch):
    monkeypatch.setattr(auth, "fetch_one", lambda sql, params=(): {"id": "user_1", "email": "a@example.com", "full_name": "A"})

    def fail_if_called(user_id):
        raise AssertionError("fetch_clerk_user should not be called for a cached user")

    monkeypatch.setattr(auth, "fetch_clerk_user", fail_if_called)
    result = auth.upsert_app_user("user_1")
    assert result == auth.CurrentUser(id="user_1", email="a@example.com", full_name="A")


def test_upsert_app_user_fetches_and_stores_a_new_user(monkeypatch):
    monkeypatch.setattr(auth, "fetch_one", lambda sql, params=(): None)
    monkeypatch.setattr(auth, "fetch_clerk_user", lambda user_id: ClerkProfile(email="b@example.com", full_name="B"))
    inserted = {}
    monkeypatch.setattr(auth, "execute", lambda sql, params=(): inserted.setdefault("params", params))

    result = auth.upsert_app_user("user_2")
    assert result == auth.CurrentUser(id="user_2", email="b@example.com", full_name="B")
    assert inserted["params"] == ("user_2", "b@example.com", "B")


def test_get_current_user_rejects_a_missing_authorization_header():
    with pytest.raises(HTTPException) as excinfo:
        auth.get_current_user(authorization=None)
    assert excinfo.value.status_code == 401


def test_get_current_user_verifies_the_token_and_upserts(monkeypatch):
    class FakeSettings:
        clerk_jwt_key = "fake-key"
        clerk_issuer = ISSUER

    monkeypatch.setattr(auth, "get_settings", lambda: FakeSettings())
    monkeypatch.setattr(auth, "verify_clerk_token", lambda token, jwt_key, issuer: {"sub": "user_3"})
    monkeypatch.setattr(auth, "upsert_app_user", lambda user_id: auth.CurrentUser(id=user_id, email="c@example.com", full_name=None))

    result = auth.get_current_user(authorization="Bearer sometoken")
    assert result.id == "user_3"
