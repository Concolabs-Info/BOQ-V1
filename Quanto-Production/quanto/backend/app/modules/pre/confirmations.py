from __future__ import annotations

import hashlib
import json
from typing import Any
from uuid import UUID

from ...database.connection import fetch_all, fetch_one, transaction


def canonical_hash(value: Any) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def entity_content(entity_type: str, entity_id: UUID | str) -> Any:
    eid = str(entity_id)
    if entity_type == "sheet":
        return fetch_one("SELECT id, sheet_no, title, revision, included FROM sheet WHERE id=%s", (eid,))
    if entity_type == "sheet_set":
        return fetch_all(
            """SELECT s.id, s.sheet_no, s.title, s.revision, s.included
               FROM sheet s JOIN page p ON p.id=s.page_id JOIN document d ON d.id=p.document_id
               WHERE d.project_id=%s ORDER BY d.filename, p.page_number""",
            (eid,),
        )
    if entity_type == "viewport":
        return fetch_one(
            "SELECT id, name, discipline, view_kind, subjects, bbox_mpt, level_label, relevant, crop_version FROM viewport WHERE id=%s",
            (eid,),
        )
    if entity_type == "storey_stack":
        return fetch_all(
            "SELECT id, name, level_index, typical_group FROM storey WHERE project_id=%s ORDER BY level_index",
            (eid,),
        )
    if entity_type == "height_stack":
        return fetch_all(
            "SELECT id, level_index, height_mm, height_source_viewport_id, height_y_top, height_y_bottom, height_basis FROM storey WHERE project_id=%s ORDER BY level_index",
            (eid,),
        )
    if entity_type == "scale":
        return fetch_one(
            "SELECT id, viewport_id, method, factor_x, factor_y, anisotropy_ratio, checks, crop_version, scale_version, status FROM scale_fit WHERE id=%s",
            (eid,),
        )
    if entity_type == "spec_item":
        return fetch_one(
            "SELECT id, kind, name, topic, raw_text, table_json, found, bbox_mpt FROM spec_item WHERE id=%s",
            (eid,),
        )
    raise ValueError(f"Unsupported confirmation entity_type={entity_type}")


def content_hash(entity_type: str, entity_id: UUID | str) -> str:
    value = entity_content(entity_type, entity_id)
    if value is None:
        raise ValueError(f"Entity not found: {entity_type}/{entity_id}")
    return canonical_hash(value)


def confirm(entity_type: str, entity_id: UUID, actor: str = "user") -> dict[str, Any]:
    h = content_hash(entity_type, entity_id)
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO confirmation(entity_type, entity_id, content_hash, actor)
               VALUES (%s,%s,%s,%s)
               RETURNING *""",
            (entity_type, str(entity_id), h, actor),
        ).fetchone()
    return dict(row)


def is_confirmed(entity_type: str, entity_id: UUID | str) -> bool:
    current = content_hash(entity_type, entity_id)
    row = fetch_one(
        """SELECT content_hash FROM confirmation
           WHERE entity_type=%s AND entity_id=%s
           ORDER BY confirmed_at DESC LIMIT 1""",
        (entity_type, str(entity_id)),
    )
    return bool(row and row["content_hash"] == current)
