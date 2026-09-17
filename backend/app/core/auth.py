"""Clerk session verification. Verifies the signature and issuer of a Clerk
session JWT locally against CLERK_JWT_KEY/CLERK_ISSUER - no network call per
request."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import jwt
from fastapi import Header, HTTPException

from ..database.connection import execute, fetch_one
from .clerk_client import ClerkApiError, fetch_clerk_user
from .config import get_settings


class ClerkTokenError(Exception):
    pass


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    full_name: str | None
    terms_accepted_at: datetime | None = None
    terms_version: str | None = None


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
    row = fetch_one(
        "SELECT id, email, full_name, terms_accepted_at, terms_version, deleted_at FROM app_user WHERE id = %s",
        (user_id,),
    )
    if row:
        if row.get("deleted_at"):
            # A leftover session JWT can still verify after delete_my_account.
            # Only resurrect the row if Clerk still has this user; otherwise
            # keep deleted_at so a later invite can email them as a new account.
            profile = fetch_clerk_user(user_id)
            execute(
                "UPDATE app_user SET deleted_at = NULL, email = %s, full_name = %s WHERE id = %s",
                (profile.email, profile.full_name, user_id),
            )
            return CurrentUser(
                id=user_id,
                email=profile.email,
                full_name=profile.full_name,
                terms_accepted_at=row.get("terms_accepted_at"),
                terms_version=row.get("terms_version"),
            )
        return CurrentUser(
            id=row["id"],
            email=row["email"],
            full_name=row["full_name"],
            terms_accepted_at=row.get("terms_accepted_at"),
            terms_version=row.get("terms_version"),
        )

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

    try:
        return upsert_app_user(claims["sub"])
    except ClerkApiError as exc:
        # The session JWT can still be validly signed for a short window after
        # the Clerk account behind it is deleted. Treat that as signed out
        # instead of surfacing it as an unhandled 500.
        raise HTTPException(status_code=401, detail="Invalid session token") from exc
