from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from shapely.geometry import LineString, Polygon
from shapely.ops import split, unary_union

from ....database.connection import fetch_all, fetch_one, transaction
from ....database.json_value import Jsonb
from ....modules.takeoff.common import area_m2, ensure_takeoff_floors, source_mm_per_pixel
from ....modules.takeoff.roofs import (
    _ensure_roof_levels,
    _recalculate_level,
    _save_geometry,
    _validate_geometry,
    analyze_project_roofs,
    roof_demo_state,
    roof_state,
    save_roof_demo_state,
    update_roof_entity,
)
from ....services.pdf.media import ensure_viewport_crop
from ....modules.takeoff.model_schemas import RoofGeometryOutput

router = APIRouter(tags=["roof-takeoff"])


class DemoStateBody(BaseModel):
    model_config = ConfigDict(extra="allow")
    families: list[dict] = []
    upstandFamilies: list[dict] = []
    zones: list[dict] = []
    uiState: dict = {}




class ImportBody(BaseModel):
    host_floor_id: str | None = None
    result: dict
    force: bool = True
    quality: str = "medium"

class AnalyzeBody(BaseModel):
    host_floor_id: str | None = None
    force: bool = False
    method: str = "ai"
    quality: str = Field(default="medium", pattern="^(easy|medium|expert|maximum)$")


class PatchBody(BaseModel):
    model_config = ConfigDict(extra="allow")


class ConfirmBody(BaseModel):
    entity_type: str
    entity_ids: list[str]


class RecalculateBody(BaseModel):
    level_id: str


class SplitBody(BaseModel):
    line: list[dict]


class MergeBody(BaseModel):
    plane_ids: list[str]


@router.get("/projects/{project_id}/takeoff/roof/demo-state")
def get_demo_state(project_id: UUID):
    try:
        return roof_demo_state(project_id)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.put("/projects/{project_id}/takeoff/roof/demo-state")
def put_demo_state(project_id: UUID, body: DemoStateBody):
    try:
        return save_roof_demo_state(project_id, body.model_dump())
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/takeoff/roof/analyze")
def analyze_takeoff_roof(project_id: UUID, quality: str = Query(default="medium", pattern="^(easy|medium|expert|maximum)$"), force: bool = False):
    try:
        return analyze_project_roofs(project_id, quality=quality, force=force)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


# Full production Roof API. The supplied demo-derived UI uses the /takeoff/roof
# bridge above; these endpoints keep roof data available to future dedicated UI,
# Review, BOQ and integrations without restructuring the database later.
@router.get("/projects/{project_id}/roofs")
def get_roofs(project_id: UUID, level_id: UUID | None = None, floor_id: UUID | None = None):
    try:
        state = roof_state(project_id)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc
    if level_id:
        lid = str(level_id)
        for key in ("levels", "regions", "planes", "edges", "openings", "components", "quantities"):
            if key == "levels":
                state[key] = [row for row in state[key] if str(row["id"]) == lid]
            else:
                state[key] = [row for row in state[key] if str(row.get("level_id")) == lid]
    if floor_id:
        allowed = {str(r["id"]) for r in state["levels"] if str(r.get("host_floor_id")) == str(floor_id)}
        state["levels"] = [r for r in state["levels"] if str(r["id"]) in allowed]
        for key in ("regions", "planes", "edges", "openings", "components", "quantities"):
            state[key] = [row for row in state[key] if str(row.get("level_id")) in allowed]
    return state


@router.post("/projects/{project_id}/roofs/analyze")
def analyze_roofs(project_id: UUID, body: AnalyzeBody):
    try:
        return analyze_project_roofs(project_id, quality=body.quality, force=body.force)
    except (ValueError, RuntimeError, TypeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/projects/{project_id}/roofs/crop")
def roof_crop_info(project_id: UUID, host_floor_id: UUID | None = None):
    levels = _ensure_roof_levels(str(project_id))
    if host_floor_id:
        levels = [r for r in levels if str(r.get("host_floor_id")) == str(host_floor_id)]
    if not levels:
        raise HTTPException(404, "No roof crop is available for this project/floor")
    level = levels[0]
    crop_path, _ = ensure_viewport_crop(level["source_viewport_id"])
    return FileResponse(crop_path, media_type="image/png", filename="roof-plan-crop.png")


@router.post("/projects/{project_id}/roofs/import-json")
def import_roof_json(project_id: UUID, body: ImportBody):
    levels = _ensure_roof_levels(str(project_id))
    if body.host_floor_id:
        levels = [r for r in levels if str(r.get("host_floor_id")) == str(body.host_floor_id)]
    if not levels:
        raise HTTPException(404, "No roof source is available for this floor")
    level = levels[0]
    try:
        result = RoofGeometryOutput.model_validate(body.result)
        issues = _validate_geometry(result)
        if issues:
            raise RuntimeError(f"Imported roof JSON has invalid geometry: {issues[0]['problem']}")
        _save_geometry(str(project_id), level, result)
        return {"job": {"id": f"import-{level['id']}", "status": "completed", "progress": 100, "created": True}}
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/projects/{project_id}/roofs/levels")
def create_level(project_id: UUID, body: PatchBody):
    data = body.model_dump(exclude_unset=True)
    source_viewport_id = data.get("source_viewport_id")
    if not source_viewport_id:
        raise HTTPException(422, "source_viewport_id is required")
    try:
        _, ctx = ensure_viewport_crop(source_viewport_id)
        mmpp, verified = source_mm_per_pixel(source_viewport_id)
        with transaction() as conn:
            row = conn.execute(
                """INSERT INTO roof_level(project_id,host_floor_id,source_viewport_id,name,level_text,roof_type,scope,
                       drawing_width,drawing_height,mm_per_pixel,scale_verified,crop_version,status,user_confirmed)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
                (str(project_id), data.get("host_floor_id"), source_viewport_id, data.get("name") or "Roof",
                 data.get("level_text"), data.get("roof_type") or "unknown", data.get("scope") or "roof",
                 ctx["crop_width_px"], ctx["crop_height_px"], mmpp, verified, ctx["crop_version"],
                 data.get("status") or "needs_review", bool(data.get("user_confirmed", False))),
            ).fetchone()
        return {"level": dict(row)}
    except Exception as exc:
        raise HTTPException(409, str(exc)) from exc


@router.patch("/projects/{project_id}/roofs/levels/{level_id}")
def patch_level(project_id: UUID, level_id: UUID, body: PatchBody):
    try:
        return {"level": update_roof_entity(str(project_id), "roof_level", str(level_id), body.model_dump(exclude_unset=True))}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.delete("/projects/{project_id}/roofs/levels/{level_id}")
def delete_level(project_id: UUID, level_id: UUID):
    with transaction() as conn:
        row = conn.execute("DELETE FROM roof_level WHERE id=%s AND project_id=%s RETURNING id", (str(level_id), str(project_id))).fetchone()
    if not row:
        raise HTTPException(404, "Roof level not found")
    return {"deleted": str(level_id)}


@router.post("/projects/{project_id}/roofs/definitions")
def create_definition(project_id: UUID, body: PatchBody):
    data = body.model_dump(exclude_unset=True)
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO roof_definition(project_id,code,name,description,covering_class,layers_text,falls_text,
                   nrm_work_section,waste_percent,display_colour,status)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active') RETURNING *""",
            (str(project_id), data.get("code") or "ROOF", data.get("name") or "Roof system", data.get("description"),
             data.get("covering_class") or data.get("system_type") or "unknown", data.get("layers_text"), data.get("falls_text"),
             data.get("nrm_work_section"), data.get("waste_percent") or data.get("default_waste_percent") or 0,
             data.get("display_colour") or "#64748b"),
        ).fetchone()
    return {"definition": dict(row)}


@router.patch("/projects/{project_id}/roofs/definitions/{definition_id}")
def patch_definition(project_id: UUID, definition_id: UUID, body: PatchBody):
    try:
        return {"definition": update_roof_entity(str(project_id), "roof_definition", str(definition_id), body.model_dump(exclude_unset=True))}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/projects/{project_id}/roofs/definitions/{definition_id}/layers")
def add_layer(project_id: UUID, definition_id: UUID, body: PatchBody):
    data = body.model_dump(exclude_unset=True)
    definition = fetch_one("SELECT id FROM roof_definition WHERE id=%s AND project_id=%s", (str(definition_id), str(project_id)))
    if not definition:
        raise HTTPException(404, "Roof definition not found")
    order = fetch_one("SELECT COALESCE(max(layer_order),0)+1 AS n FROM roof_layer WHERE definition_id=%s", (str(definition_id),))["n"]
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO roof_layer(project_id,definition_id,layer_order,category,code,name,description,material,thickness_mm,
                   factor_per_m2,measurement_unit,nrm_work_section) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (str(project_id), str(definition_id), order, data.get("category") or data.get("layer_type") or "other", data.get("code"),
             data.get("name") or "Roof layer", data.get("description"), data.get("material"), data.get("thickness_mm"),
             data.get("factor_per_m2") or 1, data.get("measurement_unit") or "m²", data.get("nrm_work_section")),
        ).fetchone()
    return {"layer": dict(row)}


def _level_or_404(project_id: UUID, level_id: UUID):
    level = fetch_one("SELECT * FROM roof_level WHERE id=%s AND project_id=%s", (str(level_id), str(project_id)))
    if not level:
        raise HTTPException(404, "Roof level not found")
    return level


@router.post("/projects/{project_id}/roofs/levels/{level_id}/planes")
def create_plane(project_id: UUID, level_id: UUID, body: PatchBody):
    level = _level_or_404(project_id, level_id)
    data = body.model_dump(exclude_unset=True)
    points = data.get("points") or (data.get("geometry") or {}).get("points") or []
    if len(points) < 3:
        raise HTTPException(422, "Roof plane needs at least three points")
    projected = area_m2(points, float(level["mm_per_pixel"]) if level.get("mm_per_pixel") else None)
    with transaction() as conn:
        region = conn.execute("SELECT id FROM roof_region WHERE level_id=%s ORDER BY created_at LIMIT 1", (str(level_id),)).fetchone()
        if not region:
            region = conn.execute("INSERT INTO roof_region(project_id,level_id,name,roof_type,geometry) VALUES (%s,%s,'Manual roof','unknown',%s) RETURNING id", (str(project_id), str(level_id), Jsonb({"points": points}))).fetchone()
        row = conn.execute(
            """INSERT INTO roof_plane(project_id,level_id,region_id,definition_id,name,surface_type,geometry,pitch_degrees,
                   projected_area_m2,status,user_confirmed) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (str(project_id), str(level_id), str(region["id"]), data.get("definition_id"), data.get("name"),
             data.get("surface_type") or ("sloped_planar" if data.get("surface_class") == "sloping_planar" else "flat"),
             Jsonb({"points": points}), data.get("pitch_degrees"), projected, data.get("status") or "needs_review", bool(data.get("user_confirmed", False))),
        ).fetchone()
    _recalculate_level(str(level_id))
    return {"plane": dict(row)}


@router.patch("/projects/{project_id}/roofs/levels/{level_id}/planes/{plane_id}")
def patch_plane(project_id: UUID, level_id: UUID, plane_id: UUID, body: PatchBody):
    data = body.model_dump(exclude_unset=True)
    points = data.pop("points", None)
    try:
        row = update_roof_entity(str(project_id), "roof_plane", str(plane_id), data)
        if points:
            level = _level_or_404(project_id, level_id)
            projected = area_m2(points, float(level["mm_per_pixel"]) if level.get("mm_per_pixel") else None)
            with transaction() as conn:
                row = dict(conn.execute("UPDATE roof_plane SET geometry=%s,projected_area_m2=%s,updated_at=now() WHERE id=%s RETURNING *", (Jsonb({"points": points}), projected, str(plane_id))).fetchone())
            _recalculate_level(str(level_id))
        return {"plane": row}
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.delete("/projects/{project_id}/roofs/levels/{level_id}/planes/{plane_id}")
def delete_plane(project_id: UUID, level_id: UUID, plane_id: UUID):
    with transaction() as conn:
        row = conn.execute("DELETE FROM roof_plane WHERE id=%s AND level_id=%s AND project_id=%s RETURNING id", (str(plane_id), str(level_id), str(project_id))).fetchone()
    if not row:
        raise HTTPException(404, "Roof plane not found")
    _recalculate_level(str(level_id))
    return {"deleted": str(plane_id)}


@router.post("/projects/{project_id}/roofs/levels/{level_id}/planes/{plane_id}/split")
def split_plane(project_id: UUID, level_id: UUID, plane_id: UUID, body: SplitBody):
    row = fetch_one("SELECT * FROM roof_plane WHERE id=%s AND level_id=%s AND project_id=%s", (str(plane_id), str(level_id), str(project_id)))
    if not row:
        raise HTTPException(404, "Roof plane not found")
    points = (row.get("geometry") or {}).get("points") or []
    try:
        polygon = Polygon([(p["x"], p["y"]) for p in points])
        line = LineString([(p["x"], p["y"]) for p in body.line])
        parts = list(split(polygon, line).geoms)
    except Exception as exc:
        raise HTTPException(409, f"Roof plane could not be split: {exc}") from exc
    if len(parts) < 2:
        raise HTTPException(409, "Split line does not divide the roof plane")
    payloads = []
    for part in parts:
        payloads.append([{"x": round(x, 3), "y": round(y, 3)} for x, y in list(part.exterior.coords)[:-1]])
    with transaction() as conn:
        conn.execute("DELETE FROM roof_plane WHERE id=%s", (str(plane_id),))
        created = []
        for pts in payloads:
            created.append(dict(conn.execute(
                """INSERT INTO roof_plane(project_id,level_id,region_id,definition_id,upstand_definition_id,name,surface_type,geometry,
                       pitch_value,pitch_unit,pitch_degrees,slope_direction,status,user_confirmed)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'needs_review',false) RETURNING *""",
                (str(project_id), str(level_id), str(row["region_id"]) if row.get("region_id") else None,
                 str(row["definition_id"]) if row.get("definition_id") else None,
                 str(row["upstand_definition_id"]) if row.get("upstand_definition_id") else None,
                 row.get("name"), row["surface_type"], Jsonb({"points": pts}), row.get("pitch_value"), row.get("pitch_unit"),
                 row.get("pitch_degrees"), row.get("slope_direction")),
            ).fetchone()))
    _recalculate_level(str(level_id))
    return {"planes": created}


@router.post("/projects/{project_id}/roofs/levels/{level_id}/planes/merge")
def merge_planes(project_id: UUID, level_id: UUID, body: MergeBody):
    rows = [fetch_one("SELECT * FROM roof_plane WHERE id=%s AND level_id=%s AND project_id=%s", (pid, str(level_id), str(project_id))) for pid in body.plane_ids]
    rows = [r for r in rows if r]
    if len(rows) < 2:
        raise HTTPException(409, "Select at least two roof planes")
    if len({str(r.get("definition_id")) for r in rows}) > 1 or len({r["surface_type"] for r in rows}) > 1:
        raise HTTPException(409, "Only roof planes with the same system and surface type can be merged")
    merged = unary_union([Polygon([(p["x"], p["y"]) for p in (r.get("geometry") or {}).get("points", [])]) for r in rows])
    if merged.geom_type != "Polygon":
        raise HTTPException(409, "Selected roof planes do not form one continuous polygon")
    points = [{"x": round(x, 3), "y": round(y, 3)} for x, y in list(merged.exterior.coords)[:-1]]
    keep = rows[0]
    with transaction() as conn:
        conn.execute("DELETE FROM roof_plane WHERE id = ANY(%s::uuid[])", ([str(r["id"]) for r in rows[1:]],))
        row = conn.execute("UPDATE roof_plane SET geometry=%s,status='needs_review',user_confirmed=false,updated_at=now() WHERE id=%s RETURNING *", (Jsonb({"points": points}), str(keep["id"]))).fetchone()
    _recalculate_level(str(level_id))
    return {"plane": dict(row)}


def _create_simple(project_id: UUID, level_id: UUID, table: str, data: dict):
    _level_or_404(project_id, level_id)
    if table == "roof_edge":
        geometry = data.get("geometry") or {"points": data.get("points") or []}
        with transaction() as conn:
            row = conn.execute("""INSERT INTO roof_edge(project_id,level_id,plane_id,edge_type,geometry,upstand_height_mm,include_as_upstand,status,user_confirmed)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""", (str(project_id), str(level_id), data.get("plane_id"), data.get("edge_type") or "unknown_roof_boundary", Jsonb(geometry), data.get("upstand_height_mm"), bool(data.get("include_as_upstand", False)), data.get("status") or "needs_review", bool(data.get("user_confirmed", False)))).fetchone()
    elif table == "roof_opening":
        geometry = data.get("geometry") or {"points": data.get("points") or []}
        with transaction() as conn:
            row = conn.execute("""INSERT INTO roof_opening(project_id,level_id,plane_id,opening_type,name,geometry,deduct_from_area,status,user_confirmed)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""", (str(project_id), str(level_id), data.get("plane_id"), data.get("opening_type") or "other", data.get("name"), Jsonb(geometry), bool(data.get("deduct_from_area", True)), data.get("status") or "needs_review", bool(data.get("user_confirmed", False)))).fetchone()
    else:
        geometry = data.get("geometry") or {"points": data.get("points") or []}
        with transaction() as conn:
            row = conn.execute("""INSERT INTO roof_component(project_id,level_id,plane_id,component_type,name,geometry,quantity,measurement_unit,nrm_work_section,status,user_confirmed)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""", (str(project_id), str(level_id), data.get("plane_id"), data.get("component_type") or "other", data.get("name"), Jsonb(geometry), data.get("quantity"), data.get("measurement_unit") or "nr", data.get("nrm_work_section"), data.get("status") or "needs_review", bool(data.get("user_confirmed", False)))).fetchone()
    _recalculate_level(str(level_id))
    return dict(row)


@router.post("/projects/{project_id}/roofs/levels/{level_id}/edges")
def create_edge(project_id: UUID, level_id: UUID, body: PatchBody): return {"edge": _create_simple(project_id, level_id, "roof_edge", body.model_dump(exclude_unset=True))}
@router.patch("/projects/{project_id}/roofs/levels/{level_id}/edges/{edge_id}")
def patch_edge(project_id: UUID, level_id: UUID, edge_id: UUID, body: PatchBody): return {"edge": update_roof_entity(str(project_id), "roof_edge", str(edge_id), body.model_dump(exclude_unset=True))}
@router.delete("/projects/{project_id}/roofs/levels/{level_id}/edges/{edge_id}")
def delete_edge(project_id: UUID, level_id: UUID, edge_id: UUID):
    with transaction() as conn: row = conn.execute("DELETE FROM roof_edge WHERE id=%s AND project_id=%s RETURNING id", (str(edge_id), str(project_id))).fetchone()
    if not row: raise HTTPException(404, "Roof edge not found")
    _recalculate_level(str(level_id)); return {"deleted": str(edge_id)}

@router.post("/projects/{project_id}/roofs/levels/{level_id}/openings")
def create_opening(project_id: UUID, level_id: UUID, body: PatchBody): return {"opening": _create_simple(project_id, level_id, "roof_opening", body.model_dump(exclude_unset=True))}
@router.patch("/projects/{project_id}/roofs/levels/{level_id}/openings/{opening_id}")
def patch_opening(project_id: UUID, level_id: UUID, opening_id: UUID, body: PatchBody): return {"opening": update_roof_entity(str(project_id), "roof_opening", str(opening_id), body.model_dump(exclude_unset=True))}
@router.delete("/projects/{project_id}/roofs/levels/{level_id}/openings/{opening_id}")
def delete_opening(project_id: UUID, level_id: UUID, opening_id: UUID):
    with transaction() as conn: row = conn.execute("DELETE FROM roof_opening WHERE id=%s AND project_id=%s RETURNING id", (str(opening_id), str(project_id))).fetchone()
    if not row: raise HTTPException(404, "Roof opening not found")
    _recalculate_level(str(level_id)); return {"deleted": str(opening_id)}

@router.post("/projects/{project_id}/roofs/levels/{level_id}/components")
def create_component(project_id: UUID, level_id: UUID, body: PatchBody): return {"component": _create_simple(project_id, level_id, "roof_component", body.model_dump(exclude_unset=True))}
@router.patch("/projects/{project_id}/roofs/levels/{level_id}/components/{component_id}")
def patch_component(project_id: UUID, level_id: UUID, component_id: UUID, body: PatchBody): return {"component": update_roof_entity(str(project_id), "roof_component", str(component_id), body.model_dump(exclude_unset=True))}
@router.delete("/projects/{project_id}/roofs/levels/{level_id}/components/{component_id}")
def delete_component(project_id: UUID, level_id: UUID, component_id: UUID):
    with transaction() as conn: row = conn.execute("DELETE FROM roof_component WHERE id=%s AND project_id=%s RETURNING id", (str(component_id), str(project_id))).fetchone()
    if not row: raise HTTPException(404, "Roof component not found")
    _recalculate_level(str(level_id)); return {"deleted": str(component_id)}


@router.post("/projects/{project_id}/roofs/recalculate")
def recalculate(project_id: UUID, body: RecalculateBody):
    level = fetch_one("SELECT id FROM roof_level WHERE id=%s AND project_id=%s", (body.level_id, str(project_id)))
    if not level: raise HTTPException(404, "Roof level not found")
    _recalculate_level(body.level_id)
    return {"status": "recalculated", "level_id": body.level_id}


@router.post("/projects/{project_id}/roofs/confirm")
def confirm(project_id: UUID, body: ConfirmBody):
    table = {"level": "roof_level", "plane": "roof_plane", "edge": "roof_edge", "opening": "roof_opening", "component": "roof_component"}.get(body.entity_type)
    if not table: raise HTTPException(422, "Unsupported roof entity_type")
    with transaction() as conn:
        for entity_id in body.entity_ids:
            conn.execute(f"UPDATE {table} SET status='confirmed',user_confirmed=true,updated_at=now() WHERE id=%s AND project_id=%s", (entity_id, str(project_id)))
    for row in fetch_all("SELECT id FROM roof_level WHERE project_id=%s", (str(project_id),)): _recalculate_level(str(row["id"]))
    return {"confirmed": body.entity_ids}


@router.get("/projects/{project_id}/takeoff/roof-quantities")
def roof_quantities(project_id: UUID):
    return {"items": fetch_all("SELECT * FROM roof_quantity WHERE project_id=%s ORDER BY work_section,description", (str(project_id),))}


@router.get("/projects/{project_id}/takeoff/roof-review")
def roof_review(project_id: UUID):
    return {"items": fetch_all("SELECT * FROM roof_review_item WHERE project_id=%s ORDER BY resolved,severity DESC,created_at", (str(project_id),))}
