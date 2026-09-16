"""One-time lookup of a Clerk user's profile, used only the first time
get_current_user() sees a Clerk user id it hasn't cached in app_user yet.
Not called on every request."""
from dataclasses import dataclass

import httpx

from .config import get_settings


class ClerkApiError(Exception):
    pass


@dataclass(frozen=True)
class ClerkProfile:
    email: str
    full_name: str | None


def fetch_clerk_user(user_id: str) -> ClerkProfile:
    settings = get_settings()
    if not settings.clerk_secret_key:
        raise ClerkApiError("CLERK_SECRET_KEY is not configured")

    response = httpx.get(
        f"https://api.clerk.com/v1/users/{user_id}",
        headers={"Authorization": f"Bearer {settings.clerk_secret_key}"},
        timeout=5.0,
    )
    if response.status_code != 200:
        raise ClerkApiError(f"Clerk API returned {response.status_code} for user {user_id}")

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
