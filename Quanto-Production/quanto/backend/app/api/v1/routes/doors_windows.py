from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from ....database.connection import fetch_all
from ....modules.takeoff.doors_windows import (
    analyze_opening_context,
    opening_analysis_status,
    opening_demo_state,
    opening_quantities,
    save_opening_demo_state,
    start_opening_analysis,
)
from ....services.ai.codex_account import codex_account_status, logout_codex_account, start_codex_account_login

router = APIRouter(tags=["doors-windows-takeoff"])


class OpeningDemoStateBody(BaseModel):
    model_config = ConfigDict(extra="allow")
    families: list[dict] = []
    openings: list[dict] = []
    uiState: dict = {}


@router.get("/projects/{project_id}/takeoff/doors-windows/demo-state")
def get_demo_state(project_id: UUID):
    try:
        return opening_demo_state(project_id)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.put("/projects/{project_id}/takeoff/doors-windows/demo-state")
def put_demo_state(project_id: UUID, body: OpeningDemoStateBody):
    try:
        return save_opening_demo_state(project_id, body.model_dump())
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/takeoff/doors-windows/auth")
def account_status(project_id: UUID):
    del project_id
    return codex_account_status(refresh=True)


@router.post("/projects/{project_id}/takeoff/doors-windows/auth/login")
def account_login(project_id: UUID):
    del project_id
    try:
        return start_codex_account_login()
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/doors-windows/auth/logout")
def account_logout(project_id: UUID):
    del project_id
    try:
        return logout_codex_account()
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/takeoff/doors-windows/analysis")
def analysis_status(project_id: UUID):
    return opening_analysis_status(project_id)


@router.post("/projects/{project_id}/takeoff/doors-windows/analyze")
def analyze_all(
    project_id: UUID,
    quality: str = Query(default="medium", pattern="^(easy|medium|expert|maximum)$"),
    force: bool = Query(default=False),
):
    try:
        return start_opening_analysis(project_id, quality, force=force)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/doors-windows/{floor_id}/{viewport_id}/analyze")
def analyze_one(
    project_id: UUID,
    floor_id: UUID,
    viewport_id: UUID,
    quality: str = Query(default="medium", pattern="^(easy|medium|expert|maximum)$"),
    force: bool = Query(default=False),
):
    try:
        return analyze_opening_context(project_id, floor_id, viewport_id, quality=quality, force=force)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/takeoff/opening-definitions")
def list_definitions(project_id: UUID, kind: str | None = None):
    if kind in {"door", "window"}:
        rows = fetch_all("SELECT * FROM opening_definition WHERE project_id=%s AND kind=%s AND status<>'deleted' ORDER BY code", (str(project_id), kind))
    else:
        rows = fetch_all("SELECT * FROM opening_definition WHERE project_id=%s AND status<>'deleted' ORDER BY kind,code", (str(project_id),))
    return {"items": rows}


@router.get("/projects/{project_id}/takeoff/opening-instances")
def list_instances(project_id: UUID, floor_id: UUID | None = None, kind: str | None = None):
    clauses = ["project_id=%s", "status<>'deleted'"]
    args: list[str] = [str(project_id)]
    if floor_id:
        clauses.append("floor_id=%s")
        args.append(str(floor_id))
    if kind in {"door", "window"}:
        clauses.append("kind=%s")
        args.append(kind)
    return {"items": fetch_all(f"SELECT * FROM opening_instance WHERE {' AND '.join(clauses)} ORDER BY floor_id,created_at", tuple(args))}


@router.get("/projects/{project_id}/takeoff/opening-review-items")
def list_review_items(project_id: UUID, unresolved_only: bool = True):
    rows = fetch_all(
        "SELECT * FROM opening_review_item WHERE project_id=%s AND (%s=false OR resolved=false) ORDER BY created_at",
        (str(project_id), unresolved_only),
    )
    return {"items": rows}


@router.get("/projects/{project_id}/takeoff/opening-quantities")
def get_quantities(project_id: UUID):
    return opening_quantities(project_id)
