from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any
from uuid import UUID

from PIL import Image
from shapely.geometry import LineString, Polygon

from ...core.config import get_settings
from ...database.connection import fetch_all, fetch_one, transaction
from ...database.json_value import Jsonb
from ...services.ai.model_client import get_model_client
from ...services.pdf.media import ensure_viewport_crop
from .common import (
    PALETTE,
    area_m2,
    content_hash,
    ensure_takeoff_floors,
    extract_viewport_text,
    model_for_quality,
    perimeter_m,
    project_text_evidence,
    require_frozen_project,
    source_mm_per_pixel,
    viewport_demo_context,
)
from .model_schemas import (
    RoofGeometryOutput,
    RoofGeometryRepairOutput,
    RoofSystemResolutionOutput,
)
from .prompts import (
    ROOF_CATALOG_PROMPT,
    ROOF_CATALOG_SYSTEM,
    ROOF_GEOMETRY_PROMPT,
    ROOF_REPAIR_PROMPT,
    ROOF_REPAIR_SYSTEM,
    ROOF_SYSTEM,
)


ROOF_WORDS = re.compile(
    r"\b(roof|roof terrace|terrace roof|canopy|porch roof|machine room|water tank roof|plant roof|penthouse roof|upper roof|lower roof)\b",
    re.I,
)
EXCLUDE_ONLY_WORDS = re.compile(r"\b(site plan|foundation|ground floor parking|schedule only)\b", re.I)
UPSTAND_EDGE_TYPES = {"parapet", "abutment", "roof_step", "level_change"}


def _points(items: Any) -> list[dict[str, float]]:
    result: list[dict[str, float]] = []
    for item in items or []:
        if isinstance(item, dict) and "x" in item and "y" in item:
            result.append({"x": float(item["x"]), "y": float(item["y"])})
        elif hasattr(item, "x") and hasattr(item, "y"):
            result.append({"x": float(item.x), "y": float(item.y)})
    return result


def _line_length_m(points: list[dict[str, float]], mm_per_pixel: float | None) -> float | None:
    if not mm_per_pixel or len(points) < 2:
        return None
    value = sum(
        math.hypot(points[i + 1]["x"] - points[i]["x"], points[i + 1]["y"] - points[i]["y"])
        for i in range(len(points) - 1)
    )
    return round(value * mm_per_pixel / 1000.0, 4)


def _pitch_degrees(pitch: Any | None) -> float | None:
    if not pitch or pitch.value is None:
        return None
    value = float(pitch.value)
    if pitch.unit == "degrees":
        return value if 0 <= value < 89.9 else None
    if pitch.unit == "percent":
        return math.degrees(math.atan(value / 100.0))
    if pitch.unit in {"ratio", "rise_run"}:
        # Numeric ratio is interpreted as rise/run when the schema contains one value.
        return math.degrees(math.atan(value)) if value >= 0 else None
    return None


def surface_area_from_projected(projected_m2: float | None, surface_type: str, pitch_degrees: float | None) -> tuple[float | None, str]:
    """NRM-ready geometry basis: code calculates; the model only supplies evidence."""
    if projected_m2 is None:
        return None, "missing_scale"
    if surface_type == "flat":
        return round(projected_m2, 4), "measured"
    if surface_type == "sloped_planar":
        if pitch_degrees is None:
            return None, "needs_pitch"
        cosine = math.cos(math.radians(pitch_degrees))
        if cosine <= 0.02:
            return None, "invalid_pitch"
        return round(projected_m2 / cosine, 4), "measured"
    if surface_type == "curved":
        return None, "profile_required"
    return None, "needs_review"


def nrm_section_for_covering(covering_class: str) -> str:
    return {
        "sheet": "17",
        "tile_slate": "18",
        "waterproofed_flat": "19",
        "glazed": "23",
        "green": "19",
        "concrete_exposed": "19",
    }.get(covering_class, "19")


def nrm_section_for_layer(category: str, fallback: str | None = None) -> str:
    if fallback:
        return fallback
    return {
        "covering": "17",
        "waterproofing": "19",
        "underlay": "19",
        "insulation": "31",
        "screed_falls": "19",
        "protection": "19",
        "finish": "28",
    }.get(category, "19")


def _roof_candidates(project_id: str) -> list[dict[str, Any]]:
    rows = fetch_all(
        """SELECT v.*,s.sheet_no,s.title,p.page_number
           FROM viewport v
           JOIN sheet s ON s.id=v.sheet_id
           JOIN page p ON p.id=s.page_id
           JOIN document d ON d.id=p.document_id
           WHERE d.project_id=%s AND s.included=true AND v.relevant=true
             AND v.view_kind IN ('plan','detail','section','elevation')
           ORDER BY p.page_number,v.display_order""",
        (project_id,),
    )
    candidates: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        subjects = [str(x).lower() for x in (row.get("subjects") or [])]
        text = " ".join(
            str(x or "") for x in (row.get("name"), row.get("level_label"), row.get("title"), row.get("why"))
        )
        score = 0
        if any("roof" in item for item in subjects):
            score += 15
        if ROOF_WORDS.search(text):
            score += 10
        if row.get("view_kind") == "plan":
            score += 2
        if re.search(r"roof terrace|roof plan", text, re.I):
            score += 10
        if EXCLUDE_ONLY_WORDS.search(text) and not ROOF_WORDS.search(text):
            score -= 10
        if score > 0:
            candidates.append((score, row))
    # Avoid accidental section/elevation primary geometry unless no plan/detail roof crop exists.
    primary = [r for score, r in candidates if r.get("view_kind") in {"plan", "detail"}]
    return primary or [r for score, r in candidates]


def _host_floor_for_source(project_id: str, source: dict[str, Any]) -> dict[str, Any] | None:
    floors = ensure_takeoff_floors(project_id)
    if not floors:
        return None
    text = re.sub(r"[^a-z0-9]+", " ", " ".join(str(source.get(k) or "") for k in ("name", "level_label", "title")).lower())
    scored: list[tuple[int, dict[str, Any]]] = []
    for floor in floors:
        name = re.sub(r"[^a-z0-9]+", " ", str(floor.get("name") or "").lower()).strip()
        score = 0
        if name and name in text:
            score += 10
        if str(floor.get("level_index")) in text:
            score += 1
        if "terrace" in text and "terrace" in name:
            score += 12
        scored.append((score, floor))
    best = max(scored, key=lambda pair: (pair[0], pair[1].get("level_index") or 0))
    if best[0] > 0:
        return best[1]
    return max(floors, key=lambda floor: floor.get("level_index") or 0)


def _ensure_roof_levels(project_id: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for source in _roof_candidates(project_id):
        try:
            _, ctx = ensure_viewport_crop(source["id"])
        except Exception:
            continue
        mmpp, verified = source_mm_per_pixel(source["id"])
        host = _host_floor_for_source(project_id, source)
        name = source.get("name") or source.get("title") or "Roof"
        scope = "terrace" if "terrace" in name.lower() else "upper_roof" if "roof" in name.lower() else "roof"
        with transaction() as conn:
            row = conn.execute(
                """INSERT INTO roof_level(project_id,host_floor_id,source_viewport_id,name,level_text,scope,
                       drawing_width,drawing_height,mm_per_pixel,scale_verified,crop_version,source_evidence,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
                   ON CONFLICT(project_id,source_viewport_id) DO UPDATE SET host_floor_id=excluded.host_floor_id,
                       name=excluded.name,level_text=excluded.level_text,scope=excluded.scope,
                       drawing_width=excluded.drawing_width,drawing_height=excluded.drawing_height,
                       mm_per_pixel=excluded.mm_per_pixel,scale_verified=excluded.scale_verified,
                       crop_version=excluded.crop_version,updated_at=now() RETURNING *""",
                (
                    project_id,
                    str(host["id"]) if host else None,
                    str(source["id"]),
                    name,
                    source.get("level_label"),
                    scope,
                    ctx["crop_width_px"],
                    ctx["crop_height_px"],
                    mmpp,
                    verified,
                    ctx["crop_version"],
                    Jsonb([{"kind": "pre_viewport", "viewport_id": str(source["id"]), "page": source.get("page_number")}]),
                ),
            ).fetchone()
        result.append(dict(row))
    return result


def _roof_extra_demo_context(project_id: str, base: dict[str, Any]) -> dict[str, Any]:
    levels = _ensure_roof_levels(project_id)
    sheets = list(base["sheets"])
    viewports = list(base["viewports"])
    existing = {v["id"] for v in viewports}
    for index, level in enumerate(levels, start=1):
        viewport_id = str(level["source_viewport_id"])
        if viewport_id in existing:
            continue
        sheet_id = f"roof-sheet-{level['id']}"
        sheets.append({
            "id": sheet_id,
            "sheetNo": f"R{index}",
            "title": level["name"],
            "revision": "",
            "image": f"/api/v1/viewports/{viewport_id}/crop",
            "page": 700 + index,
            "included": True,
            "width": level["drawing_width"],
            "height": level["drawing_height"],
        })
        viewports.append({
            "id": viewport_id,
            "name": level["name"],
            "category": "plan",
            "sheetId": sheet_id,
            "bbox": [0, 0, level["drawing_width"], level["drawing_height"]],
            "status": "confirmed" if level["scale_verified"] else "ready",
            "scaleMPerPx": float(level["mm_per_pixel"]) / 1000.0 if level.get("mm_per_pixel") else None,
        })
    return {**base, "sheets": sheets, "viewports": viewports, "roof_levels": levels}


def _validate_geometry(output: RoofGeometryOutput) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    width, height = output.source_width_px, output.source_height_px
    peer_planes: list[tuple[str, Polygon]] = []

    def validate_polygon(kind: str, entity_id: str, pts: list[dict[str, float]]) -> Polygon | None:
        if len(pts) < 3:
            issues.append({"entity_kind": kind, "entity_id": entity_id, "problem": "polygon has fewer than 3 points", "bbox": None})
            return None
        bad = [p for p in pts if not (0 <= p["x"] <= width and 0 <= p["y"] <= height)]
        bbox = [min(p["x"] for p in pts), min(p["y"] for p in pts), max(p["x"] for p in pts), max(p["y"] for p in pts)]
        if bad:
            issues.append({"entity_kind": kind, "entity_id": entity_id, "problem": "coordinates outside exact source crop", "bbox": bbox})
            return None
        poly = Polygon([(p["x"], p["y"]) for p in pts])
        if poly.is_empty or poly.area <= 1 or not poly.is_valid:
            issues.append({"entity_kind": kind, "entity_id": entity_id, "problem": "empty or self-intersecting polygon", "bbox": bbox})
            return None
        return poly

    for region in output.roof_regions:
        validate_polygon("region", region.roof_id, _points(region.outer_boundary))
        for plane in region.planes:
            pts = _points(plane.polygon)
            poly = validate_polygon("plane", plane.plane_id, pts)
            if poly is not None:
                for other_id, other in peer_planes:
                    overlap = poly.intersection(other).area
                    if overlap > max(8.0, min(poly.area, other.area) * 0.01):
                        issues.append({"entity_kind": "plane", "entity_id": plane.plane_id, "problem": f"material overlap with peer plane {other_id}", "bbox": list(poly.bounds)})
                        break
                peer_planes.append((plane.plane_id, poly))
        for opening in region.openings:
            validate_polygon("opening", opening.opening_id, _points(opening.polygon))
        for edge in region.edges:
            pts = _points(edge.line)
            if len(pts) < 2 or any(not (0 <= p["x"] <= width and 0 <= p["y"] <= height) for p in pts):
                bbox = [min((p["x"] for p in pts), default=0), min((p["y"] for p in pts), default=0), max((p["x"] for p in pts), default=0), max((p["y"] for p in pts), default=0)]
                issues.append({"entity_kind": "edge", "entity_id": edge.edge_id, "problem": "invalid edge line", "bbox": bbox})
    return issues


def _replace_repaired_geometry(output: RoofGeometryOutput, repair: RoofGeometryRepairOutput, offset_x: int, offset_y: int) -> None:
    polygon = None if repair.polygon is None else [p.model_copy(update={"x": p.x + offset_x, "y": p.y + offset_y}) for p in repair.polygon]
    line = None if repair.line is None else [p.model_copy(update={"x": p.x + offset_x, "y": p.y + offset_y}) for p in repair.line]
    for region in output.roof_regions:
        if repair.entity_kind == "region" and region.roof_id == repair.entity_id and polygon:
            region.outer_boundary = polygon
            return
        for plane in region.planes:
            if repair.entity_kind == "plane" and plane.plane_id == repair.entity_id and polygon:
                plane.polygon = polygon
                return
        for opening in region.openings:
            if repair.entity_kind == "opening" and opening.opening_id == repair.entity_id and polygon:
                opening.polygon = polygon
                return
        for edge in region.edges:
            if repair.entity_kind == "edge" and edge.edge_id == repair.entity_id and line:
                edge.line = line
                return


def _targeted_repair(image_path: Path, output: RoofGeometryOutput, issue: dict[str, Any], model: str | None) -> bool:
    bbox = issue.get("bbox")
    if not bbox:
        return False
    with Image.open(image_path) as image:
        pad = 80
        x0 = max(0, int(math.floor(bbox[0] - pad)))
        y0 = max(0, int(math.floor(bbox[1] - pad)))
        x1 = min(image.width, int(math.ceil(bbox[2] + pad)))
        y1 = min(image.height, int(math.ceil(bbox[3] + pad)))
        if x1 - x0 < 20 or y1 - y0 < 20:
            return False
        crop = image.crop((x0, y0, x1, y1))
        repair_path = image_path.with_name(f"{image_path.stem}-roof-repair.png")
        crop.save(repair_path)
    try:
        repair = get_model_client("takeoff").parse_image(
            repair_path,
            ROOF_REPAIR_PROMPT.format(
                entity_kind=issue["entity_kind"], entity_id=issue["entity_id"], problem=issue["problem"],
                offset_x=x0, offset_y=y0, width=x1-x0, height=y1-y0,
            ),
            RoofGeometryRepairOutput,
            system=ROOF_REPAIR_SYSTEM,
            model=model,
            max_schema_retries=0,
        )
        _replace_repaired_geometry(output, repair, x0, y0)
        return True
    finally:
        try:
            repair_path.unlink(missing_ok=True)
        except OSError:
            pass


def _start_run(project_id: str, level_id: str | None, task: str, model: str | None, request_hash: str) -> str:
    settings = get_settings()
    floor_id = None
    if level_id:
        level = fetch_one("SELECT host_floor_id FROM roof_level WHERE id=%s", (level_id,))
        floor_id = str(level["host_floor_id"]) if level and level.get("host_floor_id") else None
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO takeoff_analysis_run(project_id,floor_id,module,task_type,provider,model_id,prompt_version,
                   status,progress,message,request_hash)
               VALUES (%s,%s,'roof',%s,%s,%s,'roof-v1','running',5,%s,%s) RETURNING id""",
            (project_id, floor_id, task, settings.takeoff_ai_provider, model, "Starting roof analysis", request_hash),
        ).fetchone()
    return str(row["id"])


def _finish_run(run_id: str, status: str, progress: int, message: str, result: Any = None, error: str | None = None) -> None:
    with transaction() as conn:
        conn.execute(
            """UPDATE takeoff_analysis_run SET status=%s,progress=%s,message=%s,result_json=%s,error_message=%s,
                   updated_at=now() WHERE id=%s""",
            (status, progress, message, Jsonb(result) if result is not None else None, error, run_id),
        )


def _save_geometry(project_id: str, level: dict[str, Any], output: RoofGeometryOutput) -> dict[str, str]:
    """Persist AI geometry, never overwriting user-confirmed roof planes."""
    plane_ids: dict[str, str] = {}
    mmpp = float(level["mm_per_pixel"]) if level.get("mm_per_pixel") else None
    with transaction() as conn:
        confirmed = conn.execute("SELECT count(*) AS n FROM roof_plane WHERE level_id=%s AND user_confirmed=true", (str(level["id"]),)).fetchone()["n"]
        if confirmed:
            raise RuntimeError("This roof source contains user-confirmed roof geometry. AI will not overwrite it.")
        conn.execute("DELETE FROM roof_review_item WHERE level_id=%s", (str(level["id"]),))
        conn.execute("DELETE FROM roof_region WHERE level_id=%s", (str(level["id"]),))
        conn.execute("DELETE FROM roof_plane WHERE level_id=%s", (str(level["id"]),))
        conn.execute("DELETE FROM roof_edge WHERE level_id=%s", (str(level["id"]),))
        conn.execute("DELETE FROM roof_opening WHERE level_id=%s", (str(level["id"]),))
        conn.execute("DELETE FROM roof_component WHERE level_id=%s", (str(level["id"]),))

        for region in output.roof_regions:
            rpts = _points(region.outer_boundary)
            region_row = conn.execute(
                """INSERT INTO roof_region(project_id,level_id,source_key,name,roof_type,level_text,geometry,
                       projected_area_m2,confidence,source_evidence)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (project_id, str(level["id"]), region.roof_id, region.name, region.roof_type, region.roof_level_text,
                 Jsonb({"points": rpts}), area_m2(rpts, mmpp), region.confidence,
                 Jsonb([{"kind": "ai_geometry", "source_key": region.roof_id}]))
            ).fetchone()
            region_id = str(region_row["id"])
            for plane in region.planes:
                pts = _points(plane.polygon)
                projected = area_m2(pts, mmpp)
                pitch_deg = _pitch_degrees(plane.pitch)
                surface, measurement_status = surface_area_from_projected(projected, plane.surface_type, pitch_deg)
                evidence = [e.model_dump() for e in plane.material_evidence]
                row = conn.execute(
                    """INSERT INTO roof_plane(project_id,level_id,region_id,source_key,name,surface_type,geometry,
                           pitch_value,pitch_unit,pitch_degrees,slope_direction,projected_area_m2,gross_surface_area_m2,
                           net_surface_area_m2,measurement_status,status,source_evidence,confidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'needs_review',%s,%s) RETURNING id""",
                    (project_id, str(level["id"]), region_id, plane.plane_id, plane.name, plane.surface_type,
                     Jsonb({"points": pts}), plane.pitch.value if plane.pitch else None,
                     plane.pitch.unit if plane.pitch else None, pitch_deg, plane.slope_direction, projected, surface, surface,
                     measurement_status, Jsonb(evidence), plane.confidence),
                ).fetchone()
                plane_ids[plane.plane_id] = str(row["id"])

            for edge in region.edges:
                pts = _points(edge.line)
                plan_length = _line_length_m(pts, mmpp)
                adjacent = next((p for p in region.planes if p.plane_id in edge.plane_ids), None)
                pitch_deg = _pitch_degrees(adjacent.pitch) if adjacent else None
                true_length = plan_length
                if adjacent and adjacent.surface_type == "sloped_planar" and pitch_deg is not None and edge.edge_type in {"verge", "rake", "hip", "valley"} and plan_length is not None:
                    true_length = round(plan_length / max(0.02, math.cos(math.radians(pitch_deg))), 4)
                conn.execute(
                    """INSERT INTO roof_edge(project_id,level_id,plane_id,source_key,edge_type,geometry,plan_length_m,
                           true_length_m,upstand_height_mm,include_as_upstand,source_evidence,confidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (project_id, str(level["id"]), plane_ids.get(edge.plane_ids[0]) if edge.plane_ids else None,
                     edge.edge_id, edge.edge_type, Jsonb({"points": pts}), plan_length, true_length, edge.height_mm,
                     edge.edge_type in UPSTAND_EDGE_TYPES, Jsonb([e.model_dump() for e in edge.evidence]), edge.confidence),
                )

            for opening in region.openings:
                pts = _points(opening.polygon)
                conn.execute(
                    """INSERT INTO roof_opening(project_id,level_id,plane_id,source_key,opening_type,name,geometry,
                           area_m2,perimeter_m,deduct_from_area,source_evidence,confidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (project_id, str(level["id"]), plane_ids.get(opening.plane_id or ""), opening.opening_id,
                     opening.opening_type, opening.name, Jsonb({"points": pts}), area_m2(pts, mmpp),
                     perimeter_m(pts, mmpp), opening.deduct_from_area,
                     Jsonb([e.model_dump() for e in opening.evidence]), opening.confidence),
                )

            for item in region.drainage:
                geometry: dict[str, Any] = {}
                quantity: float | None = None
                unit = "nr"
                if item.line:
                    pts = _points(item.line)
                    geometry["points"] = pts
                    quantity = _line_length_m(pts, mmpp)
                    unit = "m"
                elif item.point:
                    geometry["point"] = {"x": item.point.x, "y": item.point.y}
                    quantity = 1
                conn.execute(
                    """INSERT INTO roof_component(project_id,level_id,plane_id,source_key,component_type,name,geometry,
                           quantity,measurement_unit,nrm_work_section,source_evidence,confidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'33',%s,%s)""",
                    (project_id, str(level["id"]), plane_ids.get(item.plane_id or ""), item.drainage_id,
                     item.drainage_type, item.name, Jsonb(geometry), quantity, unit,
                     Jsonb([e.model_dump() for e in item.evidence]), item.confidence),
                )

        for review in output.review_items:
            entity_uuid = plane_ids.get(review.entity_id or "")
            conn.execute(
                """INSERT INTO roof_review_item(project_id,level_id,entity_type,entity_id,severity,code,message)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (project_id, str(level["id"]), review.entity_kind, entity_uuid, review.severity, review.code, review.message),
            )
        conn.execute(
            """UPDATE roof_level SET roof_type=%s,status='needs_review',confidence=%s,updated_at=now() WHERE id=%s""",
            (output.roof_regions[0].roof_type if output.roof_regions else "unknown",
             max((r.confidence for r in output.roof_regions), default=0), str(level["id"])),
        )
    _recalculate_level(str(level["id"]))
    return plane_ids


def _upsert_systems(project_id: str, catalog: RoofSystemResolutionOutput) -> dict[str, str]:
    system_ids: dict[str, str] = {}
    with transaction() as conn:
        for index, system in enumerate(catalog.system_definitions):
            existing = conn.execute(
                """SELECT rd.id, EXISTS(
                       SELECT 1 FROM roof_plane rp
                       WHERE rp.definition_id=rd.id AND rp.user_confirmed=true
                   ) AS protected
                   FROM roof_definition rd WHERE rd.project_id=%s AND rd.code=%s""",
                (project_id, system.mark),
            ).fetchone()
            # A definition already selected on confirmed user geometry is immutable to automatic
            # re-resolution. Keep both the definition and its layer stack exactly as reviewed.
            if existing and existing.get("protected"):
                system_ids[system.system_id] = str(existing["id"])
                continue
            nrm = nrm_section_for_covering(system.covering_class)
            layers_text = " · ".join(layer.name for layer in system.layers)
            row = conn.execute(
                """INSERT INTO roof_definition(project_id,code,name,description,covering_class,layers_text,falls_text,
                       nrm_work_section,waste_percent,display_colour,source_evidence,confidence,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
                   ON CONFLICT(project_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,
                       covering_class=excluded.covering_class,layers_text=excluded.layers_text,falls_text=excluded.falls_text,
                       nrm_work_section=excluded.nrm_work_section,waste_percent=excluded.waste_percent,
                       source_evidence=excluded.source_evidence,confidence=excluded.confidence,updated_at=now()
                   RETURNING id""",
                (project_id, system.mark, system.name, system.description, system.covering_class, layers_text,
                 system.falls_text, nrm, system.waste_percent, PALETTE[index % len(PALETTE)],
                 Jsonb([{"kind": "project_evidence", "text": system.source_text}]), system.confidence),
            ).fetchone()
            definition_id = str(row["id"])
            system_ids[system.system_id] = definition_id
            conn.execute("DELETE FROM roof_layer WHERE definition_id=%s", (definition_id,))
            for order, layer in enumerate(system.layers, start=1):
                conn.execute(
                    """INSERT INTO roof_layer(project_id,definition_id,layer_order,category,code,name,description,material,
                           thickness_mm,factor_per_m2,measurement_unit,nrm_work_section,source_evidence,confidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (project_id, definition_id, order, layer.category, layer.code, layer.name, layer.description,
                     layer.material, layer.thickness_mm, layer.factor_per_m2, layer.measurement_unit,
                     nrm_section_for_layer(layer.category, layer.nrm_work_section),
                     Jsonb([{"kind": "project_evidence", "text": layer.source_text}]), layer.confidence),
                )
        # Persistent explicit review family: it is never silently treated as a real roof system.
        row = conn.execute(
            """INSERT INTO roof_definition(project_id,code,name,description,covering_class,layers_text,falls_text,
                   nrm_work_section,display_colour,source_evidence,confidence,status,updated_at)
               VALUES (%s,'UNASSIGNED','Unassigned roof — review required','No supported roof system evidence has been confirmed',
                       'unknown','','','19','#64748b','[]'::jsonb,0,'active',now())
               ON CONFLICT(project_id,code) DO UPDATE SET updated_at=now() RETURNING id""",
            (project_id,),
        ).fetchone()
        system_ids["__unassigned__"] = str(row["id"])
        conn.execute(
            """INSERT INTO roof_upstand_definition(project_id,code,name,description,nrm_work_section,display_colour,status,updated_at)
               VALUES (%s,'UP-REVIEW','Roof upstand — review height','Detected parapet/abutment edges; confirm waterproofing upstand height','19','#0d9488','active',now())
               ON CONFLICT(project_id,code) DO UPDATE SET updated_at=now()""",
            (project_id,),
        )
    return system_ids


def _apply_assignments(project_id: str, catalog: RoofSystemResolutionOutput, system_ids: dict[str, str]) -> None:
    with transaction() as conn:
        for assignment in catalog.assignments:
            definition_id = system_ids.get(assignment.system_id)
            if not definition_id:
                continue
            for source_key in assignment.plane_ids:
                # Confirmed user selections win over new evidence resolution.
                conn.execute(
                    """UPDATE roof_plane SET definition_id=%s,updated_at=now()
                       WHERE project_id=%s AND source_key=%s AND user_confirmed=false""",
                    (definition_id, project_id, source_key),
                )
        unassigned = system_ids.get("__unassigned__")
        if unassigned:
            conn.execute(
                "UPDATE roof_plane SET definition_id=%s WHERE project_id=%s AND definition_id IS NULL",
                (unassigned, project_id),
            )
        upstand = conn.execute("SELECT id,height_mm FROM roof_upstand_definition WHERE project_id=%s AND code='UP-REVIEW'", (project_id,)).fetchone()
        if upstand:
            conn.execute(
                """UPDATE roof_plane SET upstand_definition_id=%s WHERE project_id=%s AND upstand_definition_id IS NULL""",
                (str(upstand["id"]), project_id),
            )
            if upstand.get("height_mm"):
                conn.execute(
                    """UPDATE roof_edge SET upstand_height_mm=COALESCE(upstand_height_mm,%s)
                       WHERE project_id=%s AND include_as_upstand=true""",
                    (upstand["height_mm"], project_id),
                )
    for level in fetch_all("SELECT id FROM roof_level WHERE project_id=%s", (project_id,)):
        _recalculate_level(str(level["id"]))


def _recalculate_level(level_id: str) -> None:
    level = fetch_one("SELECT * FROM roof_level WHERE id=%s", (level_id,))
    if not level:
        return
    project_id = str(level["project_id"])
    mmpp = float(level["mm_per_pixel"]) if level.get("mm_per_pixel") else None
    planes = fetch_all("SELECT * FROM roof_plane WHERE level_id=%s", (level_id,))
    with transaction() as conn:
        conn.execute("DELETE FROM roof_quantity WHERE level_id=%s", (level_id,))
        for plane in planes:
            points = _points((plane.get("geometry") or {}).get("points"))
            projected = area_m2(points, mmpp)
            surface, measurement_status = surface_area_from_projected(projected, plane["surface_type"], plane.get("pitch_degrees"))
            openings = conn.execute(
                "SELECT * FROM roof_opening WHERE plane_id=%s AND deduct_from_area=true", (str(plane["id"]),)
            ).fetchall()
            deduction = sum(float(row.get("area_m2") or 0) for row in openings)
            net = None if surface is None else round(max(0, surface - deduction), 4)
            conn.execute(
                """UPDATE roof_plane SET projected_area_m2=%s,gross_surface_area_m2=%s,opening_deduction_m2=%s,
                       net_surface_area_m2=%s,measurement_status=%s,updated_at=now() WHERE id=%s""",
                (projected, surface, deduction, net, measurement_status, str(plane["id"])),
            )
            definition = None
            if plane.get("definition_id"):
                definition = conn.execute("SELECT * FROM roof_definition WHERE id=%s", (str(plane["definition_id"]),)).fetchone()
            if definition:
                qty = net
                conn.execute(
                    """INSERT INTO roof_quantity(project_id,level_id,plane_id,entity_type,entity_id,work_section,item_code,
                           description,quantity,unit,basis,status,review_required,source_evidence)
                       VALUES (%s,%s,%s,'roof_plane',%s,%s,%s,%s,%s,'m²','actual roof surface area',%s,%s,%s)""",
                    (project_id, level_id, str(plane["id"]), str(plane["id"]),
                     definition.get("nrm_work_section") or nrm_section_for_covering(definition["covering_class"]),
                     definition.get("code"), definition.get("name"), qty,
                     "measured" if qty is not None else "needs_review", qty is None,
                     Jsonb(definition.get("source_evidence") or [])),
                )
                layers = conn.execute("SELECT * FROM roof_layer WHERE definition_id=%s ORDER BY layer_order", (str(definition["id"]),)).fetchall()
                for layer in layers:
                    layer_qty = None if net is None else round(net * float(layer.get("factor_per_m2") or 1), 4)
                    conn.execute(
                        """INSERT INTO roof_quantity(project_id,level_id,plane_id,entity_type,entity_id,work_section,item_code,
                               description,quantity,unit,basis,status,review_required,source_evidence)
                           VALUES (%s,%s,%s,'roof_layer',%s,%s,%s,%s,%s,%s,'roof surface × layer factor',%s,%s,%s)""",
                        (project_id, level_id, str(plane["id"]), str(layer["id"]),
                         nrm_section_for_layer(layer["category"], layer.get("nrm_work_section")), layer.get("code"),
                         layer["name"], layer_qty, layer.get("measurement_unit") or "m²",
                         "measured" if layer_qty is not None else "needs_review", layer_qty is None,
                         Jsonb(layer.get("source_evidence") or [])),
                    )
            props = conn.execute("SELECT * FROM roof_structural_properties WHERE level_id=%s AND plane_id=%s", (level_id, str(plane["id"]))).fetchone()
            if props and net is not None:
                if props.get("slab_thickness_mm"):
                    volume = round(net * float(props["slab_thickness_mm"]) / 1000.0, 4)
                    conn.execute(
                        """INSERT INTO roof_quantity(project_id,level_id,plane_id,entity_type,entity_id,work_section,description,
                               quantity,unit,basis,status,review_required) VALUES (%s,%s,%s,'concrete_roof',%s,'11','In-situ concrete roof slab',%s,'m³','net roof area × confirmed slab thickness','derived',false)""",
                        (project_id, level_id, str(plane["id"]), str(props["id"]), volume),
                    )
                if props.get("reinforcement_kg_m2"):
                    weight = round(net * float(props["reinforcement_kg_m2"]), 3)
                    conn.execute(
                        """INSERT INTO roof_quantity(project_id,level_id,plane_id,entity_type,entity_id,work_section,description,
                               quantity,unit,basis,status,review_required) VALUES (%s,%s,%s,'roof_reinforcement',%s,'11','Roof slab reinforcement',%s,'kg','net roof area × confirmed/derived kg/m² rule','derived',true)""",
                        (project_id, level_id, str(plane["id"]), str(props["id"]), weight),
                    )
                if props.get("formwork_soffit"):
                    conn.execute(
                        """INSERT INTO roof_quantity(project_id,level_id,plane_id,entity_type,entity_id,work_section,description,
                               quantity,unit,basis,status,review_required) VALUES (%s,%s,%s,'roof_formwork',%s,'11','Roof slab soffit formwork',%s,'m²','net roof/slab contact surface area','derived',false)""",
                        (project_id, level_id, str(plane["id"]), str(props["id"]), net),
                    )
                if props.get("formed_edge_depth_mm"):
                    perimeter = perimeter_m(points, mmpp)
                    if perimeter is not None:
                        edge_area = round(perimeter * float(props["formed_edge_depth_mm"]) / 1000.0, 4)
                        conn.execute(
                            """INSERT INTO roof_quantity(project_id,level_id,plane_id,entity_type,entity_id,work_section,description,
                                   quantity,unit,basis,status,review_required) VALUES (%s,%s,%s,'roof_edge_formwork',%s,'11','Roof slab edge formwork',%s,'m²','outer roof-plane perimeter × user-entered formed depth','derived',true)""",
                            (project_id, level_id, str(plane["id"]), str(props["id"]), edge_area),
                        )
        # Edge / opening / drainage quantities are independent of covering family.
        for edge in conn.execute("SELECT * FROM roof_edge WHERE level_id=%s", (level_id,)).fetchall():
            if edge.get("include_as_upstand"):
                length = edge.get("true_length_m") or edge.get("plan_length_m")
                height = edge.get("upstand_height_mm")
                if length is not None:
                    conn.execute(
                        """INSERT INTO roof_quantity(project_id,level_id,plane_id,entity_type,entity_id,work_section,
                               description,quantity,unit,basis,status,review_required)
                           VALUES (%s,%s,%s,'roof_upstand',%s,'19','Roof waterproofing upstand',%s,'m','selected parapet/abutment edge length',%s,%s)""",
                        (project_id, level_id, str(edge["plane_id"]) if edge.get("plane_id") else None, str(edge["id"]),
                         length, "measured" if height else "needs_review", height is None),
                    )
        for opening in conn.execute("SELECT * FROM roof_opening WHERE level_id=%s", (level_id,)).fetchall():
            if opening["opening_type"] in {"rooflight", "skylight", "lanternlight", "roof_hatch", "access_hatch", "smoke_vent"}:
                conn.execute(
                    """INSERT INTO roof_quantity(project_id,level_id,plane_id,entity_type,entity_id,work_section,description,
                           quantity,unit,basis,status,review_required)
                       VALUES (%s,%s,%s,'roof_opening',%s,'23',%s,%s,'nr','detected roof opening count','measured',true)""",
                    (project_id, level_id, str(opening["plane_id"]) if opening.get("plane_id") else None,
                     str(opening["id"]), opening.get("name") or opening["opening_type"], opening.get("count_quantity") or 1),
                )
        for component in conn.execute("SELECT * FROM roof_component WHERE level_id=%s", (level_id,)).fetchall():
            conn.execute(
                """INSERT INTO roof_quantity(project_id,level_id,plane_id,entity_type,entity_id,work_section,description,
                       quantity,unit,basis,status,review_required)
                   VALUES (%s,%s,%s,'roof_component',%s,%s,%s,%s,%s,'detected drainage/component geometry','measured',true)""",
                (project_id, level_id, str(component["plane_id"]) if component.get("plane_id") else None,
                 str(component["id"]), component.get("nrm_work_section") or "33",
                 component.get("name") or component["component_type"], component.get("quantity"), component.get("measurement_unit") or "nr"),
            )


def analyze_project_roofs(project_id: UUID | str, quality: str = "medium", force: bool = False) -> dict[str, Any]:
    pid = str(project_id)
    require_frozen_project(pid)
    settings = get_settings()
    if settings.takeoff_ai_provider.lower().strip() != "openai":
        raise RuntimeError("Automatic Roof detection requires TAKEOFF_AI_PROVIDER=openai and a backend OPENAI_API_KEY. Manual Roof editing remains available without AI.")
    levels = _ensure_roof_levels(pid)
    if not levels:
        raise RuntimeError("No confirmed roof plan / roof terrace / roof crop was found in the frozen Pre Project Frame. Review Plans and include the roof drawing first.")
    model = model_for_quality(quality)
    client = get_model_client("takeoff")
    analysed = 0
    skipped = 0
    for level in levels:
        image_path, ctx = ensure_viewport_crop(level["source_viewport_id"])
        words = extract_viewport_text(level["source_viewport_id"], max_items=650)
        request_hash = content_hash({
            "task": "roof_geometry", "viewport": str(level["source_viewport_id"]), "crop_version": ctx["crop_version"],
            "width": ctx["crop_width_px"], "height": ctx["crop_height_px"], "model": model, "prompt": "roof-v1",
        })
        cached = fetch_one(
            """SELECT id FROM takeoff_analysis_run WHERE project_id=%s AND module='roof' AND task_type='geometry'
               AND request_hash=%s AND status='completed' ORDER BY created_at DESC LIMIT 1""",
            (pid, request_hash),
        )
        existing = fetch_one("SELECT count(*) AS n FROM roof_plane WHERE level_id=%s", (str(level["id"]),))
        if cached and existing and existing["n"] and not force:
            skipped += 1
            continue
        run_id = _start_run(pid, str(level["id"]), "geometry", model, request_hash)
        try:
            output = client.parse_image(
                image_path,
                ROOF_GEOMETRY_PROMPT.format(
                    width=ctx["crop_width_px"], height=ctx["crop_height_px"], source_name=level["name"],
                    context="\n".join(f"{w['text']} @ {w['bbox']}" for w in words),
                ),
                RoofGeometryOutput,
                system=ROOF_SYSTEM,
                model=model,
                max_schema_retries=0,
            )
            if output.source_width_px != ctx["crop_width_px"] or output.source_height_px != ctx["crop_height_px"]:
                raise RuntimeError("Roof model returned a different coordinate space than the exact source crop")
            issues = _validate_geometry(output)
            # Roof plan hard limit: one primary geometry call + at most one targeted repair call.
            if issues:
                _targeted_repair(Path(image_path), output, issues[0], model)
                issues = _validate_geometry(output)
            if issues:
                raise RuntimeError(f"Roof geometry still needs review after the one allowed targeted repair: {issues[0]['problem']}")
            _save_geometry(pid, level, output)
            _finish_run(run_id, "completed", 70, "Roof geometry detected; resolving roof systems", output.model_dump())
            analysed += 1
        except Exception as exc:
            _finish_run(run_id, "failed", 100, "Roof geometry analysis failed", error=str(exc))
            raise

    # One catalog resolution across the project, cached by current detected keys + project text.
    planes = fetch_all("SELECT rp.source_key,rr.source_key AS roof_key,rp.source_evidence FROM roof_plane rp LEFT JOIN roof_region rr ON rr.id=rp.region_id WHERE rp.project_id=%s", (pid,))
    if planes:
        spec_text = project_text_evidence(pid, max_chars=70000)
        catalog_hash = content_hash({"task": "roof_systems", "planes": planes, "spec": spec_text, "model": model, "prompt": "roof-systems-v1"})
        cached_catalog = fetch_one(
            """SELECT result_json FROM takeoff_analysis_run WHERE project_id=%s AND module='roof' AND task_type='systems'
               AND request_hash=%s AND status='completed' ORDER BY created_at DESC LIMIT 1""",
            (pid, catalog_hash),
        )
        if cached_catalog and not force:
            catalog = RoofSystemResolutionOutput.model_validate(cached_catalog["result_json"])
        else:
            run_id = _start_run(pid, None, "systems", model, catalog_hash)
            try:
                catalog = client.parse_text(
                    ROOF_CATALOG_PROMPT.format(
                        roof_context="\n".join(f"roof={row.get('roof_key')} plane={row.get('source_key')} evidence={row.get('source_evidence') or []}" for row in planes),
                        spec_text=spec_text,
                    ),
                    RoofSystemResolutionOutput,
                    system=ROOF_CATALOG_SYSTEM,
                    model=model,
                )
                _finish_run(run_id, "completed", 100, "Roof systems resolved", catalog.model_dump())
            except Exception as exc:
                _finish_run(run_id, "failed", 100, "Roof system resolution failed", error=str(exc))
                raise
        systems = _upsert_systems(pid, catalog)
        _apply_assignments(pid, catalog, systems)
    else:
        # Still ensure explicit editable families exist if geometry was not available.
        _upsert_systems(pid, RoofSystemResolutionOutput())
    return {"status": "completed", "analysed_sources": analysed, "cached_sources": skipped, "levels": len(levels), "state": roof_demo_state(pid)}


def _nearest_polygon_edge_index(polygon: list[dict[str, float]], line: list[dict[str, float]]) -> int | None:
    if len(polygon) < 2 or len(line) < 2:
        return None
    target = LineString([(p["x"], p["y"]) for p in line])
    distances: list[tuple[float, int]] = []
    for i, start in enumerate(polygon):
        end = polygon[(i + 1) % len(polygon)]
        edge = LineString([(start["x"], start["y"]), (end["x"], end["y"])])
        distances.append((edge.distance(target), i))
    return min(distances)[1] if distances else None


def roof_demo_state(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    base = _roof_extra_demo_context(pid, viewport_demo_context(pid))
    definitions = fetch_all("SELECT * FROM roof_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code", (pid,))
    upstands = fetch_all("SELECT * FROM roof_upstand_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code", (pid,))
    # Manual mode still needs persisted real families, not hidden demo defaults.
    if not definitions or not upstands:
        _upsert_systems(pid, RoofSystemResolutionOutput())
        definitions = fetch_all("SELECT * FROM roof_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code", (pid,))
        upstands = fetch_all("SELECT * FROM roof_upstand_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code", (pid,))
    families = [{
        "id": str(row["id"]), "mark": row["code"], "description": row["name"],
        "layers": row.get("layers_text") or row.get("description") or "Review system layers",
        "falls": row.get("falls_text") or "As drawing / review",
        "source": "Project roof evidence" if row.get("source_evidence") else "Needs review",
        "color": row.get("display_colour") or PALETTE[0],
    } for row in definitions]
    upstand_families = [{
        "id": str(row["id"]), "mark": row["code"], "description": row["name"],
        "heightMm": float(row["height_mm"] or 0), "source": "Project roof evidence" if row.get("source_evidence") else "Review height",
        "color": row.get("display_colour") or "#0d9488",
    } for row in upstands]
    fallback_family = families[0]["id"]
    fallback_upstand = upstand_families[0]["id"]
    levels = {str(row["id"]): row for row in base.get("roof_levels", [])}
    zones: list[dict[str, Any]] = []
    planes = fetch_all("SELECT * FROM roof_plane WHERE project_id=%s ORDER BY level_id,created_at", (pid,))
    for plane in planes:
        level = levels.get(str(plane["level_id"])) or fetch_one("SELECT * FROM roof_level WHERE id=%s", (str(plane["level_id"]),))
        if not level:
            continue
        points = _points((plane.get("geometry") or {}).get("points"))
        openings = fetch_all("SELECT * FROM roof_opening WHERE plane_id=%s AND deduct_from_area=true", (str(plane["id"]),))
        deducts = [_points((row.get("geometry") or {}).get("points")) for row in openings]
        edge_flags = [False] * len(points)
        edges = fetch_all("SELECT * FROM roof_edge WHERE plane_id=%s AND include_as_upstand=true", (str(plane["id"]),))
        props = fetch_one("SELECT * FROM roof_structural_properties WHERE level_id=%s AND plane_id=%s", (str(plane["level_id"]), str(plane["id"])))
        for edge in edges:
            index = _nearest_polygon_edge_index(points, _points((edge.get("geometry") or {}).get("points")))
            if index is not None and index < len(edge_flags):
                edge_flags[index] = True
        host_floor_id = str(level.get("host_floor_id") or (base["storeys"][-1]["id"] if base["storeys"] else ""))
        zones.append({
            "id": str(plane["id"]),
            "familyId": str(plane.get("definition_id") or fallback_family),
            "upstandFamilyId": str(plane.get("upstand_definition_id") or fallback_upstand),
            "scope": "Terrace" if level.get("scope") == "terrace" else "Upper roof",
            "floorId": host_floor_id,
            "viewportId": str(level["source_viewport_id"]),
            "points": points,
            "deducts": deducts,
            "upstandEdges": edge_flags,
            "status": "confirmed" if plane.get("user_confirmed") else "needs_review" if plane.get("measurement_status") != "measured" else "ready",
            "projectedAreaM2": float(plane["projected_area_m2"]) if plane.get("projected_area_m2") is not None else None,
            "measuredAreaM2": float(plane["net_surface_area_m2"]) if plane.get("net_surface_area_m2") is not None else None,
            "pitchDegrees": float(plane["pitch_degrees"]) if plane.get("pitch_degrees") is not None else None,
            "roofType": plane.get("surface_type") or "unknown",
            "measurementStatus": plane.get("measurement_status"),
            "measuredUpstandM": round(sum(float(e.get("true_length_m") or e.get("plan_length_m") or 0) for e in edges), 4),
            "slabThicknessMm": float(props["slab_thickness_mm"]) if props and props.get("slab_thickness_mm") is not None else None,
            "reinforcementKgM2": float(props["reinforcement_kg_m2"]) if props and props.get("reinforcement_kg_m2") is not None else None,
            "soffitFormwork": bool(props.get("formwork_soffit")) if props else False,
            "formedEdgeDepthMm": float(props["formed_edge_depth_mm"]) if props and props.get("formed_edge_depth_mm") is not None else None,
            "structuralBasis": props.get("basis") if props else None,
        })
    ui = fetch_one("SELECT state_json FROM takeoff_ui_state WHERE project_id=%s AND module='roof'", (pid,))
    run = fetch_one("SELECT status,progress,message,error_message FROM takeoff_analysis_run WHERE project_id=%s AND module='roof' ORDER BY created_at DESC LIMIT 1", (pid,))
    return {
        "sheets": base["sheets"], "viewports": base["viewports"], "storeys": base["storeys"],
        "families": families, "upstandFamilies": upstand_families, "zones": zones,
        "uiState": (ui or {}).get("state_json") or {}, "analysis": run,
        "provider": get_settings().takeoff_ai_provider.lower().strip(),
        "reviewItems": fetch_all("SELECT * FROM roof_review_item WHERE project_id=%s AND resolved=false ORDER BY severity DESC,created_at", (pid,)),
    }


def _demo_edge_line(points: list[dict[str, float]], index: int) -> list[dict[str, float]]:
    if not points:
        return []
    return [points[index], points[(index + 1) % len(points)]]


def save_roof_demo_state(project_id: UUID | str, payload: dict[str, Any]) -> dict[str, Any]:
    pid = str(project_id)
    require_frozen_project(pid)
    _ensure_roof_levels(pid)
    families = payload.get("families") or []
    upstands = payload.get("upstandFamilies") or []
    zones = payload.get("zones") or []
    ui_state = payload.get("uiState") or {}
    with transaction() as conn:
        for family in families:
            if not family.get("id"):
                continue
            conn.execute(
                """UPDATE roof_definition SET code=%s,name=%s,layers_text=%s,falls_text=%s,display_colour=%s,
                       status='active',updated_at=now() WHERE id=%s AND project_id=%s""",
                (family.get("mark") or "ROOF", family.get("description") or "Roof system",
                 family.get("layers"), family.get("falls"), family.get("color") or "#64748b", family["id"], pid),
            )
        for item in upstands:
            if not item.get("id"):
                continue
            conn.execute(
                """UPDATE roof_upstand_definition SET code=%s,name=%s,height_mm=%s,display_colour=%s,updated_at=now()
                   WHERE id=%s AND project_id=%s""",
                (item.get("mark") or "UP", item.get("description") or "Roof upstand", item.get("heightMm"),
                 item.get("color") or "#0d9488", item["id"], pid),
            )
        incoming_ids = {str(z.get("id")) for z in zones if z.get("id")}
        existing = conn.execute("SELECT id FROM roof_plane WHERE project_id=%s", (pid,)).fetchall()
        for row in existing:
            if str(row["id"]) not in incoming_ids:
                conn.execute("DELETE FROM roof_plane WHERE id=%s", (str(row["id"]),))
        for zone in zones:
            points = _points(zone.get("points"))
            if len(points) < 3:
                continue
            viewport_id = zone.get("viewportId")
            level = conn.execute("SELECT * FROM roof_level WHERE project_id=%s AND source_viewport_id=%s", (pid, viewport_id)).fetchone()
            if not level:
                continue
            before = conn.execute("SELECT * FROM roof_plane WHERE id=%s AND project_id=%s", (zone.get("id"), pid)).fetchone()
            # The demo UI exposes scope/floor selection. Persist it on the production roof level so
            # reopening the project never falls back to a demo-only choice.
            requested_floor = zone.get("floorId")
            requested_scope = str(zone.get("scope") or "").strip().lower()
            scope_value = "terrace" if requested_scope == "terrace" else "upper_roof" if requested_scope in {"upper roof", "upper_roof"} else level.get("scope")
            conn.execute(
                "UPDATE roof_level SET host_floor_id=COALESCE(%s,host_floor_id),scope=COALESCE(%s,scope),updated_at=now() WHERE id=%s",
                (requested_floor or None, scope_value or None, str(level["id"])),
            )
            if requested_floor:
                level["host_floor_id"] = requested_floor
            if scope_value:
                level["scope"] = scope_value
            projected = area_m2(points, float(level["mm_per_pixel"]) if level.get("mm_per_pixel") else None)
            pitch = float(zone["pitchDegrees"]) if zone.get("pitchDegrees") is not None else (float(before["pitch_degrees"]) if before and before.get("pitch_degrees") is not None else None)
            surface_type = str(zone.get("roofType") or (before.get("surface_type") if before else "flat"))
            surface, measurement_status = surface_area_from_projected(projected, surface_type, pitch)
            status = zone.get("status") or "needs_review"
            user_confirmed = status == "confirmed"
            if before:
                conn.execute(
                    """UPDATE roof_plane SET definition_id=%s,upstand_definition_id=%s,geometry=%s,pitch_degrees=%s,
                           projected_area_m2=%s,gross_surface_area_m2=%s,net_surface_area_m2=%s,measurement_status=%s,
                           status=%s,user_confirmed=%s,updated_at=now() WHERE id=%s""",
                    (zone.get("familyId"), zone.get("upstandFamilyId"), Jsonb({"points": points}), pitch, projected,
                     surface, surface, measurement_status, status, user_confirmed, zone["id"]),
                )
                plane_id = str(zone["id"])
            else:
                region = conn.execute("SELECT id FROM roof_region WHERE level_id=%s ORDER BY created_at LIMIT 1", (str(level["id"]),)).fetchone()
                if not region:
                    region = conn.execute(
                        """INSERT INTO roof_region(project_id,level_id,name,roof_type,geometry,status,user_confirmed)
                           VALUES (%s,%s,'Manual roof','unknown',%s,'needs_review',false) RETURNING id""",
                        (pid, str(level["id"]), Jsonb({"points": points})),
                    ).fetchone()
                row = conn.execute(
                    """INSERT INTO roof_plane(project_id,level_id,region_id,definition_id,upstand_definition_id,name,
                           surface_type,geometry,pitch_degrees,projected_area_m2,gross_surface_area_m2,net_surface_area_m2,
                           measurement_status,status,user_confirmed)
                       VALUES (%s,%s,%s,%s,%s,'Manual roof plane',%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (pid, str(level["id"]), str(region["id"]), zone.get("familyId"), zone.get("upstandFamilyId"),
                     surface_type, Jsonb({"points": points}), pitch, projected, surface, surface, measurement_status, status, user_confirmed),
                ).fetchone()
                plane_id = str(row["id"])
            # Persist demo edge toggles as actual roof-edge records. AI edge records not selected as upstands remain.
            flags = list(zone.get("upstandEdges") or [])
            conn.execute("DELETE FROM roof_edge WHERE plane_id=%s AND source_key LIKE 'ui-edge-%%'", (plane_id,))
            upstand = conn.execute("SELECT height_mm FROM roof_upstand_definition WHERE id=%s", (zone.get("upstandFamilyId"),)).fetchone()
            for index, flag in enumerate(flags):
                if not flag or index >= len(points):
                    continue
                line = _demo_edge_line(points, index)
                length = _line_length_m(line, float(level["mm_per_pixel"]) if level.get("mm_per_pixel") else None)
                conn.execute(
                    """INSERT INTO roof_edge(project_id,level_id,plane_id,source_key,edge_type,geometry,plan_length_m,true_length_m,
                           upstand_height_mm,include_as_upstand,status,user_confirmed)
                       VALUES (%s,%s,%s,%s,'parapet',%s,%s,%s,%s,true,%s,%s)""",
                    (pid, str(level["id"]), plane_id, f"ui-edge-{index}", Jsonb({"points": line}), length, length,
                     upstand.get("height_mm") if upstand else None, status, user_confirmed),
                )
            if any(zone.get(key) is not None for key in ("slabThicknessMm", "reinforcementKgM2", "formedEdgeDepthMm")) or zone.get("soffitFormwork"):
                conn.execute(
                    """INSERT INTO roof_structural_properties(project_id,level_id,plane_id,slab_thickness_mm,reinforcement_kg_m2,
                           formed_edge_depth_mm,formwork_soffit,basis,user_confirmed,updated_at)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
                       ON CONFLICT(level_id,plane_id) DO UPDATE SET slab_thickness_mm=excluded.slab_thickness_mm,
                           reinforcement_kg_m2=excluded.reinforcement_kg_m2,formed_edge_depth_mm=excluded.formed_edge_depth_mm,
                           formwork_soffit=excluded.formwork_soffit,basis=excluded.basis,user_confirmed=excluded.user_confirmed,updated_at=now()""",
                    (pid, str(level["id"]), plane_id, zone.get("slabThicknessMm"), zone.get("reinforcementKgM2"),
                     zone.get("formedEdgeDepthMm"), bool(zone.get("soffitFormwork")), zone.get("structuralBasis") or "user_entered", user_confirmed),
                )
            else:
                conn.execute("DELETE FROM roof_structural_properties WHERE level_id=%s AND plane_id=%s", (str(level["id"]), plane_id))
            conn.execute(
                """INSERT INTO takeoff_history(project_id,floor_id,module,entity_type,entity_id,action,before_json,after_json,changed_by)
                   VALUES (%s,%s,'roof','roof_plane',%s,%s,%s,%s,'user')""",
                (pid, str(level["host_floor_id"]) if level.get("host_floor_id") else None, plane_id,
                 "update" if before else "create", Jsonb(dict(before)) if before else None, Jsonb(zone)),
            )
        conn.execute(
            """INSERT INTO takeoff_ui_state(project_id,module,state_json,updated_at) VALUES (%s,'roof',%s,now())
               ON CONFLICT(project_id,module) DO UPDATE SET state_json=excluded.state_json,updated_at=now()""",
            (pid, Jsonb(ui_state)),
        )
    for level in fetch_all("SELECT id FROM roof_level WHERE project_id=%s", (pid,)):
        _recalculate_level(str(level["id"]))
    return roof_demo_state(pid)


def roof_state(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    _ensure_roof_levels(pid)
    return {
        "levels": fetch_all("SELECT * FROM roof_level WHERE project_id=%s ORDER BY created_at", (pid,)),
        "regions": fetch_all("SELECT * FROM roof_region WHERE project_id=%s ORDER BY created_at", (pid,)),
        "planes": fetch_all("SELECT * FROM roof_plane WHERE project_id=%s ORDER BY created_at", (pid,)),
        "edges": fetch_all("SELECT * FROM roof_edge WHERE project_id=%s ORDER BY created_at", (pid,)),
        "openings": fetch_all("SELECT * FROM roof_opening WHERE project_id=%s ORDER BY created_at", (pid,)),
        "components": fetch_all("SELECT * FROM roof_component WHERE project_id=%s ORDER BY created_at", (pid,)),
        "definitions": fetch_all("SELECT * FROM roof_definition WHERE project_id=%s ORDER BY code", (pid,)),
        "layers": fetch_all("SELECT rl.* FROM roof_layer rl JOIN roof_definition rd ON rd.id=rl.definition_id WHERE rd.project_id=%s ORDER BY rl.definition_id,rl.layer_order", (pid,)),
        "quantities": fetch_all("SELECT * FROM roof_quantity WHERE project_id=%s ORDER BY work_section,description", (pid,)),
        "review_items": fetch_all("SELECT * FROM roof_review_item WHERE project_id=%s ORDER BY resolved,severity DESC,created_at", (pid,)),
        "runs": fetch_all("SELECT * FROM takeoff_analysis_run WHERE project_id=%s AND module='roof' ORDER BY created_at DESC LIMIT 20", (pid,)),
    }


def update_roof_entity(project_id: str, table: str, entity_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    allowed: dict[str, set[str]] = {
        "roof_level": {"name", "level_text", "roof_type", "scope", "status", "user_confirmed"},
        "roof_plane": {"definition_id", "upstand_definition_id", "name", "surface_type", "pitch_value", "pitch_unit", "pitch_degrees", "slope_direction", "include_in_boq", "status", "user_confirmed"},
        "roof_edge": {"edge_type", "upstand_height_mm", "include_as_upstand", "status", "user_confirmed"},
        "roof_opening": {"opening_type", "name", "deduct_from_area", "status", "user_confirmed"},
        "roof_component": {"component_type", "name", "quantity", "measurement_unit", "nrm_work_section", "status", "user_confirmed"},
        "roof_definition": {"code", "name", "description", "covering_class", "layers_text", "falls_text", "nrm_work_section", "waste_percent", "display_colour", "status"},
        "roof_upstand_definition": {"code", "name", "description", "height_mm", "display_colour", "status"},
    }
    if table not in allowed:
        raise ValueError("Unsupported roof entity")
    clean = {key: value for key, value in patch.items() if key in allowed[table]}
    if not clean:
        row = fetch_one(f"SELECT * FROM {table} WHERE id=%s AND project_id=%s", (entity_id, project_id))
        if not row:
            raise ValueError("Roof entity not found")
        return row
    assignments = ",".join(f"{key}=%s" for key in clean)
    with transaction() as conn:
        row = conn.execute(
            f"UPDATE {table} SET {assignments},updated_at=now() WHERE id=%s AND project_id=%s RETURNING *",
            (*clean.values(), entity_id, project_id),
        ).fetchone()
    if not row:
        raise ValueError("Roof entity not found")
    level_id = row.get("level_id")
    if level_id:
        _recalculate_level(str(level_id))
    return dict(row)
