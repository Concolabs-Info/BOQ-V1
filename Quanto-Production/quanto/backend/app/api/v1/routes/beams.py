from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ....modules.takeoff.beams import answer_question, beam_state, page_image_path, save_editor_state, start_analysis

router = APIRouter(tags=["beams"])


@router.get("/projects/{project_id}/takeoff/beams/state")
def get_beam_state(project_id: UUID):
    try:
        return beam_state(project_id, auto_start=True)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/beams/analyze")
def analyze_beams(project_id: UUID, force: bool = False):
    try:
        return {"analysis": start_analysis(project_id, force=force)}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.put("/projects/{project_id}/takeoff/beams/editor-state")
def update_beam_editor_state(project_id: UUID, body: dict[str, Any]):
    try:
        return {"editor": save_editor_state(project_id, body)}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.put("/projects/{project_id}/takeoff/beams/questions/{question_id}")
def update_beam_question(project_id: UUID, question_id: str, body: dict[str, Any]):
    try:
        return {"editor": answer_question(project_id, question_id, str(body.get("answer") or ""))}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/takeoff/beams/pages/{page_index}/image")
def get_beam_page_image(project_id: UUID, page_index: int):
    try:
        path = page_image_path(project_id, page_index)
        return FileResponse(path, media_type="image/png", filename=f"beam-page-{page_index + 1}.png")
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
