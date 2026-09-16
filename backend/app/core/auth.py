"""Clerk session verification. Verifies the signature and issuer of a Clerk
session JWT locally against CLERK_JWT_KEY/CLERK_ISSUER - no network call per
request."""
from __future__ import annotations

from dataclasses import dataclass

import jwt
from fastapi import Header, HTTPException

from ..database.connection import execute, fetch_one
from .clerk_client import fetch_clerk_user
from .config import get_settings


class ClerkTokenError(Exception):
    pass


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    full_name: str | None


def verify_clerk_token(token: str, *, jwt_key: str, issuer: str) -> dict:
    try:
        return jwt.decode(
            token,
            key=jwt_key,
            algorithms=["RS256"],
            issuer=issuer,
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise ClerkTokenError(str(exc)) from exc


def upsert_app_user(user_id: str) -> CurrentUser:
    row = fetch_one("SELECT id, email, full_name FROM app_user WHERE id = %s", (user_id,))
    if row:
        return CurrentUser(id=row["id"], email=row["email"], full_name=row["full_name"])

    profile = fetch_clerk_user(user_id)
    execute(
        "INSERT INTO app_user (id, email, full_name) VALUES (%s, %s, %s) "
        "ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name",
        (user_id, profile.email, profile.full_name),
    )
    return CurrentUser(id=user_id, email=profile.email, full_name=profile.full_name)


def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()

    settings = get_settings()
    if not settings.clerk_jwt_key or not settings.clerk_issuer:
        raise HTTPException(status_code=500, detail="Clerk auth is not configured")

    try:
        claims = verify_clerk_token(token, jwt_key=settings.clerk_jwt_key, issuer=settings.clerk_issuer)
    except ClerkTokenError as exc:
        raise HTTPException(status_code=401, detail="Invalid session token") from exc

    return upsert_app_user(claims["sub"])
