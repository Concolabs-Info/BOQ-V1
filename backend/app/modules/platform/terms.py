"""Record which terms version a Clerk user has agreed to."""
from __future__ import annotations

from datetime import datetime

# Keep in lockstep with the `version` field in frontend/content/terms.md.
#
# Onboarding no longer has a dedicated accept-terms screen: `create_company`
# and `claim_invitation` stamp this version automatically, so new users
# always pass `has_accepted_current` immediately. `access.py`/`membership.py`
# still 403 any signed-in user whose stamped version doesn't match this one
# (`enforce_workspace_access`, `require_company`) - if this value is ever
# bumped, build a re-consent path before shipping the bump, or every
# existing account gets locked out of workspace routes with no UI to
# recover.
CURRENT_TERMS_VERSION = "2026-09-17"


def has_accepted_current(terms_accepted_at: datetime | None, terms_version: str | None) -> bool:
    return terms_accepted_at is not None and (terms_version or "").strip() == CURRENT_TERMS_VERSION
