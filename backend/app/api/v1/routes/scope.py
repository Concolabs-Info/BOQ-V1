from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query

from ....modules.takeoff.scope.engine import get_scope, run_scope
from ....modules.takeoff.scope.questions import answer_question
from ....modules.takeoff.scope.registry import canonical_element, supported_elements
from ..schemas import ScopeAnswer

router = APIRouter(tags=["takeoff-scope"])


@router.get("/takeoff/scope/elements")
def get_scope_elements():
    return {"elements": supported_elements()}


@router.get("/projects/{project_id}/takeoff/{element}/scope")
def get_element_scope(project_id: UUID, element: str, auto_run: bool = Query(default=True)):
    try:
        return get_scope(str(project_id), element, auto_run=auto_run)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/{element}/scope/run")
def run_element_scope(project_id: UUID, element: str, force: bool = Query(default=True)):
    try:
        return run_scope(str(project_id), element, force=force)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/{element}/scope/questions/{question_id}/answer")
def answer_element_scope_question(project_id: UUID, element: str, question_id: UUID, body: ScopeAnswer):
    try:
        current = get_scope(str(project_id), element, auto_run=True)
        canonical = canonical_element(element)
        answer = body.model_dump(exclude_none=True)
        answer_question(str(project_id), canonical, int(current["frame_version"]), str(question_id), answer)
        return run_scope(str(project_id), canonical, force=True)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
