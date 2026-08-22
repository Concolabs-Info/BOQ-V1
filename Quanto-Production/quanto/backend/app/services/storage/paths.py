from __future__ import annotations

from pathlib import Path
from uuid import UUID

from ...core.config import get_settings


def root() -> Path:
    value = get_settings().storage_root.resolve()
    value.mkdir(parents=True, exist_ok=True)
    return value


def project_root(project_id: UUID | str) -> Path:
    value = root() / str(project_id)
    value.mkdir(parents=True, exist_ok=True)
    return value


def source_dir(project_id: UUID | str) -> Path:
    value = project_root(project_id) / "source"
    value.mkdir(parents=True, exist_ok=True)
    return value


def renders_dir(project_id: UUID | str) -> Path:
    value = project_root(project_id) / "renders"
    value.mkdir(parents=True, exist_ok=True)
    return value


def crops_dir(project_id: UUID | str) -> Path:
    value = project_root(project_id) / "crops"
    value.mkdir(parents=True, exist_ok=True)
    return value


def resolve_key(key: str) -> Path:
    base = root()
    candidate = (base / key).resolve()
    if candidate != base and base not in candidate.parents:
        raise ValueError("Storage key escapes STORAGE_ROOT")
    return candidate


def key_for(path: Path) -> str:
    candidate = path.resolve()
    base = root()
    if candidate != base and base not in candidate.parents:
        raise ValueError("Storage path is outside STORAGE_ROOT")
    return candidate.relative_to(base).as_posix()
