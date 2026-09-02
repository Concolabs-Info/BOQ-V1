from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Body, HTTPException, Query
from psycopg.types.json import Jsonb
from shapely.geometry import Polygon

from ....database.connection import fetch_all, fetch_one, transaction
from ....modules.takeoff.common import ensure_takeoff_floors

router = APIRouter(tags=["floor-layers"])
REQUIRED_BODY = Body(...)
OPTIONAL_BODY = Body(default_factory=dict)
OPTIONAL_FLOOR_QUERY = Query(default=None)
VERIFIED_GEOMETRY = {"wall_verified", "user_verified"}


def _status(value: str | None) -> str:
    if value in {"suggested", "detected", "ready"}:
        return "needs_review"
    return value or "unassigned"


def _project(project_id: UUID) -> dict[str, Any]:
    row = fetch_one("SELECT id,name FROM project WHERE id=%s", (str(project_id),))
    if not row:
        raise HTTPException(404, "Project not found")
    return row


def _floors(project_id: UUID) -> list[dict[str, Any]]:
    return [
        {
            **floor,
            "drawing_url": f"/api/v1/viewports/{floor['viewport_id']}/crop" if floor.get("viewport_id") else None,
            "architectural_drawing_url": f"/api/v1/viewports/{floor['viewport_id']}/crop" if floor.get("viewport_id") else None,
            "floor_finish_drawing_url": None,
            "finish_drawings": [],
        }
        for floor in ensure_takeoff_floors(project_id)
    ]


def _selected_floor(floors: list[dict[str, Any]], floor_id: UUID | None) -> str | None:
    if floor_id and any(str(item["id"]) == str(floor_id) for item in floors):
        return str(floor_id)
    return str(floors[0]["id"]) if floors else None


def _where(project_id: UUID, floor_id: str | None, alias: str = "") -> tuple[str, tuple[str, ...]]:
    prefix = f"{alias}." if alias else ""
    clauses = [f"{prefix}project_id=%s"]
    params = [str(project_id)]
    if floor_id:
        clauses.append(f"{prefix}floor_id=%s")
        params.append(floor_id)
    return " AND ".join(clauses), tuple(params)


def _points_area(points: list[dict[str, Any]], mm_per_pixel: float | None) -> float | None:
    if len(points) < 3 or not mm_per_pixel:
        return None
    signed = sum(float(points[i]["x"]) * float(points[(i + 1) % len(points)]["y"]) - float(points[(i + 1) % len(points)]["x"]) * float(points[i]["y"]) for i in range(len(points))) / 2
    return round(abs(signed) * mm_per_pixel * mm_per_pixel / 1_000_000, 4)


def _require_verified_room(conn: Any, project_id: UUID, room_id: str) -> dict[str, Any]:
    room = conn.execute(
        "SELECT floor_id,area_m2,perimeter_m,geometry_status FROM floor_space WHERE id=%s AND project_id=%s",
        (room_id, str(project_id)),
    ).fetchone()
    if not room:
        raise HTTPException(404, "Room not found")
    if room.get("geometry_status") not in VERIFIED_GEOMETRY:
        raise HTTPException(
            409,
            "This room boundary is not aligned to verified wall faces. Correct and verify the boundary before confirming finishes or floor work.",
        )
    return dict(room)


def _require_confirmable_assignments(conn: Any, table: str, project_id: UUID, payload: dict[str, Any]) -> None:
    scope = payload.get("scope")
    ids = payload.get("assignment_ids") or []
    clauses = ["a.project_id=%s", "COALESCE(fs.geometry_status,'boundary_review') NOT IN ('wall_verified','user_verified')"]
    params: list[Any] = [str(project_id)]
    if scope == "floor":
        clauses.append("a.floor_id=%s")
        params.append(payload.get("floor_id"))
    elif scope != "project" and ids:
        clauses.append("a.id=ANY(%s::uuid[])")
        params.append(ids)
    elif scope != "project":
        return
    blocked = conn.execute(
        f"SELECT count(*) AS n FROM {table} a JOIN floor_space fs ON fs.id=a.room_id WHERE " + " AND ".join(clauses),
        tuple(params),
    ).fetchone()["n"]
    if int(blocked or 0):
        raise HTTPException(
            409,
            f"{blocked} selected assignment(s) use room boundaries that still need wall review. Nothing was confirmed.",
        )


@router.post("/projects/{project_id}/floor-boundaries/audit")
def audit_floor_boundaries(project_id: UUID, floor_id: UUID | None = None):
    _project(project_id)
    from ....modules.takeoff.floors import audit_saved_floor_boundaries

    return audit_saved_floor_boundaries(project_id, floor_id)


@router.patch("/projects/{project_id}/floor-boundaries/floors/{floor_id}/rooms/{room_id}")
def update_floor_boundary(project_id: UUID, floor_id: UUID, room_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    """Persist an explicit user-reviewed room outline and remeasure its layers."""
    points = payload.get("points") or []
    if len(points) < 3:
        raise HTTPException(400, "A room boundary needs at least three points")
    try:
        clean = [{"x": round(float(point["x"]), 2), "y": round(float(point["y"]), 2)} for point in points]
        polygon = Polygon([(point["x"], point["y"]) for point in clean])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(400, "Every room-boundary point needs numeric x and y coordinates") from None
    if polygon.is_empty or not polygon.is_valid or polygon.area <= 4:
        raise HTTPException(400, "The room boundary is empty or self-intersecting")
    with transaction() as conn:
        floor = conn.execute(
            "SELECT drawing_width,drawing_height,mm_per_pixel FROM takeoff_floor WHERE id=%s AND project_id=%s",
            (str(floor_id), str(project_id)),
        ).fetchone()
        room = conn.execute(
            "SELECT * FROM floor_space WHERE id=%s AND floor_id=%s AND project_id=%s AND space_kind<>'connector'",
            (str(room_id), str(floor_id), str(project_id)),
        ).fetchone()
        if not floor or not room:
            raise HTTPException(404, "Room or floor not found")
        if any(point["x"] < 0 or point["y"] < 0 or point["x"] > float(floor["drawing_width"]) or point["y"] > float(floor["drawing_height"]) for point in clean):
            raise HTTPException(400, "The room boundary must stay inside the source drawing")
        old_geometry = room.get("geometry") or {}
        holes = old_geometry.get("deducts") or [] if isinstance(old_geometry, dict) else []
        polygon_with_holes = Polygon(
            [(point["x"], point["y"]) for point in clean],
            [[(float(point["x"]), float(point["y"])) for point in hole] for hole in holes],
        )
        if polygon_with_holes.is_empty or not polygon_with_holes.is_valid:
            raise HTTPException(400, "The corrected outline no longer contains its deductions/voids correctly")
        peers = conn.execute(
            "SELECT id,name,geometry FROM floor_space WHERE floor_id=%s AND id<>%s AND excluded=false AND space_kind<>'connector'",
            (str(floor_id), str(room_id)),
        ).fetchall()
        for peer in peers:
            peer_geometry = peer.get("geometry") or {}
            peer_points = peer_geometry.get("points") or [] if isinstance(peer_geometry, dict) else []
            if len(peer_points) < 3:
                continue
            peer_polygon = Polygon([(float(point["x"]), float(point["y"])) for point in peer_points])
            overlap = polygon_with_holes.intersection(peer_polygon).area
            if overlap > max(4.0, min(polygon_with_holes.area, peer_polygon.area) * .005):
                raise HTTPException(400, f"The corrected boundary overlaps {peer.get('name') or 'another room'}")
        mmpp = float(floor.get("mm_per_pixel") or 0)
        gross = _points_area(clean, mmpp)
        deductions = sum((_points_area(hole, mmpp) or 0) for hole in holes)
        net = round(max(0.0, float(gross or 0) - deductions), 4) if gross is not None else None
        perimeter = round(sum((((clean[(index + 1) % len(clean)]["x"] - point["x"]) ** 2 + (clean[(index + 1) % len(clean)]["y"] - point["y"]) ** 2) ** .5) for index, point in enumerate(clean)) * mmpp / 1000, 4) if mmpp else None
        geometry = {"points": clean, "deducts": holes}
        evidence = [item for item in (room.get("source_evidence") or []) if item.get("kind") != "user_boundary_review"]
        evidence.append({"kind": "user_boundary_review", "text": str(payload.get("reason") or "Boundary manually aligned to the visible inner wall faces."), "confidence": 1.0})
        conn.execute(
            """UPDATE floor_space SET geometry=%s,area_m2=%s,perimeter_m=%s,source_evidence=%s,
                      geometry_status='user_verified',status='needs_review',user_confirmed=true,
                      geometry_version=geometry_version+1,room_version=room_version+1,updated_at=now()
               WHERE id=%s""",
            (Jsonb(geometry), net, perimeter, Jsonb(evidence), str(room_id)),
        )
        revision = conn.execute("SELECT COALESCE(max(revision),0)+1 AS value FROM floor_space_revision WHERE room_id=%s", (str(room_id),)).fetchone()["value"]
        conn.execute(
            "INSERT INTO floor_space_revision(room_id,revision,action,geometry,metadata) VALUES (%s,%s,'user_boundary_edit',%s,%s)",
            (str(room_id), revision, Jsonb(geometry), Jsonb({"reason": payload.get("reason") or "Manual wall-face correction"})),
        )
        main_zone = conn.execute(
            "SELECT id FROM finish_zone WHERE room_id=%s AND friendly_number=%s LIMIT 1",
            (str(room_id), f"FZ-{room['friendly_number']}"),
        ).fetchone()
        if main_zone:
            child_area = conn.execute(
                "SELECT COALESCE(sum(net_area_m2),0) AS value FROM finish_zone WHERE room_id=%s AND id<>%s",
                (str(room_id), str(main_zone["id"])),
            ).fetchone()["value"]
            finish_net = round(max(0.0, float(net or 0) - float(child_area or 0)), 4) if net is not None else None
            conn.execute(
                "UPDATE finish_zone SET geometry=%s,gross_area_m2=%s,excluded_area_m2=%s,net_area_m2=%s,status='needs_review',updated_at=now() WHERE id=%s",
                (Jsonb(geometry), gross, deductions + float(child_area or 0), finish_net, str(main_zone["id"])),
            )
            conn.execute(
                """UPDATE finish_assignment SET gross_area_m2=%s,excluded_area_m2=%s,net_area_m2=%s,nrm_quantity=%s,
                          order_area_m2=%s*(1+waste_percent/100),status='needs_review',review_required=true,user_confirmed=false,updated_at=now()
                   WHERE zone_id=%s""",
                (gross, deductions + float(child_area or 0), finish_net, finish_net, finish_net, str(main_zone["id"])),
            )
        conn.execute(
            "UPDATE floor_work_zone SET geometry=%s,gross_area_m2=%s,net_area_m2=%s,status='needs_review',updated_at=now() WHERE room_id=%s",
            (Jsonb(geometry), net, net, str(room_id)),
        )
        conn.execute(
            """UPDATE floor_work_assignment SET gross_quantity=CASE WHEN measurement_basis='length' THEN %s ELSE %s END,
                      nrm_quantity=CASE WHEN measurement_basis='length' THEN %s ELSE %s END,
                      order_quantity=(CASE WHEN measurement_basis='length' THEN %s ELSE %s END)*(1+waste_percent/100),
                      status='needs_review',review_required=true,user_confirmed=false,updated_at=now()
               WHERE room_id=%s""",
            (perimeter, net, perimeter, net, perimeter, net, str(room_id)),
        )
        conn.execute("DELETE FROM skirting_edge WHERE room_id=%s", (str(room_id),))
        if perimeter is not None:
            for index, point in enumerate(clean):
                next_point = clean[(index + 1) % len(clean)]
                length = (((next_point["x"] - point["x"]) ** 2 + (next_point["y"] - point["y"]) ** 2) ** .5) * mmpp / 1000
                conn.execute(
                    """INSERT INTO skirting_edge(room_id,edge_index,point_a,point_b,length_m,edge_type,reason,user_confirmed)
                       VALUES (%s,%s,%s,%s,%s,'unknown','Boundary changed; review openings and non-skirting interfaces',false)""",
                    (str(room_id), index, Jsonb(point), Jsonb(next_point), round(length, 4)),
                )
        return {"ok": True, "geometry_status": "user_verified", "area_m2": net, "perimeter_m": perimeter}


@router.get("/projects/{project_id}/floor-finishes")
def floor_finish_state(project_id: UUID, floor_id: UUID | None = None):
    project, floors = _project(project_id), _floors(project_id)
    selected = _selected_floor(floors, floor_id)
    where, params = _where(project_id, selected)
    definitions = fetch_all(
        """SELECT fd.*,count(fa.id)::int AS assignment_count FROM finish_definition fd
           LEFT JOIN finish_assignment fa ON fa.finish_id=fd.id
           WHERE fd.project_id=%s AND fd.status<>'deleted' GROUP BY fd.id ORDER BY fd.original_tag NULLS LAST,fd.name""",
        (str(project_id),),
    )
    rooms = fetch_all(f"SELECT * FROM floor_space WHERE {where} AND excluded=false AND space_kind<>'connector' ORDER BY friendly_number", params)
    zones = fetch_all(f"SELECT * FROM finish_zone WHERE {where} ORDER BY friendly_number", params)
    assignments = fetch_all(
        f"""SELECT fa.*,fd.original_tag AS finish_code,fd.name AS finish_name,fd.description AS finish_description,
                   fd.material_category,fd.material,fd.display_colour,fs.name AS room_name,fs.room_type,fs.friendly_number AS room_number,
                   fz.name AS zone_name,fz.friendly_number AS zone_number,fz.geometry AS zone_geometry
            FROM finish_assignment fa LEFT JOIN finish_definition fd ON fd.id=fa.finish_id
            JOIN floor_space fs ON fs.id=fa.room_id LEFT JOIN finish_zone fz ON fz.id=fa.zone_id
            WHERE {where.replace('project_id', 'fa.project_id').replace('floor_id', 'fa.floor_id')}
              AND fs.space_kind<>'connector'
            ORDER BY fs.friendly_number,fz.friendly_number""",
        params,
    )
    for item in assignments:
        item["status"] = _status(item.get("status"))
        item["confidence_label"] = "high" if float(item.get("confidence") or 0) >= .8 else "medium" if float(item.get("confidence") or 0) >= .5 else "low"
    by_room: dict[str, list[dict[str, Any]]] = {}
    zone_by_room: dict[str, list[dict[str, Any]]] = {}
    for item in assignments:
        by_room.setdefault(str(item["room_id"]), []).append(item)
    for item in zones:
        zone_by_room.setdefault(str(item["room_id"]), []).append(item)
    for room in rooms:
        room["assignments"] = by_room.get(str(room["id"]), [])
        room["zones"] = zone_by_room.get(str(room["id"]), [])
        room["evidence"] = []
    verified_room_ids = {str(room["id"]) for room in rooms if room.get("geometry_status") in VERIFIED_GEOMETRY}
    summary = {
        "total": len(assignments),
        "confirmed": sum(item["status"] in {"confirmed", "auto_confirmed"} for item in assignments),
        "needs_review": sum(item["status"] == "needs_review" for item in assignments),
        "conflicts": sum(item["status"] == "conflict" for item in assignments),
        "unassigned": sum(item["status"] == "unassigned" for item in assignments),
        "area_m2": round(sum(float(item.get("nrm_quantity") or 0) for item in assignments if str(item.get("room_id")) in verified_room_ids), 4),
        "boundary_review_area_m2": round(sum(float(room.get("area_m2") or 0) for room in rooms if str(room["id"]) not in verified_room_ids), 4),
        "boundary_review": sum(room.get("geometry_status") not in VERIFIED_GEOMETRY for room in rooms),
    }
    return {"project": project, "floors": floors, "selected_floor_id": selected, "definitions": definitions, "rooms": rooms, "assignments": assignments, "zones": zones, "summary": summary, "active_jobs": [], "can_continue": not summary["conflicts"] and not summary["boundary_review"]}


@router.get("/projects/{project_id}/floor-works")
def floor_work_state(project_id: UUID, floor_id: UUID | None = None):
    project, floors = _project(project_id), _floors(project_id)
    selected = _selected_floor(floors, floor_id)
    where, params = _where(project_id, selected)
    definitions = fetch_all(
        """SELECT fwd.*,count(fwa.id)::int AS assignment_count FROM floor_work_definition fwd
           LEFT JOIN floor_work_assignment fwa ON fwa.definition_id=fwd.id
           WHERE fwd.project_id=%s AND fwd.status<>'deleted' GROUP BY fwd.id ORDER BY fwd.work_type,fwd.code NULLS LAST,fwd.name""",
        (str(project_id),),
    )
    rooms = fetch_all(f"SELECT * FROM floor_space WHERE {where} AND excluded=false AND space_kind<>'connector' ORDER BY friendly_number", params)
    zones = fetch_all(f"SELECT * FROM floor_work_zone WHERE {where} ORDER BY work_type,name", params)
    assignments = fetch_all(
        f"""SELECT fwa.*,fwd.code AS definition_code,fwd.name AS definition_name,fwd.description AS definition_description,
                   fwd.display_colour FROM floor_work_assignment fwa LEFT JOIN floor_work_definition fwd ON fwd.id=fwa.definition_id
            WHERE {where.replace('project_id', 'fwa.project_id').replace('floor_id', 'fwa.floor_id')}
              AND EXISTS (
                  SELECT 1 FROM floor_space included_space
                  WHERE included_space.id=fwa.room_id AND included_space.space_kind<>'connector'
              )
            ORDER BY fwa.work_type,fwd.code NULLS LAST""",
        params,
    )
    edges = fetch_all(
        """SELECT se.* FROM skirting_edge se JOIN floor_space fs ON fs.id=se.room_id
           WHERE fs.project_id=%s AND fs.space_kind<>'connector'""" + (" AND fs.floor_id=%s" if selected else "") + " ORDER BY se.room_id,se.edge_index",
        params,
    )
    for item in assignments:
        item["status"] = _status(item.get("status"))
    by_room: dict[str, list[dict[str, Any]]] = {}
    zone_by_room: dict[str, list[dict[str, Any]]] = {}
    edge_by_room: dict[str, list[dict[str, Any]]] = {}
    for item in assignments:
        by_room.setdefault(str(item["room_id"]), []).append(item)
    for item in zones:
        zone_by_room.setdefault(str(item["room_id"]), []).append(item)
    for item in edges:
        edge_by_room.setdefault(str(item["room_id"]), []).append(item)
    measurements = []
    for room in rooms:
        room_edges = edge_by_room.get(str(room["id"]), [])
        gross_perimeter = float(room.get("perimeter_m") or 0)
        net_skirting = sum(float(edge.get("length_m") or 0) for edge in room_edges if edge.get("edge_type") == "skirting")
        measurement = {"room_id": room["id"], "area_m2": room.get("area_m2"), "gross_perimeter_m": gross_perimeter, "door_deduction_m": 0, "manual_edge_deduction_m": max(0, gross_perimeter - net_skirting), "net_skirting_length_m": round(net_skirting, 4), "measurement_status": "ready" if room.get("area_m2") is not None else "needs_review"}
        measurements.append(measurement)
        room["assignments"] = by_room.get(str(room["id"]), [])
        room["zones"] = zone_by_room.get(str(room["id"]), [])
        room["evidence"] = []
        room["measurement"] = measurement
        room["skirting_edges"] = room_edges
        room["display_polygon"] = room.get("geometry")
    active = [item for item in assignments if item["status"] != "not_required"]
    verified_room_ids = {str(room["id"]) for room in rooms if room.get("geometry_status") in VERIFIED_GEOMETRY}
    summary = {"total": len(assignments), "confirmed": sum(item["status"] in {"confirmed", "auto_confirmed"} for item in active), "needs_review": sum(item["status"] == "needs_review" for item in active), "conflicts": sum(item["status"] == "conflict" for item in active), "unassigned": sum(item["status"] == "unassigned" for item in active), "area_m2": round(sum(float(item.get("nrm_quantity") or 0) for item in active if item.get("measurement_unit") != "m" and str(item.get("room_id")) in verified_room_ids), 4), "linear_m": round(sum(float(item.get("nrm_quantity") or 0) for item in active if item.get("measurement_unit") == "m" and str(item.get("room_id")) in verified_room_ids), 4), "measurement_issues": sum(item["measurement_status"] != "ready" for item in measurements), "boundary_review": sum(room.get("geometry_status") not in VERIFIED_GEOMETRY for room in rooms), "boundary_review_area_m2": round(sum(float(room.get("area_m2") or 0) for room in rooms if str(room["id"]) not in verified_room_ids), 4)}
    return {"project": project, "floors": floors, "selected_floor_id": selected, "work_types": ["screed", "waterproofing", "underlay", "board_insulation", "quilt_insulation", "isolation_membrane", "sealer", "skirting"], "definitions": definitions, "rooms": rooms, "measurements": measurements, "assignments": assignments, "zones": zones, "evidence": [], "summary": summary, "active_jobs": [], "needs_automatic_sync": False, "can_continue": not summary["conflicts"] and not summary["measurement_issues"] and not summary["boundary_review"]}


def _definition_mutation(table: str, project_id: UUID, payload: dict[str, Any], definition_id: UUID | None = None):
    allowed = ({"original_tag", "material_category", "tile_width_mm", "tile_length_mm", "colour", "surface_finish", "pattern", "bedding", "underlay_reference", "internal_external", "measurement_basis", "measurement_unit", "nrm_work_section", "nrm_item"} if table == "finish_definition" else {"code", "work_type", "system_type", "layer_count", "condition", "height_mm", "measurement_basis", "measurement_unit", "nrm_work_section", "nrm_item"}) | {"name", "description", "material", "thickness_mm", "manufacturer", "product_code", "default_waste_percent", "display_colour"}
    values = {key: value for key, value in payload.items() if key in allowed}
    if definition_id:
        if not values:
            raise HTTPException(400, "No supported fields were supplied")
        with transaction() as conn:
            row = conn.execute(f"UPDATE {table} SET " + ",".join(f"{key}=%s" for key in values) + ",updated_at=now() WHERE id=%s AND project_id=%s RETURNING *", (*values.values(), str(definition_id), str(project_id))).fetchone()
            if not row:
                raise HTTPException(404, "Definition not found")
            return dict(row)
    if not str(values.get("name") or "").strip():
        raise HTTPException(400, "Enter a system name")
    with transaction() as conn:
        row = conn.execute(f"INSERT INTO {table}(project_id," + ",".join(values) + ") VALUES (%s," + ",".join(["%s"] * len(values)) + ") RETURNING *", (str(project_id), *values.values())).fetchone()
        return dict(row)


@router.post("/projects/{project_id}/floor-finishes/definitions")
def create_finish_definition(project_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    return _definition_mutation("finish_definition", project_id, payload)


@router.patch("/projects/{project_id}/floor-finishes/definitions/{definition_id}")
def update_finish_definition(project_id: UUID, definition_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    return _definition_mutation("finish_definition", project_id, payload, definition_id)


@router.delete("/projects/{project_id}/floor-finishes/definitions/{definition_id}")
def delete_finish_definition(project_id: UUID, definition_id: UUID):
    with transaction() as conn:
        conn.execute("UPDATE finish_definition SET status='deleted',updated_at=now() WHERE id=%s AND project_id=%s", (str(definition_id), str(project_id)))
    return {"ok": True}


@router.post("/projects/{project_id}/floor-works/definitions")
def create_work_definition(project_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    return _definition_mutation("floor_work_definition", project_id, payload)


@router.patch("/projects/{project_id}/floor-works/definitions/{definition_id}")
def update_work_definition(project_id: UUID, definition_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    return _definition_mutation("floor_work_definition", project_id, payload, definition_id)


@router.delete("/projects/{project_id}/floor-works/definitions/{definition_id}")
def delete_work_definition(project_id: UUID, definition_id: UUID):
    with transaction() as conn:
        conn.execute("UPDATE floor_work_definition SET status='deleted',updated_at=now() WHERE id=%s AND project_id=%s", (str(definition_id), str(project_id)))
    return {"ok": True}


@router.post("/projects/{project_id}/floor-finishes/assignments")
def assign_finish(project_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    with transaction() as conn:
        for room_id in payload.get("room_ids", []):
            room = _require_verified_room(conn, project_id, room_id)
            waste = float(payload.get("waste_percent") or 0)
            conn.execute("""UPDATE finish_assignment SET finish_id=%s,status='confirmed',assignment_method='user',confidence=1,waste_percent=%s,order_area_m2=COALESCE(nrm_quantity,net_area_m2,%s)*(1+%s/100),measurement_basis=COALESCE(%s,measurement_basis),measurement_reason=%s,review_required=false,user_confirmed=true,updated_at=now() WHERE project_id=%s AND room_id=%s AND zone_id IS NOT NULL""", (payload.get("finish_id"), waste, room.get("area_m2"), waste, payload.get("measurement_basis"), payload.get("measurement_reason"), str(project_id), room_id))
    return {"ok": True}


@router.post("/projects/{project_id}/floor-works/assignments")
def assign_work(project_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    work_type, required = str(payload.get("work_type") or ""), bool(payload.get("required", True))
    with transaction() as conn:
        for room_id in payload.get("room_ids", []):
            if not work_type:
                continue
            room = _require_verified_room(conn, project_id, room_id)
            quantity = float(room.get("perimeter_m") or 0) if work_type == "skirting" else float(room.get("area_m2") or 0)
            unit, basis = ("m", "length") if work_type == "skirting" else ("m²", "area")
            waste = float(payload.get("waste_percent") or 0)
            target_key = f"work:{work_type}:zone:{payload.get('zone_id')}" if payload.get("zone_id") else f"work:{work_type}:{room_id}"
            conn.execute("""INSERT INTO floor_work_assignment(project_id,floor_id,room_id,zone_id,work_type,definition_id,target_key,coverage_type,measurement_basis,gross_quantity,nrm_quantity,measurement_unit,waste_percent,order_quantity,thickness_mm,layer_count,upturn_required,upturn_height_mm,status,assignment_method,confidence,review_required,user_confirmed)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'user',1,false,true)
                ON CONFLICT(target_key) DO UPDATE SET definition_id=excluded.definition_id,status=excluded.status,assignment_method='user',confidence=1,waste_percent=excluded.waste_percent,order_quantity=excluded.order_quantity,thickness_mm=excluded.thickness_mm,layer_count=excluded.layer_count,upturn_required=excluded.upturn_required,upturn_height_mm=excluded.upturn_height_mm,review_required=false,user_confirmed=true,updated_at=now()""", (str(project_id), str(room["floor_id"]), room_id, payload.get("zone_id"), work_type, payload.get("definition_id"), target_key, payload.get("coverage_type") or "whole_room", basis, quantity, quantity, unit, waste, quantity * (1 + waste / 100), payload.get("thickness_mm"), payload.get("layer_count"), bool(payload.get("upturn_required")), payload.get("upturn_height_mm"), "confirmed" if required else "not_required"))
    return {"ok": True}


@router.post("/projects/{project_id}/floor-finishes/assignments/confirm")
def confirm_finishes(project_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    ids = payload.get("assignment_ids") or []
    with transaction() as conn:
        _require_confirmable_assignments(conn, "finish_assignment", project_id, payload)
        if payload.get("scope") == "project": conn.execute("UPDATE finish_assignment SET status='confirmed',user_confirmed=true,review_required=false,updated_at=now() WHERE project_id=%s AND finish_id IS NOT NULL", (str(project_id),))
        elif payload.get("scope") == "floor": conn.execute("UPDATE finish_assignment SET status='confirmed',user_confirmed=true,review_required=false,updated_at=now() WHERE project_id=%s AND floor_id=%s AND finish_id IS NOT NULL", (str(project_id), payload.get("floor_id")))
        elif ids: conn.execute("UPDATE finish_assignment SET status='confirmed',user_confirmed=true,review_required=false,updated_at=now() WHERE project_id=%s AND id=ANY(%s::uuid[]) AND finish_id IS NOT NULL", (str(project_id), ids))
    return {"ok": True}


@router.post("/projects/{project_id}/floor-works/assignments/confirm")
def confirm_works(project_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    ids = payload.get("assignment_ids") or []
    with transaction() as conn:
        _require_confirmable_assignments(conn, "floor_work_assignment", project_id, payload)
        if payload.get("scope") == "project": conn.execute("UPDATE floor_work_assignment SET status='confirmed',user_confirmed=true,review_required=false,updated_at=now() WHERE project_id=%s AND definition_id IS NOT NULL", (str(project_id),))
        elif payload.get("scope") == "floor": conn.execute("UPDATE floor_work_assignment SET status='confirmed',user_confirmed=true,review_required=false,updated_at=now() WHERE project_id=%s AND floor_id=%s AND definition_id IS NOT NULL", (str(project_id), payload.get("floor_id")))
        elif ids: conn.execute("UPDATE floor_work_assignment SET status='confirmed',user_confirmed=true,review_required=false,updated_at=now() WHERE project_id=%s AND id=ANY(%s::uuid[]) AND definition_id IS NOT NULL", (str(project_id), ids))
    return {"ok": True}


@router.patch("/projects/{project_id}/floor-works/floors/{floor_id}/rooms/{room_id}/skirting-edges/{edge_id}")
def patch_skirting(project_id: UUID, floor_id: UUID, room_id: UUID, edge_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    del floor_id
    with transaction() as conn:
        conn.execute("""UPDATE skirting_edge se SET edge_type=%s,reason=%s,user_confirmed=true FROM floor_space fs WHERE se.id=%s AND se.room_id=%s AND fs.id=se.room_id AND fs.project_id=%s""", (payload.get("edge_type"), payload.get("reason"), str(edge_id), str(room_id), str(project_id)))
        net = conn.execute("SELECT COALESCE(sum(length_m) FILTER (WHERE edge_type='skirting'),0) AS quantity FROM skirting_edge WHERE room_id=%s", (str(room_id),)).fetchone()["quantity"]
        conn.execute("UPDATE floor_work_assignment SET gross_quantity=%s,nrm_quantity=%s,order_quantity=%s*(1+waste_percent/100),review_required=false,updated_at=now() WHERE room_id=%s AND work_type='skirting'", (net, net, net, str(room_id)))
    return {"ok": True}


@router.post("/projects/{project_id}/floor-finishes/analyze")
@router.post("/projects/{project_id}/floor-works/analyze")
def sync_floor_layers(project_id: UUID, payload: dict[str, Any] = OPTIONAL_BODY):
    del payload
    _project(project_id)
    return {"ok": True, "message": "Existing detected floor data and specification assignments are synchronized."}


@router.post("/projects/{project_id}/floor-works/floors/{floor_id}/recalculate")
def recalculate_floor_works(project_id: UUID, floor_id: UUID):
    with transaction() as conn:
        conn.execute("""UPDATE floor_work_assignment fwa SET gross_quantity=CASE WHEN fwa.work_type='skirting' THEN COALESCE((SELECT sum(se.length_m) FROM skirting_edge se WHERE se.room_id=fs.id AND se.edge_type='skirting'),0) WHEN fwa.measurement_basis='length' THEN fs.perimeter_m ELSE fs.area_m2 END,nrm_quantity=CASE WHEN fwa.work_type='skirting' THEN COALESCE((SELECT sum(se.length_m) FROM skirting_edge se WHERE se.room_id=fs.id AND se.edge_type='skirting'),0) WHEN fwa.measurement_basis='length' THEN fs.perimeter_m ELSE fs.area_m2 END,order_quantity=(CASE WHEN fwa.work_type='skirting' THEN COALESCE((SELECT sum(se.length_m) FROM skirting_edge se WHERE se.room_id=fs.id AND se.edge_type='skirting'),0) WHEN fwa.measurement_basis='length' THEN fs.perimeter_m ELSE fs.area_m2 END)*(1+fwa.waste_percent/100),updated_at=now() FROM floor_space fs WHERE fwa.room_id=fs.id AND fwa.project_id=%s AND fwa.floor_id=%s""", (str(project_id), str(floor_id)))
    return {"ok": True}


@router.post("/projects/{project_id}/floor-finishes/floors/{floor_id}/rooms/{room_id}/zones")
def create_finish_zone(project_id: UUID, floor_id: UUID, room_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    points = payload.get("points") or []
    floor = fetch_one("SELECT mm_per_pixel FROM takeoff_floor WHERE id=%s AND project_id=%s", (str(floor_id), str(project_id)))
    if not floor or len(points) < 3:
        raise HTTPException(400, "Draw at least three points inside a valid room")
    area = _points_area(points, floor.get("mm_per_pixel"))
    with transaction() as conn:
        number = conn.execute("SELECT 'FZ-' || friendly_number || '-' || (1+count(*))::text AS value FROM finish_zone WHERE room_id=%s GROUP BY room_id", (str(room_id),)).fetchone()
        friendly = number["value"] if number else f"FZ-{str(room_id)[:8]}-1"
        zone = conn.execute("""INSERT INTO finish_zone(project_id,floor_id,room_id,friendly_number,name,geometry,gross_area_m2,net_area_m2,status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'needs_review') RETURNING *""", (str(project_id), str(floor_id), str(room_id), friendly, payload.get("name") or "Finish zone", Jsonb({"points": points}), area, area)).fetchone()
        waste = float(payload.get("waste_percent") or 0)
        conn.execute("""INSERT INTO finish_assignment(project_id,floor_id,room_id,zone_id,finish_id,target_key,status,assignment_method,confidence,gross_area_m2,net_area_m2,waste_percent,order_area_m2,nrm_quantity,review_required,user_confirmed) VALUES (%s,%s,%s,%s,%s,%s,'confirmed','user',1,%s,%s,%s,%s,%s,false,true)""", (str(project_id), str(floor_id), str(room_id), str(zone["id"]), payload.get("finish_id"), f"finish-zone:{zone['id']}", area, area, waste, area * (1 + waste / 100) if area is not None else None, area))
        return dict(zone)


@router.patch("/projects/{project_id}/floor-finishes/floors/{floor_id}/rooms/{room_id}/zones/{zone_id}")
def update_finish_zone(project_id: UUID, floor_id: UUID, room_id: UUID, zone_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    points = payload.get("points")
    with transaction() as conn:
        if points:
            floor = conn.execute("SELECT mm_per_pixel FROM takeoff_floor WHERE id=%s", (str(floor_id),)).fetchone()
            area = _points_area(points, floor.get("mm_per_pixel") if floor else None)
            conn.execute("UPDATE finish_zone SET geometry=%s,gross_area_m2=%s,net_area_m2=%s,updated_at=now() WHERE id=%s AND room_id=%s AND project_id=%s", (Jsonb({"points": points}), area, area, str(zone_id), str(room_id), str(project_id)))
            conn.execute("UPDATE finish_assignment SET gross_area_m2=%s,net_area_m2=%s,nrm_quantity=%s,order_area_m2=%s*(1+waste_percent/100),updated_at=now() WHERE zone_id=%s", (area, area, area, area, str(zone_id)))
        if "name" in payload:
            conn.execute("UPDATE finish_zone SET name=%s,updated_at=now() WHERE id=%s AND project_id=%s", (payload.get("name"), str(zone_id), str(project_id)))
    return {"ok": True}


@router.delete("/projects/{project_id}/floor-finishes/floors/{floor_id}/rooms/{room_id}/zones/{zone_id}")
def delete_finish_zone(project_id: UUID, floor_id: UUID, room_id: UUID, zone_id: UUID):
    del floor_id, room_id
    with transaction() as conn:
        conn.execute("DELETE FROM finish_zone WHERE id=%s AND project_id=%s", (str(zone_id), str(project_id)))
    return {"ok": True}


@router.post("/projects/{project_id}/floor-works/floors/{floor_id}/rooms/{room_id}/zones")
def create_work_zone(project_id: UUID, floor_id: UUID, room_id: UUID, payload: dict[str, Any] = REQUIRED_BODY):
    points = payload.get("points") or []
    floor = fetch_one("SELECT mm_per_pixel FROM takeoff_floor WHERE id=%s AND project_id=%s", (str(floor_id), str(project_id)))
    if not floor or len(points) < 3:
        raise HTTPException(400, "Draw at least three points inside a valid room")
    area = _points_area(points, floor.get("mm_per_pixel"))
    with transaction() as conn:
        zone = conn.execute("""INSERT INTO floor_work_zone(project_id,floor_id,room_id,work_type,name,geometry,gross_area_m2,net_area_m2,status) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'needs_review') RETURNING *""", (str(project_id), str(floor_id), str(room_id), payload.get("work_type"), payload.get("name") or "Partial zone", Jsonb({"points": points}), area, area)).fetchone()
        return dict(zone)


@router.delete("/projects/{project_id}/floor-works/floors/{floor_id}/rooms/{room_id}/zones/{zone_id}")
def delete_work_zone(project_id: UUID, floor_id: UUID, room_id: UUID, zone_id: UUID):
    del floor_id, room_id
    with transaction() as conn:
        conn.execute("DELETE FROM floor_work_zone WHERE id=%s AND project_id=%s", (str(zone_id), str(project_id)))
    return {"ok": True}


@router.get("/projects/{project_id}/floor-finishes/history")
def finish_history(project_id: UUID, floor_id: UUID | None = OPTIONAL_FLOOR_QUERY):
    return {"history": fetch_all("SELECT * FROM takeoff_history WHERE project_id=%s AND module='floor_finish'" + (" AND floor_id=%s" if floor_id else "") + " ORDER BY created_at DESC LIMIT 100", (str(project_id), str(floor_id)) if floor_id else (str(project_id),))}


@router.get("/projects/{project_id}/floor-works/history")
def work_history(project_id: UUID, floor_id: UUID | None = OPTIONAL_FLOOR_QUERY):
    return {"history": fetch_all("SELECT * FROM takeoff_history WHERE project_id=%s AND module='floor_work'" + (" AND floor_id=%s" if floor_id else "") + " ORDER BY created_at DESC LIMIT 100", (str(project_id), str(floor_id)) if floor_id else (str(project_id),))}
