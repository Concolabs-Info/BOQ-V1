from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from ....database.connection import fetch_all
from ....modules.takeoff.walls import (
    analyze_wall_floor,
    save_wall_demo_state,
    start_wall_analysis,
    wall_demo_state,
    wall_quantities,
)
from ....services.ai.codex_account import codex_account_status, logout_codex_account, start_codex_account_login

router = APIRouter(tags=["wall-takeoff"])


class WallDemoStateBody(BaseModel):
    model_config = ConfigDict(extra="allow")
    families: list[dict] = []
    finishFamilies: list[dict] = []
    walls: list[dict] = []
    uiState: dict = {}


@router.get("/projects/{project_id}/takeoff/walls/demo-state")
def get_demo_state(project_id: UUID):
    try:
        return wall_demo_state(project_id)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.put("/projects/{project_id}/takeoff/walls/demo-state")
def put_demo_state(project_id: UUID, body: WallDemoStateBody):
    try:
        return save_wall_demo_state(project_id, body.model_dump())
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/takeoff/walls/auth")
def wall_auth_status(project_id: UUID):
    del project_id
    return codex_account_status(refresh=True)


@router.post("/projects/{project_id}/takeoff/walls/auth/login")
def wall_auth_login(project_id: UUID):
    del project_id
    try:
        return start_codex_account_login()
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/walls/auth/logout")
def wall_auth_logout(project_id: UUID):
    del project_id
    try:
        return logout_codex_account()
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/walls/analyze")
def analyze_all(
    project_id: UUID,
    quality: str = Query(default="medium", pattern="^(easy|medium|expert|maximum)$"),
    force: bool = Query(default=False),
):
    try:
        return start_wall_analysis(project_id, quality, force=force)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/walls/{floor_id}/analyze")
def analyze_one(
    project_id: UUID,
    floor_id: UUID,
    quality: str = Query(default="medium", pattern="^(easy|medium|expert|maximum)$"),
    force: bool = Query(default=False),
):
    try:
        return analyze_wall_floor(project_id, floor_id, quality, force=force)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/takeoff/wall-instances")
def list_wall_instances(project_id: UUID, floor_id: UUID | None = None):
    if floor_id:
        rows = fetch_all("SELECT * FROM wall_instance WHERE project_id=%s AND floor_id=%s ORDER BY created_at", (str(project_id), str(floor_id)))
    else:
        rows = fetch_all("SELECT * FROM wall_instance WHERE project_id=%s ORDER BY floor_id,created_at", (str(project_id),))
    return {"items": rows}


@router.get("/projects/{project_id}/takeoff/wall-definitions")
def list_wall_definitions(project_id: UUID):
    return {"items": fetch_all("SELECT * FROM wall_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code", (str(project_id),))}


@router.get("/projects/{project_id}/takeoff/wall-finish-definitions")
def list_wall_finish_definitions(project_id: UUID):
    return {"items": fetch_all("SELECT * FROM wall_finish_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code", (str(project_id),))}


@router.get("/projects/{project_id}/takeoff/wall-opening-links")
def list_wall_openings(project_id: UUID, floor_id: UUID | None = None):
    if floor_id:
        rows = fetch_all("SELECT * FROM wall_opening_link WHERE project_id=%s AND floor_id=%s ORDER BY created_at", (str(project_id), str(floor_id)))
    else:
        rows = fetch_all("SELECT * FROM wall_opening_link WHERE project_id=%s ORDER BY floor_id,created_at", (str(project_id),))
    return {"items": rows}


@router.get("/projects/{project_id}/takeoff/wall-review-items")
def list_wall_review(project_id: UUID, unresolved_only: bool = True):
    rows = fetch_all(
        "SELECT * FROM wall_review_item WHERE project_id=%s AND (%s=false OR resolved=false) ORDER BY created_at",
        (str(project_id), unresolved_only),
    )
    return {"items": rows}


@router.get("/projects/{project_id}/takeoff/wall-quantities")
def get_wall_quantities(project_id: UUID):
    return wall_quantities(project_id)
