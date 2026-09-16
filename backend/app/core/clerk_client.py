"""Clerk Backend API helpers. Authentication only — no Organizations calls."""
from dataclasses import dataclass
from typing import Any

import httpx

from .config import get_settings


class ClerkApiError(Exception):
    pass


@dataclass(frozen=True)
class ClerkProfile:
    email: str
    full_name: str | None


@dataclass(frozen=True)
class ClerkInvitation:
    id: str
    email: str


def _secret_key() -> str:
    settings = get_settings()
    if not settings.clerk_secret_key:
        raise ClerkApiError("CLERK_SECRET_KEY is not configured")
    return settings.clerk_secret_key


def _error_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
        errors = payload.get("errors") if isinstance(payload, dict) else None
        if isinstance(errors, list) and errors:
            first = errors[0] if isinstance(errors[0], dict) else {}
            return str(first.get("long_message") or first.get("message") or f"Clerk API returned {response.status_code}")
    except Exception:
        pass
    return f"Clerk API returned {response.status_code}"


def fetch_clerk_user(user_id: str) -> ClerkProfile:
    """One-time lookup used the first time get_current_user() sees a Clerk user id."""
    response = httpx.get(
        f"https://api.clerk.com/v1/users/{user_id}",
        headers={"Authorization": f"Bearer {_secret_key()}"},
        timeout=5.0,
    )
    if response.status_code != 200:
        raise ClerkApiError(_error_message(response))

    data = response.json()
    primary_id = data.get("primary_email_address_id")
    email = next(
        (e["email_address"] for e in data.get("email_addresses", []) if e.get("id") == primary_id),
        None,
    )
    if not email:
        raise ClerkApiError(f"Clerk user {user_id} has no primary email address")

    full_name = " ".join(filter(None, [data.get("first_name"), data.get("last_name")])) or None
    return ClerkProfile(email=email, full_name=full_name)


def create_invitation(
    email: str,
    *,
    redirect_url: str,
    public_metadata: dict[str, Any] | None = None,
    expires_in_days: int = 14,
) -> ClerkInvitation:
    """Application invitation. Clerk emails the user. Not an organization invite."""
    response = httpx.post(
        "https://api.clerk.com/v1/invitations",
        headers={
            "Authorization": f"Bearer {_secret_key()}",
            "Content-Type": "application/json",
        },
        json={
            "email_address": email,
            "redirect_url": redirect_url,
            "notify": True,
            "ignore_existing": True,
            "expires_in_days": expires_in_days,
            "public_metadata": public_metadata or {},
        },
        timeout=10.0,
    )
    if response.status_code not in {200, 201}:
        raise ClerkApiError(_error_message(response))
    data = response.json()
    return ClerkInvitation(id=str(data.get("id") or ""), email=email)
