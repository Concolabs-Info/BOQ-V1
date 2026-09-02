from __future__ import annotations

from typing import Any

from ....database.connection import fetch_all, fetch_one, transaction
from ....database.json_value import Jsonb
from ..common import require_frozen_project


def _upsert(project_id: str, publisher: str, fact_type: str, scope_ref: str, frame_version: int,
            status: str, payload: dict[str, Any]) -> None:
    with transaction() as conn:
        conn.execute(
            """INSERT INTO takeoff_fact_set(project_id,publisher_element,fact_type,scope_ref,frame_version,status,payload_json,fact_version,updated_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,1,now())
               ON CONFLICT(project_id,publisher_element,fact_type,scope_ref,frame_version) DO UPDATE SET
                 status=excluded.status,payload_json=excluded.payload_json,
                 fact_version=takeoff_fact_set.fact_version+1,updated_at=now()""",
            (project_id, publisher, fact_type, scope_ref, frame_version, status, Jsonb(payload)),
        )


def _floor_facts(project_id: str, frame_version: int) -> dict[str, Any]:
    rows = fetch_all(
        """SELECT tf.storey_id,tf.id AS floor_id,tf.name,COUNT(fs.id) FILTER (WHERE fs.excluded=false) AS item_count,
                  COALESCE(SUM(fs.area_m2) FILTER (WHERE fs.excluded=false AND fs.geometry_status IN ('wall_verified','user_verified')),0) AS area_m2,
                  COUNT(fs.id) FILTER (WHERE fs.excluded=false AND fs.user_confirmed=false) AS unconfirmed,
                  COUNT(fs.id) FILTER (WHERE fs.excluded=false AND fs.space_kind<>'connector' AND COALESCE(fs.geometry_status,'boundary_review') NOT IN ('wall_verified','user_verified')) AS boundary_review
           FROM takeoff_floor tf LEFT JOIN floor_space fs ON fs.floor_id=tf.id
           WHERE tf.project_id=%s GROUP BY tf.storey_id,tf.id,tf.name""",
        (project_id,),
    )
    total = 0
    for row in rows:
        if not row.get("storey_id"):
            continue
        count = int(row.get("item_count") or 0)
        total += count
        status = "complete_empty" if count == 0 else "pending" if int(row.get("unconfirmed") or 0) or int(row.get("boundary_review") or 0) else "complete"
        _upsert(project_id, "floor", "floor_geometry", str(row["storey_id"]), frame_version, status, {
            "floor_id": str(row["floor_id"]), "name": row.get("name"), "space_count": count,
            "area_m2": round(float(row.get("area_m2") or 0), 4), "unconfirmed": int(row.get("unconfirmed") or 0),
            "boundary_review": int(row.get("boundary_review") or 0),
        })
    return {"floor_geometry": total}


def _ceiling_facts(project_id: str, frame_version: int) -> dict[str, Any]:
    rows = fetch_all(
        """SELECT tf.storey_id,tf.id AS floor_id,COUNT(cz.id) AS item_count,
                  COALESCE(SUM(COALESCE(cz.surface_area_m2,cz.net_area_m2,0)),0) AS area_m2,
                  COUNT(cz.id) FILTER (WHERE cz.user_confirmed=false) AS unconfirmed
           FROM takeoff_floor tf LEFT JOIN ceiling_zone cz ON cz.floor_id=tf.id
           WHERE tf.project_id=%s GROUP BY tf.storey_id,tf.id""",
        (project_id,),
    )
    total = 0
    for row in rows:
        if not row.get("storey_id"):
            continue
        count = int(row.get("item_count") or 0); total += count
        status = "complete_empty" if count == 0 else "pending" if int(row.get("unconfirmed") or 0) else "complete"
        _upsert(project_id, "ceiling", "ceiling_geometry", str(row["storey_id"]), frame_version, status, {
            "floor_id": str(row["floor_id"]), "zone_count": count,
            "surface_area_m2": round(float(row.get("area_m2") or 0), 4), "unconfirmed": int(row.get("unconfirmed") or 0),
        })
    return {"ceiling_geometry": total}


def _wall_facts(project_id: str, frame_version: int) -> dict[str, Any]:
    rows = fetch_all(
        """SELECT tf.storey_id,tf.id AS floor_id,COUNT(wi.id) AS item_count,
                  COALESCE(SUM(wi.length_m),0) AS length_m,COALESCE(SUM(wi.net_area_m2),0) AS net_area_m2,
                  COUNT(wi.id) FILTER (WHERE wi.user_confirmed=false) AS unconfirmed
           FROM takeoff_floor tf LEFT JOIN wall_instance wi ON wi.floor_id=tf.id
           WHERE tf.project_id=%s GROUP BY tf.storey_id,tf.id""",
        (project_id,),
    )
    total = 0
    for row in rows:
        if not row.get("storey_id"):
            continue
        count = int(row.get("item_count") or 0); total += count
        status = "complete_empty" if count == 0 else "pending" if int(row.get("unconfirmed") or 0) else "complete"
        _upsert(project_id, "walls", "wall_geometry", str(row["storey_id"]), frame_version, status, {
            "floor_id": str(row["floor_id"]), "wall_count": count,
            "length_m": round(float(row.get("length_m") or 0), 4), "net_area_m2": round(float(row.get("net_area_m2") or 0), 4),
            "unconfirmed": int(row.get("unconfirmed") or 0),
        })
    return {"wall_geometry": total}


def _opening_facts(project_id: str, frame_version: int) -> dict[str, Any]:
    rows = fetch_all(
        """SELECT tf.storey_id,tf.id AS floor_id,oi.kind,COUNT(oi.id) AS item_count,
                  COALESCE(SUM(oi.gross_opening_area_m2),0) AS area_m2,
                  COUNT(oi.id) FILTER (WHERE oi.user_confirmed=false) AS unconfirmed
           FROM takeoff_floor tf LEFT JOIN opening_instance oi ON oi.floor_id=tf.id
           WHERE tf.project_id=%s GROUP BY tf.storey_id,tf.id,oi.kind""",
        (project_id,),
    )
    totals = {"door": 0, "window": 0}
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        if not row.get("storey_id") or not row.get("kind"):
            continue
        grouped.setdefault(str(row["storey_id"]), []).append(row)
        totals[str(row["kind"])] = totals.get(str(row["kind"]), 0) + int(row.get("item_count") or 0)
    for scope_ref, items in grouped.items():
        for kind, fact_type in (("door", "door_openings"), ("window", "window_openings")):
            row = next((x for x in items if x.get("kind") == kind), None)
            count = int(row.get("item_count") or 0) if row else 0
            status = "complete_empty" if count == 0 else "pending" if row and int(row.get("unconfirmed") or 0) else "complete"
            _upsert(project_id, "doors-windows", fact_type, scope_ref, frame_version, status, {
                "count": count, "gross_opening_area_m2": round(float(row.get("area_m2") or 0), 4) if row else 0.0,
                "unconfirmed": int(row.get("unconfirmed") or 0) if row else 0,
            })
    return {"door_openings": totals.get("door", 0), "window_openings": totals.get("window", 0)}


def _roof_facts(project_id: str, frame_version: int) -> dict[str, Any]:
    rows = fetch_all(
        """SELECT COALESCE(tf.storey_id::text,'project') AS scope_ref,rl.id AS level_id,COUNT(rp.id) AS item_count,
                  COALESCE(SUM(rp.net_surface_area_m2),0) AS area_m2,
                  COUNT(rp.id) FILTER (WHERE rp.user_confirmed=false) AS unconfirmed
           FROM roof_level rl LEFT JOIN takeoff_floor tf ON tf.id=rl.host_floor_id
           LEFT JOIN roof_plane rp ON rp.level_id=rl.id WHERE rl.project_id=%s
           GROUP BY COALESCE(tf.storey_id::text,'project'),rl.id""",
        (project_id,),
    )
    total = 0
    for row in rows:
        count = int(row.get("item_count") or 0); total += count
        status = "complete_empty" if count == 0 else "pending" if int(row.get("unconfirmed") or 0) else "complete"
        _upsert(project_id, "roof", "roof_geometry", str(row.get("scope_ref") or "project"), frame_version, status, {
            "roof_level_id": str(row["level_id"]), "plane_count": count,
            "net_surface_area_m2": round(float(row.get("area_m2") or 0), 4), "unconfirmed": int(row.get("unconfirmed") or 0),
        })
    return {"roof_geometry": total}


def _stair_ramp_facts(project_id: str, frame_version: int) -> dict[str, Any]:
    rows = fetch_all(
        """SELECT tf.storey_id,sri.kind,COUNT(sri.id) AS item_count,
                  COUNT(sri.id) FILTER (WHERE sri.user_confirmed=false) AS unconfirmed
           FROM stair_ramp_instance sri JOIN takeoff_floor tf ON tf.id=sri.floor_id
           WHERE sri.project_id=%s GROUP BY tf.storey_id,sri.kind""",
        (project_id,),
    )
    totals = {"stair": 0, "ramp": 0}
    for row in rows:
        if not row.get("storey_id"):
            continue
        kind = str(row.get("kind") or "")
        if kind not in totals:
            continue
        count = int(row.get("item_count") or 0); totals[kind] += count
        status = "complete_empty" if count == 0 else "pending" if int(row.get("unconfirmed") or 0) else "complete"
        fact_type = "stair_geometry" if kind == "stair" else "ramp_geometry"
        _upsert(project_id, "stairs-ramps", fact_type, str(row["storey_id"]), frame_version, status, {
            "count": count, "unconfirmed": int(row.get("unconfirmed") or 0),
        })
    return {"stair_geometry": totals["stair"], "ramp_geometry": totals["ramp"]}


def publish_element_facts(project_id: str, element: str) -> dict[str, Any]:
    project = require_frozen_project(project_id)
    frame_version = int(project.get("frame_version") or 0)
    if element == "floor":
        return _floor_facts(project_id, frame_version)
    if element == "ceiling":
        return _ceiling_facts(project_id, frame_version)
    if element == "walls":
        return _wall_facts(project_id, frame_version)
    if element == "doors-windows":
        return _opening_facts(project_id, frame_version)
    if element == "roof":
        return _roof_facts(project_id, frame_version)
    if element == "stairs-ramps":
        return _stair_ramp_facts(project_id, frame_version)
    return {}
