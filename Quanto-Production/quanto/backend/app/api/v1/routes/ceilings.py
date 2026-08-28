from __future__ import annotations

from uuid import UUID
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from ....database.connection import fetch_all
from ....modules.takeoff.ceilings import analyze_project_ceilings, ceiling_demo_state, save_ceiling_demo_state

router = APIRouter(tags=["ceiling-takeoff"])


class DemoStateBody(BaseModel):
    model_config = ConfigDict(extra="allow")
    families: list[dict] = []
    zones: list[dict] = []
    uiState: dict = {}


@router.get("/projects/{project_id}/takeoff/ceiling/demo-state")
def get_demo_state(project_id: UUID):
    try:
        return ceiling_demo_state(project_id)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.put("/projects/{project_id}/takeoff/ceiling/demo-state")
def put_demo_state(project_id: UUID, body: DemoStateBody):
    try:
        return save_ceiling_demo_state(project_id, body.model_dump())
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/ceiling/analyze")
def analyze_all(project_id: UUID, quality: str = Query(default="medium", pattern="^(easy|medium|expert|maximum)$")):
    try:
        return analyze_project_ceilings(project_id, quality)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/takeoff/ceiling-zones")
def list_ceiling_zones(project_id: UUID, floor_id: UUID | None = None):
    if floor_id:
        rows = fetch_all("SELECT * FROM ceiling_zone WHERE project_id=%s AND floor_id=%s ORDER BY zone_number", (str(project_id), str(floor_id)))
    else:
        rows = fetch_all("SELECT * FROM ceiling_zone WHERE project_id=%s ORDER BY floor_id,zone_number", (str(project_id),))
    return {"items": rows}


@router.get("/projects/{project_id}/takeoff/ceiling-quantities")
def ceiling_quantities(project_id: UUID):
    rows = fetch_all(
        """SELECT cd.id AS family_id,cd.code,cd.name,cd.system_type,
                  SUM(COALESCE(cz.surface_area_m2,cz.net_area_m2,0) * COALESCE(tf.typical_factor,1)) AS quantity_m2,
                  bool_and(cz.user_confirmed) AS confirmed,
                  bool_or(cz.surface_area_m2 IS NULL AND cz.profile_type NOT IN ('no_ceiling','open_to_sky')) AS surface_review_required
           FROM ceiling_zone cz LEFT JOIN ceiling_definition cd ON cd.id=cz.definition_id
           JOIN takeoff_floor tf ON tf.id=cz.floor_id
           WHERE cz.project_id=%s AND cz.include_in_boq=true
           GROUP BY cd.id,cd.code,cd.name,cd.system_type ORDER BY cd.code""",
        (str(project_id),),
    )
    features = fetch_all(
        """SELECT feature_type,measurement_unit,SUM(COALESCE(net_quantity,0) * COALESCE(tf.typical_factor,1)) AS quantity,
                  bool_and(cf.user_confirmed) AS confirmed
           FROM ceiling_feature cf JOIN takeoff_floor tf ON tf.id=cf.floor_id
           WHERE cf.project_id=%s AND cf.include_in_boq=true GROUP BY feature_type,measurement_unit ORDER BY feature_type""",
        (str(project_id),),
    )
    return {"ceilings": rows, "features": features}


@router.get("/projects/{project_id}/takeoff/ceiling-definitions")
def ceiling_definitions(project_id: UUID):
    return {"items": fetch_all(
        "SELECT * FROM ceiling_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code NULLS LAST,name",
        (str(project_id),),
    )}


@router.get("/projects/{project_id}/takeoff/ceiling-features")
def ceiling_features(project_id: UUID, floor_id: UUID | None = None):
    if floor_id:
        rows = fetch_all(
            "SELECT * FROM ceiling_feature WHERE project_id=%s AND floor_id=%s ORDER BY feature_type,name",
            (str(project_id), str(floor_id)),
        )
    else:
        rows = fetch_all(
            "SELECT * FROM ceiling_feature WHERE project_id=%s ORDER BY floor_id,feature_type,name",
            (str(project_id),),
        )
    return {"items": rows}
