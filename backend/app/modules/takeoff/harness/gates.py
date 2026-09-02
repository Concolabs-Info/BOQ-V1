from __future__ import annotations

from typing import Any

from ....database.connection import fetch_all, fetch_one
from .registry import get_expert


_ENTITY_QUERIES = {
    "floor": ("floor_space", "excluded=false", "user_confirmed"),
    "ceiling": ("ceiling_zone", "true", "user_confirmed"),
    "walls": ("wall_instance", "status<>'deleted'", "user_confirmed"),
    "doors-windows": ("opening_instance", "status<>'deleted'", "user_confirmed"),
    "doors": ("opening_instance", "status<>'deleted' AND kind='door'", "user_confirmed"),
    "windows": ("opening_instance", "status<>'deleted' AND kind='window'", "user_confirmed"),
    "roof": ("roof_plane", "status<>'deleted'", "user_confirmed"),
    "stairs-ramps": ("stair_ramp_instance", "status<>'deleted'", "user_confirmed"),
    "stairs": ("stair_ramp_instance", "status<>'deleted' AND kind='stair'", "user_confirmed"),
    "ramps": ("stair_ramp_instance", "status<>'deleted' AND kind='ramp'", "user_confirmed"),
}

_DIMENSION_PREDICATES = {
    "floor": "area_m2 IS NULL OR perimeter_m IS NULL",
    "ceiling": "profile_type NOT IN ('no_ceiling','open_to_sky') AND COALESCE(surface_area_m2,net_area_m2) IS NULL",
    "walls": "length_m IS NULL OR thickness_mm IS NULL OR height_mm IS NULL",
    "doors-windows": "clear_width_mm IS NULL OR clear_height_mm IS NULL",
    "doors": "kind='door' AND (clear_width_mm IS NULL OR clear_height_mm IS NULL)",
    "windows": "kind='window' AND (clear_width_mm IS NULL OR clear_height_mm IS NULL)",
    "roof": "measurement_status<>'measured'",
    "stairs-ramps": "quantity_status NOT IN ('ready','measured')",
    "stairs": "kind='stair' AND quantity_status NOT IN ('ready','measured')",
    "ramps": "kind='ramp' AND quantity_status NOT IN ('ready','measured')",
}


def verify_saved_geometry(project_id: str, element: str) -> dict[str, Any]:
    table, active_predicate, confirmed_column = _ENTITY_QUERIES[element]
    row = fetch_one(
        f"""SELECT count(*) FILTER (WHERE {active_predicate}) AS detected,
                   count(*) FILTER (WHERE {active_predicate} AND {confirmed_column}=true) AS confirmed
            FROM {table} WHERE project_id=%s""",
        (project_id,),
    ) or {}
    return {
        "detected": int(row.get("detected") or 0),
        "confirmed": int(row.get("confirmed") or 0),
        "storage_table": table,
    }


def resolve_dependency_state(project_id: str, element: str) -> dict[str, Any]:
    spec = get_expert(element)
    project = fetch_one("SELECT frame_version FROM project WHERE id=%s", (project_id,)) or {}
    frame_version = int(project.get("frame_version") or 0)
    states: list[dict[str, Any]] = []
    for fact_type in spec.consumes:
        rows = fetch_all(
            """SELECT publisher_element,fact_type,scope_ref,status,fact_version
               FROM takeoff_fact_set WHERE project_id=%s AND frame_version=%s AND fact_type=%s
               ORDER BY scope_ref""",
            (project_id, frame_version, fact_type),
        )
        states.append({"fact_type": fact_type, "available": bool(rows), "facts": rows})
    return {
        "frame_version": frame_version,
        "dependencies": states,
        "pending": [state["fact_type"] for state in states if not state["available"]],
    }


def validate_measurement_readiness(project_id: str, element: str) -> dict[str, Any]:
    table, active_predicate, _ = _ENTITY_QUERIES[element]
    predicate = _DIMENSION_PREDICATES[element]
    row = fetch_one(
        f"SELECT count(*) AS n FROM {table} WHERE project_id=%s AND {active_predicate} AND ({predicate})",
        (project_id,),
    ) or {}
    return {"unresolved_measurements": int(row.get("n") or 0), "storage_table": table}
