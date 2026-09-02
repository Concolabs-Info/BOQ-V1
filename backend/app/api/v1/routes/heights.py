from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from ....database.json_value import Jsonb

from ....modules.pre.height import eligible_sources, height_from_band, suggest_heights
from ....modules.pre.access import ensure_project_mutable, project_for_storey
from ....database.connection import fetch_one, transaction
from ..schemas import HeightSet, HeightSuggest

router = APIRouter(tags=["height"])


@router.get("/projects/{project_id}/height-candidates")
def candidates(project_id: UUID):
    return eligible_sources(project_id)


@router.post("/projects/{project_id}/heights/suggest")
def suggest(project_id: UUID, body: HeightSuggest):
    try: ensure_project_mutable(project_id)
    except (PermissionError, ValueError) as exc: raise HTTPException(409 if isinstance(exc, PermissionError) else 404, str(exc)) from exc
    if body.supporting_viewport_id == body.primary_viewport_id:
        raise HTTPException(400, "Supporting source must be different from primary source")
    try:
        return suggest_heights(project_id, body.primary_viewport_id, body.supporting_viewport_id)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.put("/storeys/{storey_id}/height")
def set_height(storey_id: UUID, body: HeightSet):
    pid = project_for_storey(storey_id)
    if pid:
        try: ensure_project_mutable(pid)
        except PermissionError as exc: raise HTTPException(409, str(exc)) from exc
    current = fetch_one("SELECT * FROM storey WHERE id=%s", (str(storey_id),))
    if not current:
        raise HTTPException(404, "Storey not found")
    evidence = dict(current.get("height_evidence") or {})
    if body.height_mm is not None:
        height_mm = body.height_mm
        # Keep existing AI evidence/position when a user confirms or corrects
        # the numeric value. A purely manual value naturally keeps these null.
        y_top = current.get("height_y_top")
        y_bottom = current.get("height_y_bottom")
        source_viewport_id = current.get("height_source_viewport_id")
        basis = body.basis
        evidence["user_adjustment"] = {"height_mm": height_mm, "mode": "typed"}
    else:
        try:
            height_mm, line_evidence = height_from_band(pid, body.source_viewport_id, body.y_top, body.y_bottom)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        y_top = body.y_top
        y_bottom = body.y_bottom
        source_viewport_id = body.source_viewport_id
        basis = "user_adjusted_line"
        evidence["user_adjustment"] = {**line_evidence, "height_mm": height_mm, "mode": "dragged_line"}
    with transaction() as conn:
        row = conn.execute(
            """UPDATE storey SET height_mm=%s,height_source_viewport_id=%s,height_y_top=%s,height_y_bottom=%s,height_basis=%s,
               height_evidence=%s,status='saved_not_confirmed' WHERE id=%s RETURNING *""",
            (height_mm, str(source_viewport_id) if source_viewport_id else None, y_top, y_bottom, basis, Jsonb(evidence), str(storey_id)),
        ).fetchone()
    return dict(row)
