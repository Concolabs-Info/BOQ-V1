from __future__ import annotations

from .registry import get_expert


def dependency_contract(element: str) -> dict[str, object]:
    spec = get_expert(element)
    return {
        "element": spec.key,
        "consumes": list(spec.consumes),
        "publishes": list(spec.publishes),
        "rule": "Dependencies hold only the affected derived fact/quantity; they do not invalidate unrelated detected geometry.",
    }
