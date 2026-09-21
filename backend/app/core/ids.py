"""Guard user-supplied ids before they reach a uuid-typed column. Postgres
raises InvalidTextRepresentation for a non-UUID string, which is an
unhandled 500 rather than a clean 4xx if it isn't checked first."""
from __future__ import annotations

from uuid import UUID


def is_valid_uuid(value: str) -> bool:
    try:
        UUID(str(value))
        return True
    except (ValueError, AttributeError, TypeError):
        return False
