"""Small adapter so pure rule tests do not require psycopg to be installed."""
from __future__ import annotations

from typing import Any

try:
    from psycopg.types.json import Jsonb as _PsycopgJsonb
except ModuleNotFoundError:  # pragma: no cover - used only in dependency-light test environments
    _PsycopgJsonb = None


def Jsonb(value: Any) -> Any:
    """Return psycopg's Jsonb wrapper in production, the raw value in pure unit tests."""
    return _PsycopgJsonb(value) if _PsycopgJsonb is not None else value
