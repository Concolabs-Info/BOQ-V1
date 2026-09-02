from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from ...services.storage.paths import project_root

SCHEMA_VERSION = "quanto-takeoff-workspace-v1"
MAX_STATE_BYTES = 12 * 1024 * 1024


def _state_path(project_id: UUID | str) -> Path:
    return project_root(project_id) / "takeoff" / "workspace_state.json"


def load_workspace_state(project_id: UUID | str) -> dict[str, Any] | None:
    path = _state_path(project_id)
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def save_workspace_state(project_id: UUID | str, state: dict[str, Any]) -> dict[str, Any]:
    payload = {
        **state,
        "schemaVersion": SCHEMA_VERSION,
        "updatedAt": datetime.now(UTC).isoformat(),
    }
    encoded = json.dumps(payload, separators=(",", ":"), ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_STATE_BYTES:
        raise ValueError("Takeoff workspace state exceeds the 12 MB limit")
    path = _state_path(project_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(encoded, encoding="utf-8")
    temporary.replace(path)
    return payload
