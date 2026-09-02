from __future__ import annotations

from .elements import ALL_SCOPE_SPECS
from .models import ElementScopeSpec

_SCOPE_SPECS: dict[str, ElementScopeSpec] = {spec.key: spec for spec in ALL_SCOPE_SPECS}

# Read-only aliases preserve existing URLs/UI names without creating duplicate implementations.
_ALIASES = {"doors": "doors-windows", "windows": "doors-windows", "floors": "floor", "ceilings": "ceiling", "roofs": "roof"}


def canonical_element(value: str) -> str:
    key = value.strip().lower()
    return _ALIASES.get(key, key)


def get_scope_spec(value: str) -> ElementScopeSpec:
    key = canonical_element(value)
    try:
        return _SCOPE_SPECS[key]
    except KeyError as exc:
        raise ValueError(f"Unsupported Takeoff element: {value}") from exc


def supported_elements() -> list[str]:
    return list(_SCOPE_SPECS)
