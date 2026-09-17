"""Record which terms version a Clerk user has agreed to."""
from __future__ import annotations

from datetime import datetime

from ...database.connection import execute

# Keep in lockstep with the `version` field in frontend/content/terms.md.
CURRENT_TERMS_VERSION = "2026-09-17"


class TermsError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def has_accepted_current(terms_accepted_at: datetime | None, terms_version: str | None) -> bool:
    return terms_accepted_at is not None and (terms_version or "").strip() == CURRENT_TERMS_VERSION


def accept_terms(user_id: str, version: str) -> str:
    cleaned = (version or "").strip()
    if not cleaned:
        raise TermsError("invalid", "Accept the current terms to continue.")
    if cleaned != CURRENT_TERMS_VERSION:
        raise TermsError("invalid", "Accept the current terms to continue.")
    execute(
        "UPDATE app_user SET terms_accepted_at = now(), terms_version = %s WHERE id = %s",
        (cleaned, user_id),
    )
    return cleaned
