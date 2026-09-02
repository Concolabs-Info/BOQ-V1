from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from ....database.connection import fetch_all, fetch_one
from ....modules.takeoff.floors import (
    analyze_floor,
    floor_demo_state,
    save_floor_demo_state,
    start_floor_analysis,
)
from ....services.ai.codex_account import (
    codex_account_status,
    logout_codex_account,
    start_codex_account_login,
)
from ....modules.takeoff.common import ensure_takeoff_floors

router = APIRouter(tags=["floor-takeoff"])


class DemoStateBody(BaseModel):
    model_config = ConfigDict(extra="allow")
    families: list[dict] = []
    zones: list[dict] = []
    uiState: dict = {}


@router.get("/projects/{project_id}/takeoff/floor/demo-state")
def get_demo_state(project_id: UUID):
    try:
        return floor_demo_state(project_id)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.put("/projects/{project_id}/takeoff/floor/demo-state")
def put_demo_state(project_id: UUID, body: DemoStateBody):
    try:
        return save_floor_demo_state(project_id, body.model_dump())
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/takeoff/floor/auth")
def floor_auth_status(project_id: UUID):
    # Project id is intentionally part of the route so the Floor workspace can
    # keep one consistent project-scoped API surface. Codex auth itself is the
    # local machine/session account and is never copied into project storage.
    del project_id
    return codex_account_status(refresh=True)


@router.post("/projects/{project_id}/takeoff/floor/auth/login")
def floor_auth_login(project_id: UUID):
    del project_id
    try:
        return start_codex_account_login()
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/floor/auth/logout")
def floor_auth_logout(project_id: UUID):
    del project_id
    try:
        return logout_codex_account()
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/floor/analyze")
def analyze_all(
    project_id: UUID,
    quality: str = Query(default="medium", pattern="^(easy|medium|expert|maximum)$"),
    force: bool = Query(default=False),
):
    try:
        # Match Beams: starting detection is quick; the project worker continues
        # in the background and demo-state exposes durable progress/results.
        return start_floor_analysis(project_id, quality, force=force)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/floor/{floor_id}/analyze")
def analyze_one(
    project_id: UUID,
    floor_id: UUID,
    quality: str = Query(default="medium", pattern="^(easy|medium|expert|maximum)$"),
    force: bool = Query(default=False),
):
    try:
        return analyze_floor(project_id, floor_id, quality, force=force)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/takeoff/floors")
def list_floors(project_id: UUID):
    floors = ensure_takeoff_floors(project_id)
    return {"floors": floors}


@router.get("/projects/{project_id}/takeoff/floor-spaces")
def list_floor_spaces(project_id: UUID, floor_id: UUID | None = None):
    if floor_id:
        rows = fetch_all("SELECT * FROM floor_space WHERE project_id=%s AND floor_id=%s ORDER BY friendly_number", (str(project_id), str(floor_id)))
    else:
        rows = fetch_all("SELECT * FROM floor_space WHERE project_id=%s ORDER BY floor_id,friendly_number", (str(project_id),))
    return {"items": rows}


@router.get("/projects/{project_id}/takeoff/floor-quantities")
def floor_quantities(project_id: UUID):
    finishes = fetch_all(
        """SELECT fd.id AS family_id,fd.original_tag AS mark,fd.name,fa.measurement_unit,
                  SUM(COALESCE(fa.nrm_quantity,0) * COALESCE(tf.typical_factor,1)) AS quantity,
                  SUM(COALESCE(fa.order_area_m2,0) * COALESCE(tf.typical_factor,1)) AS order_quantity,
                  bool_and(fa.user_confirmed) AS confirmed
           FROM finish_assignment fa JOIN finish_definition fd ON fd.id=fa.finish_id
           JOIN takeoff_floor tf ON tf.id=fa.floor_id
           WHERE fa.project_id=%s GROUP BY fd.id,fd.original_tag,fd.name,fa.measurement_unit ORDER BY fd.original_tag""",
        (str(project_id),),
    )
    works = fetch_all(
        """SELECT fwa.work_type,fwd.code,fwd.name,fwa.measurement_unit,
                  SUM(COALESCE(fwa.nrm_quantity,0) * COALESCE(tf.typical_factor,1)) AS quantity,
                  bool_and(fwa.user_confirmed) AS confirmed
           FROM floor_work_assignment fwa LEFT JOIN floor_work_definition fwd ON fwd.id=fwa.definition_id
           JOIN takeoff_floor tf ON tf.id=fwa.floor_id
           WHERE fwa.project_id=%s GROUP BY fwa.work_type,fwd.code,fwd.name,fwa.measurement_unit ORDER BY fwa.work_type,fwd.code""",
        (str(project_id),),
    )
    return {"finishes": finishes, "floor_works": works}


@router.get("/projects/{project_id}/takeoff/floor-finish-definitions")
def floor_finish_definitions(project_id: UUID):
    return {"items": fetch_all(
        "SELECT * FROM finish_definition WHERE project_id=%s AND status<>'deleted' ORDER BY original_tag NULLS LAST,name",
        (str(project_id),),
    )}


@router.get("/projects/{project_id}/takeoff/floor-work-assignments")
def floor_work_assignments(project_id: UUID, floor_id: UUID | None = None, work_type: str | None = None):
    where = ["fwa.project_id=%s"]
    params: list[str] = [str(project_id)]
    if floor_id:
        where.append("fwa.floor_id=%s")
        params.append(str(floor_id))
    if work_type:
        where.append("fwa.work_type=%s")
        params.append(work_type)
    rows = fetch_all(
        f"""SELECT fwa.*,fwd.code,fwd.name AS definition_name,fwd.description AS definition_description
              FROM floor_work_assignment fwa LEFT JOIN floor_work_definition fwd ON fwd.id=fwa.definition_id
              WHERE {' AND '.join(where)} ORDER BY fwa.floor_id,fwa.work_type,fwd.code NULLS LAST""",
        tuple(params),
    )
    return {"items": rows}


@router.get("/projects/{project_id}/takeoff/skirting-edges")
def skirting_edges(project_id: UUID, floor_id: UUID | None = None):
    where = ["fs.project_id=%s"]
    params: list[str] = [str(project_id)]
    if floor_id:
        where.append("fs.floor_id=%s")
        params.append(str(floor_id))
    rows = fetch_all(
        f"""SELECT se.*,fs.floor_id,fs.friendly_number,fs.name AS room_name
              FROM skirting_edge se JOIN floor_space fs ON fs.id=se.room_id
              WHERE {' AND '.join(where)} ORDER BY fs.floor_id,fs.friendly_number,se.edge_index""",
        tuple(params),
    )
    return {"items": rows}
