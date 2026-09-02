from __future__ import annotations

from typing import Any

from shapely.geometry import Point, Polygon

from ....database.connection import fetch_all, transaction


def _points(geometry: Any) -> list[dict[str, float]]:
    if not isinstance(geometry, dict):
        return []
    raw = geometry.get("points") or geometry.get("outer") or []
    return [
        {"x": float(p["x"]), "y": float(p["y"])}
        for p in raw if isinstance(p, dict) and p.get("x") is not None and p.get("y") is not None
    ]


def recalculate_skirting_opening_deductions(project_id: str, floor_id: str | None = None) -> dict[str, Any]:
    """Deduct production door opening widths from Floor skirting quantities.

    Floor polygons remain the gross physical perimeter. Door detection is a later expert
    process, so this recalculation is deliberately cross-element and repeatable. Windows are
    not deducted from skirting. When a host wall is known, wall-room adjacency is the first
    choice; otherwise the door centre must lie close to the room boundary before a deduction
    is applied.
    """
    where = ["fs.project_id=%s"]
    params: list[Any] = [project_id]
    if floor_id:
        where.append("fs.floor_id=%s")
        params.append(floor_id)
    rooms = fetch_all(
        f"""SELECT fs.id,fs.floor_id,fs.geometry,tf.mm_per_pixel
              FROM floor_space fs JOIN takeoff_floor tf ON tf.id=fs.floor_id
              WHERE {' AND '.join(where)} AND fs.excluded=false""",
        tuple(params),
    )
    touched = 0
    deducted_total = 0.0
    with transaction() as conn:
        for room in rooms:
            pts = _points(room.get("geometry"))
            mmpp = float(room.get("mm_per_pixel") or 0)
            if len(pts) < 3 or mmpp <= 0:
                continue
            poly = Polygon([(p["x"], p["y"]) for p in pts])
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly.is_empty:
                continue
            gross_row = conn.execute(
                """SELECT id,gross_quantity FROM floor_work_assignment
                   WHERE room_id=%s AND work_type='skirting' ORDER BY created_at LIMIT 1""",
                (str(room["id"]),),
            ).fetchone()
            if not gross_row:
                continue
            doors = conn.execute(
                """SELECT oi.id,oi.clear_width_mm,oi.center,oi.host_wall_id,wi.side_a_room_id,wi.side_b_room_id
                   FROM opening_instance oi LEFT JOIN wall_instance wi ON wi.id=oi.host_wall_id
                   WHERE oi.floor_id=%s AND oi.kind='door' AND oi.status<>'deleted'""",
                (str(room["floor_id"]),),
            ).fetchall()
            deduction_m = 0.0
            seen: set[str] = set()
            for door in doors:
                width_mm = float(door.get("clear_width_mm") or 0)
                if width_mm <= 0:
                    continue
                hosted = str(door.get("side_a_room_id") or "") == str(room["id"]) or str(door.get("side_b_room_id") or "") == str(room["id"])
                if not hosted:
                    center = door.get("center") or {}
                    if center.get("x") is None or center.get("y") is None:
                        continue
                    # Tolerance is intentionally small relative to the opening: the centre
                    # must lie at/on the room boundary, not somewhere inside the room.
                    distance_px = poly.boundary.distance(Point(float(center["x"]), float(center["y"])))
                    tolerance_px = max(8.0, min(40.0, width_mm / mmpp * 0.35))
                    if distance_px > tolerance_px:
                        continue
                did = str(door["id"])
                if did in seen:
                    continue
                seen.add(did)
                deduction_m += width_mm / 1000.0
            gross = float(gross_row.get("gross_quantity") or 0)
            net = round(max(0.0, gross - deduction_m), 4)
            conn.execute(
                """UPDATE floor_work_assignment SET excluded_quantity=%s,nrm_quantity=%s,
                          measurement_reason=%s,updated_at=now() WHERE id=%s""",
                (round(deduction_m, 4), net,
                 "Gross room perimeter less production door opening widths; windows are not deducted from skirting.",
                 str(gross_row["id"])),
            )
            touched += 1
            deducted_total += deduction_m
    return {"rooms_updated": touched, "door_width_deducted_m": round(deducted_total, 4)}
