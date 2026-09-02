from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from ....database.connection import fetch_all
from ....modules.takeoff.columns import (
    analyze_column_context,
    column_analysis_status,
    column_demo_state,
    column_quantities,
    save_column_demo_state,
    start_column_analysis,
)
from ....services.ai.codex_account import codex_account_status, logout_codex_account, start_codex_account_login

router = APIRouter(tags=["columns-takeoff"])


class ColumnDemoStateBody(BaseModel):
    model_config = ConfigDict(extra="allow")
    families: list[dict] = []
    columns: list[dict] = []
    uiState: dict = {}


@router.get("/projects/{project_id}/takeoff/columns/demo-state")
def get_demo_state(project_id: UUID):
    try:
        return column_demo_state(project_id)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.put("/projects/{project_id}/takeoff/columns/demo-state")
def put_demo_state(project_id: UUID, body: ColumnDemoStateBody):
    try:
        return save_column_demo_state(project_id, body.model_dump())
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/takeoff/columns/auth")
def account_status(project_id: UUID):
    del project_id
    return codex_account_status(refresh=True)


@router.post("/projects/{project_id}/takeoff/columns/auth/login")
def account_login(project_id: UUID):
    del project_id
    try:
        return start_codex_account_login()
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/columns/auth/logout")
def account_logout(project_id: UUID):
    del project_id
    try:
        return logout_codex_account()
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/takeoff/columns/analysis")
def analysis_status(project_id: UUID):
    return column_analysis_status(project_id)


@router.post("/projects/{project_id}/takeoff/columns/analyze")
def analyze_all(project_id: UUID, quality: str = Query(default="medium", pattern="^(easy|medium|expert|maximum)$"), force: bool = Query(default=False)):
    try:
        return start_column_analysis(project_id, quality, force=force)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/columns/{floor_id}/{viewport_id}/analyze")
def analyze_one(project_id: UUID, floor_id: UUID, viewport_id: UUID,
                quality: str = Query(default="medium", pattern="^(easy|medium|expert|maximum)$"), force: bool = Query(default=False)):
    try:
        return analyze_column_context(project_id, floor_id, viewport_id, quality=quality, force=force)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/takeoff/column-definitions")
def list_definitions(project_id: UUID):
    return {"items": fetch_all("SELECT * FROM column_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code", (str(project_id),))}


@router.get("/projects/{project_id}/takeoff/column-instances")
def list_instances(project_id: UUID, floor_id: UUID | None = None):
    if floor_id:
        rows = fetch_all("SELECT * FROM column_instance WHERE project_id=%s AND floor_id=%s AND status<>'deleted' ORDER BY created_at", (str(project_id), str(floor_id)))
    else:
        rows = fetch_all("SELECT * FROM column_instance WHERE project_id=%s AND status<>'deleted' ORDER BY floor_id,created_at", (str(project_id),))
    return {"items": rows}


@router.get("/projects/{project_id}/takeoff/column-review-items")
def list_review_items(project_id: UUID, unresolved_only: bool = True):
    rows = fetch_all(
        "SELECT * FROM column_review_item WHERE project_id=%s AND (%s=false OR resolved=false) ORDER BY created_at",
        (str(project_id), unresolved_only),
    )
    return {"items": rows}


@router.get("/projects/{project_id}/takeoff/column-quantities")
def get_quantities(project_id: UUID):
    return column_quantities(project_id)
