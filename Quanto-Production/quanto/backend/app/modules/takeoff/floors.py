from __future__ import annotations

import hashlib
import json
import math
import re
import threading
import traceback
from pathlib import Path
from typing import Any
from uuid import UUID

from shapely.geometry import Point as ShapelyPoint, Polygon, MultiPolygon
from shapely.ops import unary_union

from ...database.json_value import Jsonb

from ...database.connection import fetch_all, fetch_one, transaction
from ...services.storage.paths import project_root
from ...services.ai.codex_account import codex_account_status
from .harness.model_client import HarnessModelClient
from .harness.evaluator import evaluate_element
from .harness.facts import publish_element_facts
from .harness.runtime import run_element_harness
from .harness.derived import recalculate_skirting_opening_deductions
from .floor_wall_geometry import audit_and_snap_floor_spaces, wall_audit_failures
from .common import (
    PALETTE,
    area_m2,
    content_hash,
    ensure_takeoff_floors,
    extract_viewport_text,
    floor_context,
    perimeter_m,
    project_text_evidence,
    require_frozen_project,
    viewport_demo_context,
)
from .model_schemas import FloorCatalogOutput, FloorGeometryOutput, FloorSpaceOut
from .prompts import (
    FLOOR_CATALOG_PROMPT,
    FLOOR_CATALOG_SYSTEM,
    FLOOR_GEOMETRY_PROMPT,
    FLOOR_SYSTEM,
)


FLOOR_PROVIDER = "codex-account"
FLOOR_MODEL_LABEL = "ChatGPT/Codex account"
FLOOR_CACHE_VERSION = "quanto-floor-account-cache-v3"
FLOOR_PROMPT_VERSION = "floor-account-v4"
_FLOOR_LOCKS: dict[str, threading.Lock] = {}
_FLOOR_LOCK_GUARD = threading.Lock()


def _floor_runtime_dir(project_id: UUID | str) -> Path:
    path = project_root(project_id) / "floors"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _floor_status_path(project_id: UUID | str) -> Path:
    return _floor_runtime_dir(project_id) / "status.json"


def _floor_cache_path(project_id: UUID | str, floor_id: UUID | str) -> Path:
    path = _floor_runtime_dir(project_id) / "results"
    path.mkdir(parents=True, exist_ok=True)
    return path / f"{floor_id}.json"


def _viewport_cache_path(project_id: UUID | str, viewport_id: UUID | str) -> Path:
    path = _floor_runtime_dir(project_id) / "viewport-results"
    path.mkdir(parents=True, exist_ok=True)
    return path / f"{viewport_id}.json"


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default
    except (OSError, json.JSONDecodeError):
        return default


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, indent=2, default=str), encoding="utf-8")
    tmp.replace(path)


def _set_floor_status(project_id: UUID | str, status: str, progress: int, message: str, **extra: Any) -> dict[str, Any]:
    payload = {"status": status, "progress": progress, "message": message, **extra}
    _write_json(_floor_status_path(project_id), payload)
    return payload


def _floor_lock(project_id: UUID | str) -> threading.Lock:
    pid = str(project_id)
    with _FLOOR_LOCK_GUARD:
        return _FLOOR_LOCKS.setdefault(pid, threading.Lock())


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _floor_source_hash(project: dict[str, Any], ctx: dict[str, Any]) -> str:
    crop_path = Path(ctx["crop_path"])
    payload = {
        "cache_version": FLOOR_CACHE_VERSION,
        "prompt_version": FLOOR_PROMPT_VERSION,
        "frame_version": project.get("frame_version"),
        "floor_id": str(ctx["id"]),
        "viewport_id": str(ctx["viewport_id"]),
        "crop_version": int(ctx.get("crop_version") or 0),
        "drawing_width": int(ctx["drawing_width"]),
        "drawing_height": int(ctx["drawing_height"]),
        "mm_per_pixel": float(ctx["mm_per_pixel"]) if ctx.get("mm_per_pixel") else None,
        "crop_sha256": _file_sha256(crop_path),
    }
    return content_hash(payload)


def _viewport_source_hash(project: dict[str, Any], ctx: dict[str, Any]) -> str:
    """Hash physical drawing evidence shared by every level using one typical viewport."""
    crop_path = Path(ctx["crop_path"])
    return content_hash({
        "cache_version": FLOOR_CACHE_VERSION,
        "prompt_version": FLOOR_PROMPT_VERSION,
        "frame_version": project.get("frame_version"),
        "viewport_id": str(ctx["viewport_id"]),
        "crop_version": int(ctx.get("crop_version") or 0),
        "drawing_width": int(ctx["drawing_width"]),
        "drawing_height": int(ctx["drawing_height"]),
        "mm_per_pixel": float(ctx["mm_per_pixel"]) if ctx.get("mm_per_pixel") else None,
        "crop_sha256": _file_sha256(crop_path),
    })


def _load_cached_detection(project_id: str, floor_id: str, source_hash: str) -> tuple[FloorGeometryOutput, FloorCatalogOutput] | None:
    payload = _read_json(_floor_cache_path(project_id, floor_id), {})
    if payload.get("schema_version") != FLOOR_CACHE_VERSION or payload.get("source_hash") != source_hash:
        return None
    try:
        return (
            FloorGeometryOutput.model_validate(payload.get("geometry") or {}),
            FloorCatalogOutput.model_validate(payload.get("catalog") or {}),
        )
    except Exception:
        return None


def _save_cached_detection(
    project_id: str,
    floor_id: str,
    source_hash: str,
    quality: str,
    geometry: FloorGeometryOutput,
    catalog: FloorCatalogOutput,
) -> None:
    _write_json(
        _floor_cache_path(project_id, floor_id),
        {
            "schema_version": FLOOR_CACHE_VERSION,
            "provider": FLOOR_PROVIDER,
            "source_hash": source_hash,
            "quality": quality,
            "geometry": geometry.model_dump(mode="json"),
            "catalog": catalog.model_dump(mode="json"),
        },
    )


def _load_viewport_detection(
    project_id: str, viewport_id: str, viewport_hash: str, quality: str,
) -> tuple[FloorGeometryOutput, FloorCatalogOutput, str] | None:
    payload = _read_json(_viewport_cache_path(project_id, viewport_id), {})
    quality_rank = {"easy": 0, "medium": 1, "expert": 2, "maximum": 3}
    if (
        payload.get("schema_version") != FLOOR_CACHE_VERSION
        or payload.get("viewport_hash") != viewport_hash
        or quality_rank.get(str(payload.get("quality") or "medium"), 1) < quality_rank.get(quality, 1)
    ):
        return None
    try:
        return (
            FloorGeometryOutput.model_validate(payload.get("geometry") or {}),
            FloorCatalogOutput.model_validate(payload.get("catalog") or {}),
            str(payload.get("source_floor_name") or ""),
        )
    except Exception:
        return None


def _save_viewport_detection(
    project_id: str,
    ctx: dict[str, Any],
    viewport_hash: str,
    quality: str,
    geometry: FloorGeometryOutput,
    catalog: FloorCatalogOutput,
) -> None:
    _write_json(
        _viewport_cache_path(project_id, ctx["viewport_id"]),
        {
            "schema_version": FLOOR_CACHE_VERSION,
            "provider": FLOOR_PROVIDER,
            "viewport_hash": viewport_hash,
            "quality": quality,
            "source_floor_name": str(ctx.get("name") or ""),
            "geometry": geometry.model_dump(mode="json"),
            "catalog": catalog.model_dump(mode="json"),
        },
    )


def _catalog_cache_path(project_id: UUID | str) -> Path:
    return _floor_runtime_dir(project_id) / "catalog.json"


def _load_catalog_cache(project_id: str, catalog_hash: str) -> FloorCatalogOutput | None:
    payload = _read_json(_catalog_cache_path(project_id), {})
    if payload.get("schema_version") != FLOOR_CACHE_VERSION or payload.get("catalog_hash") != catalog_hash:
        return None
    try:
        return FloorCatalogOutput.model_validate(payload.get("catalog") or {})
    except Exception:
        return None


def _save_catalog_cache(project_id: str, catalog_hash: str, quality: str, catalog: FloorCatalogOutput) -> None:
    _write_json(
        _catalog_cache_path(project_id),
        {
            "schema_version": FLOOR_CACHE_VERSION,
            "provider": FLOOR_PROVIDER,
            "catalog_hash": catalog_hash,
            "quality": quality,
            "catalog": catalog.model_dump(mode="json"),
        },
    )


def _shape(points: list[dict[str, float]], holes: list[list[dict[str, float]]] | None = None) -> Polygon:
    return Polygon([(p["x"], p["y"]) for p in points], [[(p["x"], p["y"]) for p in ring] for ring in (holes or [])])


def _subtract_non_floor_regions(output: FloorGeometryOutput) -> None:
    """Turn trusted non-floor overlaps into deterministic room deductions.

    Vision is responsible for identifying shafts/ducts/voids; polygon boolean
    arithmetic is code-owned. This avoids asking the model to reproduce the same
    boundary twice (once as an exclusion and once as a room hole).
    """
    exclusions: list[Polygon] = []
    for region in output.non_floor_regions:
        polygon = _shape([{"x": point.x, "y": point.y} for point in region.polygon])
        if not polygon.is_empty and polygon.is_valid and polygon.area > 1:
            exclusions.append(polygon)
    if not exclusions:
        return
    excluded_union = unary_union(exclusions)
    corrected_spaces = []
    corrections = 0
    for space in output.spaces:
        source = _shape(
            [{"x": point.x, "y": point.y} for point in space.polygon],
            [[{"x": point.x, "y": point.y} for point in ring] for ring in space.holes],
        )
        if source.is_empty or not source.is_valid:
            corrected_spaces.append(space)
            continue
        corrected = source.difference(excluded_union)
        if corrected.is_empty or abs(corrected.area - source.area) <= 4:
            corrected_spaces.append(space)
            continue
        components = [corrected] if isinstance(corrected, Polygon) else [
            item for item in getattr(corrected, "geoms", []) if isinstance(item, Polygon) and item.area > 1
        ]
        if not components:
            corrected_spaces.append(space)
            continue
        components.sort(key=lambda item: item.area, reverse=True)
        for part_index, component in enumerate(components, start=1):
            data = space.model_dump(mode="python")
            data["polygon"] = [
                {"x": float(x), "y": float(y)} for x, y in list(component.exterior.coords)[:-1]
            ]
            data["holes"] = [
                [{"x": float(x), "y": float(y)} for x, y in list(ring.coords)[:-1]]
                for ring in component.interiors
            ]
            if part_index > 1:
                base_name = str(data.get("name") or data.get("normalized_type") or "Floor space")
                data["name"] = f"{base_name} · Part {part_index}"
            corrected_spaces.append(space.__class__.model_validate(data))
        corrections += 1
    if corrections:
        output.spaces = corrected_spaces
        output.warnings.append(
            f"Code deducted confirmed non-floor shafts/ducts/voids from {corrections} overlapping floor space(s)."
        )


def _validate_floor_geometry(output: FloorGeometryOutput) -> None:
    peers: list[tuple[str, Polygon]] = []
    for index, space in enumerate(output.spaces, start=1):
        pts = [{"x": p.x, "y": p.y} for p in space.polygon]
        holes = [[{"x": p.x, "y": p.y} for p in ring] for ring in space.holes]
        for point in [*pts, *(p for ring in holes for p in ring)]:
            if not (0 <= point["x"] <= output.source_width_px and 0 <= point["y"] <= output.source_height_px):
                raise RuntimeError(f"Floor space {index} has coordinates outside the exact source crop")
        poly = _shape(pts, holes)
        if poly.is_empty or poly.area <= 1 or not poly.is_valid:
            raise RuntimeError(f"Floor space {index} is empty/self-intersecting or has invalid holes")
        for other_name, other in peers:
            overlap = poly.intersection(other).area
            if overlap > max(4.0, min(poly.area, other.area) * 0.005):
                raise RuntimeError(f"Floor spaces materially overlap ({other_name} and {index}); AI result rejected for review")
        peers.append((str(index), poly))
    for excluded in output.non_floor_regions:
        epts = [{"x": p.x, "y": p.y} for p in excluded.polygon]
        epoly = _shape(epts)
        for name, floor_poly in peers:
            overlap = epoly.intersection(floor_poly).area
            if overlap > max(4.0, epoly.area * 0.01):
                raise RuntimeError(
                    f"Non-floor region '{excluded.name}' overlaps FloorSpace {name}. Return it as a hole/exclusion; result rejected to prevent over-measurement."
                )


def _audit_room_label_coverage(output: FloorGeometryOutput, words: list[dict[str, Any]]) -> list[str]:
    """Report plan room labels not contained by a semantically matching space.

    Labels outside the detected building envelope are ignored because they are
    normally legends/notes. A TOI label inside a living-room polygon still fails:
    physical coverage alone is not enough when the room identity is wrong.
    """
    expected_types: dict[str, tuple[str, ...]] = {
        "bed": ("bed",), "bedroom": ("bed",),
        "toilet": ("toilet", "bath", "wc", "washroom"), "toi": ("toilet", "bath", "wc", "washroom"),
        "bath": ("toilet", "bath", "wc", "washroom"), "bathroom": ("toilet", "bath", "wc", "washroom"),
        "wc": ("toilet", "bath", "wc", "washroom"),
        "living": ("living", "open_plan"), "dining": ("dining", "open_plan"),
        "pantry": ("pantry", "kitchen", "open_plan"), "kitchen": ("pantry", "kitchen", "open_plan"),
        "bal": ("balcony",), "balcony": ("balcony",),
        "lobby": ("lobby",), "corridor": ("corridor", "passage"), "passage": ("corridor", "passage"),
        "store": ("store",), "gym": ("gym",), "gymnasium": ("gym",),
        "office": ("office", "management"), "management": ("office", "management"),
        "laundry": ("laundry", "utility"), "utility": ("laundry", "utility"),
    }
    spaces: list[tuple[Polygon, str]] = []
    for space in output.spaces:
        pts = [{"x": p.x, "y": p.y} for p in space.polygon]
        holes = [[{"x": p.x, "y": p.y} for p in ring] for ring in space.holes]
        try:
            spaces.append((_shape(pts, holes), str(space.normalized_type or "").lower().replace("-", "_")))
        except Exception:
            continue
    if not spaces:
        return ["No valid floor spaces were returned"]
    min_x = min(poly.bounds[0] for poly, _ in spaces)
    min_y = min(poly.bounds[1] for poly, _ in spaces)
    max_x = max(poly.bounds[2] for poly, _ in spaces)
    max_y = max(poly.bounds[3] for poly, _ in spaces)
    envelope_margin = max(12.0, min(max_x - min_x, max_y - min_y) * 0.025)
    missing: list[str] = []
    seen: set[tuple[str, int, int]] = set()
    for word in words:
        raw = str(word.get("text") or "").strip()
        token = re.sub(r"[^a-z]", "", raw.lower())
        bbox = word.get("bbox") or []
        if token not in expected_types or len(bbox) != 4:
            continue
        x = (float(bbox[0]) + float(bbox[2])) / 2.0
        y = (float(bbox[1]) + float(bbox[3])) / 2.0
        if x < min_x - envelope_margin or x > max_x + envelope_margin or y < min_y - envelope_margin or y > max_y + envelope_margin:
            continue
        key = (token, round(x), round(y))
        if key in seen:
            continue
        seen.add(key)
        point = ShapelyPoint(x, y)
        expected = expected_types[token]
        if not any(
            (poly.covers(point) or poly.distance(point) <= 3)
            and any(value in room_type for value in expected)
            for poly, room_type in spaces
        ):
            missing.append(f"{raw} near ({round(x)}, {round(y)}) must be inside a matching {'/'.join(expected)} space")
    return missing[:20]

def _points(value: Any) -> list[dict[str, float]]:
    if isinstance(value, dict):
        value = value.get("points") or value.get("polygon") or []
    result: list[dict[str, float]] = []
    for item in value or []:
        if isinstance(item, dict) and "x" in item and "y" in item:
            result.append({"x": float(item["x"]), "y": float(item["y"])})
    return result


def _geometry(points: list[dict[str, float]], deducts: list[list[dict[str, float]]] | None = None) -> dict[str, Any]:
    return {"points": points, "deducts": deducts or []}




def _polygon_components(geometry: Any) -> list[tuple[list[dict[str, float]], list[list[dict[str, float]]]]]:
    if geometry.is_empty:
        return []
    geoms = [geometry] if isinstance(geometry, Polygon) else list(geometry.geoms) if isinstance(geometry, MultiPolygon) else [g for g in getattr(geometry, "geoms", []) if isinstance(g, Polygon)]
    parts = []
    for poly in geoms:
        outer = [{"x": float(x), "y": float(y)} for x, y in list(poly.exterior.coords)[:-1]]
        holes = [[{"x": float(x), "y": float(y)} for x, y in list(ring.coords)[:-1]] for ring in poly.interiors]
        if len(outer) >= 3 and poly.area > 1:
            parts.append((outer, holes))
    return parts


def _net_area_m2(points: list[dict[str, float]], deducts: list[list[dict[str, float]]], mm_per_pixel: float | None) -> float | None:
    gross = area_m2(points, mm_per_pixel)
    if gross is None:
        return None
    deduction = sum((area_m2(ring, mm_per_pixel) or 0.0) for ring in deducts)
    return round(max(0.0, gross - deduction), 4)


def _source_text(evidence: Any) -> str:
    if not evidence:
        return ""
    if isinstance(evidence, str):
        return evidence
    if isinstance(evidence, list):
        for item in evidence:
            if isinstance(item, dict) and item.get("text"):
                return str(item["text"])
    return ""


def _normalize(value: str | None) -> str:
    text = re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()
    synonyms = {
        "toilet": "bathroom", "toilets": "bathroom", "wc": "bathroom", "washroom": "bathroom",
        "bed room": "bedroom", "bedrooms": "bedroom", "living room": "living", "dining room": "dining",
        "common corridor": "corridor", "common corridors": "corridor", "entrance lobby": "lobby",
        "lift lobby": "lobby", "apartment balcony": "balcony", "apartment balconies": "balcony",
        "roof terraces": "roof terrace", "parking driveway": "parking", "ground floor parking": "parking",
        "plant rooms": "plant room", "electrical room": "plant room", "panel room": "plant room",
        "stair landing": "stair", "stairs and landings": "stair",
    }
    return synonyms.get(text, text)


def _rule_matches(room_type: str, values: list[str]) -> bool:
    room = _normalize(room_type)
    for value in values:
        candidate = _normalize(value)
        if not candidate:
            continue
        if room == candidate or room in candidate or candidate in room:
            return True
    return False


def _start_run(project_id: str, floor_id: str | None, task: str, model: str | None, request_hash: str) -> str:
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO takeoff_analysis_run(project_id,floor_id,module,task_type,provider,model_id,
                   prompt_version,status,progress,message,request_hash)
               VALUES (%s,%s,'floor',%s,%s,%s,%s,'running',5,%s,%s) RETURNING id""",
            (project_id, floor_id, task, FLOOR_PROVIDER, model, FLOOR_PROMPT_VERSION, "Starting floor analysis", request_hash),
        ).fetchone()
    return str(row["id"])


def _finish_run(run_id: str, *, status: str, progress: int, message: str, result: Any = None, error: str | None = None) -> None:
    with transaction() as conn:
        conn.execute(
            """UPDATE takeoff_analysis_run SET status=%s,progress=%s,message=%s,result_json=%s,error_message=%s,
                   updated_at=now() WHERE id=%s""",
            (status, progress, message, Jsonb(result) if result is not None else None, error, run_id),
        )


def _upsert_catalog(project_id: str, catalog: FloorCatalogOutput) -> tuple[dict[str, str], dict[str, str]]:
    finish_ids: dict[str, str] = {}
    work_ids: dict[str, str] = {}
    with transaction() as conn:
        for index, definition in enumerate(catalog.finish_definitions):
            code = definition.code.strip()
            row = conn.execute(
                """INSERT INTO finish_definition(project_id,original_tag,name,description,material_category,material,
                       tile_width_mm,tile_length_mm,thickness_mm,surface_finish,bedding,internal_external,
                       default_waste_percent,display_colour,source_evidence,confidence,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
                   ON CONFLICT(project_id,original_tag) DO UPDATE SET name=excluded.name,description=excluded.description,
                       material_category=excluded.material_category,material=excluded.material,tile_width_mm=excluded.tile_width_mm,
                       tile_length_mm=excluded.tile_length_mm,thickness_mm=excluded.thickness_mm,surface_finish=excluded.surface_finish,
                       bedding=excluded.bedding,internal_external=excluded.internal_external,default_waste_percent=excluded.default_waste_percent,
                       source_evidence=excluded.source_evidence,confidence=excluded.confidence,updated_at=now()
                   RETURNING id""",
                (project_id, code, definition.name, definition.description, definition.material_category,
                 definition.material, definition.tile_width_mm, definition.tile_length_mm, definition.thickness_mm,
                 definition.surface_finish, definition.bedding, definition.internal_external, definition.waste_percent,
                 PALETTE[index % len(PALETTE)], Jsonb([{"kind": "specification", "text": definition.source_text}]),
                 definition.confidence),
            ).fetchone()
            finish_ids[code.lower()] = str(row["id"])

        # Floor-work codes are not guaranteed unique in the source. Replace prior AI-derived active definitions.
        conn.execute("DELETE FROM floor_work_definition WHERE project_id=%s AND status='ai_catalog'", (project_id,))
        for index, definition in enumerate(catalog.work_definitions):
            row = conn.execute(
                """INSERT INTO floor_work_definition(project_id,code,work_type,name,description,material,thickness_mm,
                       layer_count,height_mm,nrm_item,measurement_unit,measurement_basis,display_colour,source_evidence,
                       confidence,status)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'ai_catalog') RETURNING id""",
                (project_id, definition.code, definition.work_type, definition.name, definition.description,
                 definition.material, definition.thickness_mm, definition.layer_count, definition.height_mm,
                 "Skirting" if definition.work_type == "skirting" else definition.name,
                 "m" if definition.work_type == "skirting" else "m²",
                 "length" if definition.work_type == "skirting" else "area",
                 PALETTE[(index + 5) % len(PALETTE)],
                 Jsonb([{"kind": "specification", "text": definition.source_text}]), definition.confidence),
            ).fetchone()
            key = (definition.code or definition.work_type).strip().lower()
            work_ids[key] = str(row["id"])
            work_ids.setdefault(definition.work_type, str(row["id"]))
        fallback = conn.execute(
            """INSERT INTO finish_definition(project_id,original_tag,name,description,material_category,display_colour,
                   source_evidence,confidence,status)
               VALUES (%s,'UNASSIGNED-FLOOR','Unassigned floor finish — review required',
                       'No supported finish evidence has been confirmed yet','unassigned','#64748b','[]'::jsonb,0,'active')
               ON CONFLICT(project_id,original_tag) DO UPDATE SET updated_at=now() RETURNING id""",
            (project_id,),
        ).fetchone()
        finish_ids["unassigned"] = str(fallback["id"])
    return finish_ids, work_ids


def _resolve_finish(space: Any, catalog: FloorCatalogOutput, finish_ids: dict[str, str]) -> tuple[str | None, str, float, list[dict[str, Any]]]:
    evidence: list[dict[str, Any]] = []
    direct = getattr(getattr(space, "finish_evidence", None), "code", None)
    if direct and direct.lower() in finish_ids:
        fe = space.finish_evidence
        evidence = [item.model_dump() for item in (fe.evidence if fe else [])]
        return finish_ids[direct.lower()], "drawing_tag", 0.98, evidence
    for rule in catalog.room_finish_rules:
        if _rule_matches(space.normalized_type, rule.room_types) and rule.finish_code.lower() in finish_ids:
            return finish_ids[rule.finish_code.lower()], "spec_room_rule", rule.confidence, [
                {"kind": "specification_rule", "text": rule.source_text, "confidence": rule.confidence}
            ]
    return finish_ids.get("unassigned"), "unassigned", 0.0, evidence


def _resolve_work(space: Any, finish_code: str | None, catalog: FloorCatalogOutput) -> list[Any]:
    matched = []
    for rule in catalog.work_rules:
        room_match = not rule.room_types or _rule_matches(space.normalized_type, rule.room_types)
        finish_match = not rule.finish_codes or (finish_code and any(finish_code.lower() == x.lower() for x in rule.finish_codes))
        if room_match and finish_match and rule.required:
            matched.append(rule)
    return matched


def _insert_spaces(project_id: str, floor: dict[str, Any], geometry: FloorGeometryOutput, catalog: FloorCatalogOutput,
                   finish_ids: dict[str, str], work_ids: dict[str, str], analysis_model_id: str | None,
                   wall_audits: list[dict[str, Any]] | None = None) -> None:
    mmpp = float(floor["mm_per_pixel"]) if floor.get("mm_per_pixel") else None
    with transaction() as conn:
        confirmed = conn.execute("SELECT count(*) AS n FROM floor_space WHERE floor_id=%s AND user_confirmed=true", (str(floor["id"]),)).fetchone()["n"]
        if confirmed:
            raise RuntimeError("This floor contains user-confirmed geometry. Clear/replace it explicitly before rerunning AI so confirmed work is never overwritten.")
        conn.execute("DELETE FROM floor_space WHERE floor_id=%s", (str(floor["id"]),))
        conn.execute("DELETE FROM floor_region WHERE floor_id=%s", (str(floor["id"]),))

        for idx, space in enumerate(geometry.spaces, start=1):
            wall_audit = wall_audits[idx - 1] if wall_audits and idx <= len(wall_audits) else None
            geometry_status = str((wall_audit or {}).get("status") or "boundary_review")
            pts = [{"x": p.x, "y": p.y} for p in space.polygon]
            holes = [[{"x": p.x, "y": p.y} for p in ring] for ring in space.holes]
            outer_area = area_m2(pts, mmpp)
            excluded_area = sum((area_m2(ring, mmpp) or 0.0) for ring in holes)
            gross = round(max(0.0, (outer_area or 0.0) - excluded_area), 4) if outer_area is not None else None
            perim = perimeter_m(pts, mmpp)
            friendly = f"{int(floor['level_index']):02d}-{idx:03d}"
            source_evidence = [item.model_dump() for item in space.evidence]
            if wall_audit:
                source_evidence.append({
                    "kind": "pdf_wall_vectors",
                    "text": " ".join(wall_audit.get("reasons") or []) or "Boundary supported by PDF wall vectors.",
                    "confidence": wall_audit.get("support_ratio", 0.0),
                    "support_ratio": wall_audit.get("support_ratio", 0.0),
                    "wall_overlap_ratio": wall_audit.get("wall_overlap_ratio", 0.0),
                    "snapped_edges": wall_audit.get("snapped_edges", 0),
                })
            row = conn.execute(
                """INSERT INTO floor_space(project_id,floor_id,friendly_number,name,raw_label,room_type,environment,
                       space_kind,geometry,generated_geometry,source_evidence,area_m2,perimeter_m,confidence,include_in_boq,status,
                       geometry_status,open_plan,user_confirmed)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,false,'needs_review',%s,%s,false) RETURNING id""",
                (project_id, str(floor["id"]), friendly, space.name or space.raw_label or space.normalized_type,
                 space.raw_label, space.normalized_type, space.environment, "external" if space.environment != "internal" else "internal",
                 Jsonb(_geometry(pts, holes)), Jsonb(_geometry(pts, holes)), Jsonb(source_evidence), gross, perim,
                 min(space.geometry_confidence, space.semantic_confidence), geometry_status, bool(space.functional_zones)),
            ).fetchone()
            room_id = str(row["id"])
            conn.execute(
                "INSERT INTO floor_space_revision(room_id,revision,action,geometry,metadata) VALUES (%s,1,'ai_detected',%s,%s)",
                (room_id, Jsonb(_geometry(pts, holes)), Jsonb({"raw_label": space.raw_label, "room_type": space.normalized_type})),
            )
            zone = conn.execute(
                """INSERT INTO finish_zone(project_id,floor_id,room_id,friendly_number,name,geometry,gross_area_m2,excluded_area_m2,net_area_m2,status)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'needs_review') RETURNING id""",
                (project_id, str(floor["id"]), room_id, f"FZ-{friendly}", space.name or space.raw_label,
                 Jsonb(_geometry(pts, holes)), outer_area, excluded_area, gross),
            ).fetchone()
            finish_id, method, confidence, assign_evidence = _resolve_finish(space, catalog, finish_ids)
            finish_code = None
            if finish_id:
                def_row = conn.execute("SELECT original_tag FROM finish_definition WHERE id=%s", (finish_id,)).fetchone()
                finish_code = def_row["original_tag"] if def_row else None
            status = "unassigned" if method == "unassigned" else "suggested"
            waste = 0.0
            if finish_id:
                def_row = conn.execute("SELECT default_waste_percent FROM finish_definition WHERE id=%s", (finish_id,)).fetchone()
                waste = float(def_row["default_waste_percent"] or 0)
            parent_assignment = conn.execute(
                """INSERT INTO finish_assignment(project_id,floor_id,room_id,zone_id,finish_id,target_key,status,
                       assignment_method,confidence,gross_area_m2,excluded_area_m2,net_area_m2,waste_percent,order_area_m2,nrm_quantity,
                       review_required,user_confirmed,source_evidence)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true,false,%s) RETURNING id""",
                (project_id, str(floor["id"]), room_id, str(zone["id"]), finish_id, f"finish-zone:{zone['id']}", status,
                 method, confidence, outer_area, excluded_area, gross, waste, (gross * (1 + waste / 100.0)) if gross is not None else None,
                 gross, Jsonb(assign_evidence)),
            ).fetchone()

            # A physically open room may contain explicit finish sub-zones (for example a
            # kitchen finish inside Living/Dining). Keep one FloorSpace, but split FinishZones.
            # Child polygons are deducted from the parent finish so official quantities never double-count.
            child_rings: list[list[dict[str, float]]] = []
            child_area_total = 0.0
            for fidx, functional in enumerate(space.functional_zones, start=1):
                if not functional.polygon or not functional.finish_code:
                    continue
                child_finish_id = finish_ids.get(functional.finish_code.lower())
                if not child_finish_id or child_finish_id == finish_id:
                    continue
                child_pts = [{"x": p.x, "y": p.y} for p in functional.polygon]
                child_area = area_m2(child_pts, mmpp)
                if len(child_pts) < 3 or child_area is None or child_area <= 0:
                    continue
                child_rings.append(child_pts)
                child_area_total += child_area
                child_zone = conn.execute(
                    """INSERT INTO finish_zone(project_id,floor_id,room_id,friendly_number,name,geometry,gross_area_m2,net_area_m2,status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'needs_review') RETURNING id""",
                    (project_id, str(floor["id"]), room_id, f"FZ-{friendly}-{fidx:02d}", functional.name,
                     Jsonb(_geometry(child_pts)), child_area, child_area),
                ).fetchone()
                child_def = conn.execute("SELECT default_waste_percent FROM finish_definition WHERE id=%s", (child_finish_id,)).fetchone()
                child_waste = float(child_def["default_waste_percent"] or 0) if child_def else 0.0
                conn.execute(
                    """INSERT INTO finish_assignment(project_id,floor_id,room_id,zone_id,finish_id,target_key,status,assignment_method,
                           confidence,gross_area_m2,net_area_m2,waste_percent,order_area_m2,nrm_quantity,review_required,user_confirmed,source_evidence)
                       VALUES (%s,%s,%s,%s,%s,%s,'suggested','drawing_functional_zone',0.98,%s,%s,%s,%s,%s,true,false,%s)""",
                    (project_id, str(floor["id"]), room_id, str(child_zone["id"]), child_finish_id, f"finish-zone:{child_zone['id']}",
                     child_area, child_area, child_waste, child_area * (1 + child_waste / 100.0), child_area,
                     Jsonb([e.model_dump() for e in functional.evidence])),
                )
            if child_rings and outer_area is not None:
                total_excluded = excluded_area + child_area_total
                parent_net = round(max(0.0, outer_area - total_excluded), 4)
                conn.execute(
                    "UPDATE finish_zone SET geometry=%s,excluded_area_m2=%s,net_area_m2=%s WHERE id=%s",
                    (Jsonb(_geometry(pts, holes + child_rings)), total_excluded, parent_net, str(zone["id"])),
                )
                conn.execute(
                    """UPDATE finish_assignment SET excluded_area_m2=%s,net_area_m2=%s,nrm_quantity=%s,
                           order_area_m2=%s WHERE id=%s""",
                    (total_excluded, parent_net, parent_net, parent_net * (1 + waste / 100.0), str(parent_assignment["id"])),
                )

            for rule in _resolve_work(space, finish_code, catalog):
                def_id = work_ids.get((rule.definition_code or "").lower()) or work_ids.get(rule.work_type)
                measurement_basis = "length" if rule.work_type == "skirting" else "area"
                qty = perim if measurement_basis == "length" else gross
                work_zone = conn.execute(
                    """INSERT INTO floor_work_zone(project_id,floor_id,room_id,work_type,name,geometry,gross_area_m2,net_area_m2,status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'needs_review') RETURNING id""",
                    (project_id, str(floor["id"]), room_id, rule.work_type, rule.work_type.replace("_", " ").title(),
                     Jsonb(_geometry(pts, holes)), gross, gross),
                ).fetchone()
                conn.execute(
                    """INSERT INTO floor_work_assignment(project_id,floor_id,room_id,zone_id,work_type,definition_id,target_key,
                           coverage_type,measurement_basis,gross_quantity,nrm_quantity,measurement_unit,status,assignment_method,
                           confidence,review_required,user_confirmed,upturn_required,upturn_height_mm,source_evidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,'whole_room',%s,%s,%s,%s,'suggested','spec_rule',%s,true,false,%s,%s,%s)""",
                    (project_id, str(floor["id"]), room_id, str(work_zone["id"]), rule.work_type, def_id,
                     f"work:{rule.work_type}:{room_id}", measurement_basis, qty, qty,
                     "m" if measurement_basis == "length" else "m²", rule.confidence,
                     bool(rule.upturn_height_mm), rule.upturn_height_mm,
                     Jsonb([{"kind": "specification_rule", "text": rule.source_text, "confidence": rule.confidence}])),
                )
                if rule.work_type == "skirting" and mmpp:
                    for edge_index in range(len(pts)):
                        a = pts[edge_index]
                        b = pts[(edge_index + 1) % len(pts)]
                        length = math.hypot(b["x"] - a["x"], b["y"] - a["y"]) * mmpp / 1000.0
                        conn.execute(
                            """INSERT INTO skirting_edge(room_id,edge_index,point_a,point_b,length_m,edge_type,reason,user_confirmed)
                               VALUES (%s,%s,%s,%s,%s,'skirting','AI/spec rule; review door openings and non-skirting interfaces',false)""",
                            (room_id, edge_index, Jsonb(a), Jsonb(b), round(length, 4)),
                        )

        # Connector strips through wall/door openings are real floor and must not be lost
        # between adjacent room polygons. Remove any overlap with measured FloorSpaces first,
        # so a model that slightly overlaps a doorway cannot double-count floor area.
        room_shapes = []
        for source_space in geometry.spaces:
            source_pts = [{"x": p.x, "y": p.y} for p in source_space.polygon]
            source_holes = [[{"x": p.x, "y": p.y} for p in ring] for ring in source_space.holes]
            try:
                room_shapes.append(_shape(source_pts, source_holes))
            except Exception:
                pass
        measured_union = unary_union(room_shapes) if room_shapes else None
        connector_counter = len(geometry.spaces)
        for region in geometry.connector_regions:
            source_pts = [{"x": p.x, "y": p.y} for p in region.polygon]
            if len(source_pts) < 3:
                continue
            connector_shape = _shape(source_pts)
            remaining = connector_shape.difference(measured_union) if measured_union is not None else connector_shape
            for cpts, choles in _polygon_components(remaining):
                cnet = _net_area_m2(cpts, choles, mmpp)
                if not cnet or cnet <= 0:
                    continue
                connector_counter += 1
                friendly = f"{int(floor['level_index']):02d}-C{connector_counter:03d}"
                room = conn.execute(
                    """INSERT INTO floor_space(project_id,floor_id,friendly_number,name,raw_label,room_type,environment,space_kind,
                           geometry,generated_geometry,source_evidence,area_m2,perimeter_m,confidence,include_in_boq,status,geometry_status,user_confirmed)
                       VALUES (%s,%s,%s,%s,%s,'connector','internal','connector',%s,%s,%s,%s,%s,%s,false,'needs_review','detected',false) RETURNING id""",
                    (project_id, str(floor["id"]), friendly, region.name or "Door / opening floor strip", region.name,
                     Jsonb(_geometry(cpts, choles)), Jsonb(_geometry(cpts, choles)), Jsonb([e.model_dump() for e in region.evidence]),
                     cnet, perimeter_m(cpts, mmpp), region.confidence),
                ).fetchone()
                room_id = str(room["id"])
                outer = area_m2(cpts, mmpp)
                excluded = sum((area_m2(ring, mmpp) or 0.0) for ring in choles)
                zone = conn.execute(
                    """INSERT INTO finish_zone(project_id,floor_id,room_id,friendly_number,name,geometry,gross_area_m2,excluded_area_m2,net_area_m2,status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'needs_review') RETURNING id""",
                    (project_id, str(floor["id"]), room_id, f"FZ-{friendly}", region.name or "Opening strip",
                     Jsonb(_geometry(cpts, choles)), outer, excluded, cnet),
                ).fetchone()
                fallback = finish_ids.get("unassigned")
                conn.execute(
                    """INSERT INTO finish_assignment(project_id,floor_id,room_id,zone_id,finish_id,target_key,status,assignment_method,
                           confidence,gross_area_m2,excluded_area_m2,net_area_m2,nrm_quantity,review_required,user_confirmed,source_evidence)
                       VALUES (%s,%s,%s,%s,%s,%s,'unassigned','connector_review',%s,%s,%s,%s,%s,true,false,%s)""",
                    (project_id, str(floor["id"]), room_id, str(zone["id"]), fallback, f"finish-zone:{zone['id']}",
                     region.confidence, outer, excluded, cnet, cnet,
                     Jsonb([{"kind": "connector", "text": region.name, "confidence": region.confidence}])),
                )

        for kind, regions in (
            ("connector", geometry.connector_regions), ("special", geometry.special_regions),
            ("non_floor", geometry.non_floor_regions), ("obstruction", geometry.obstructions),
        ):
            for region in regions:
                pts = [{"x": p.x, "y": p.y} for p in region.polygon]
                conn.execute(
                    """INSERT INTO floor_region(project_id,floor_id,region_kind,name,geometry,area_m2,classification,evidence,confidence,status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,'needs_review')""",
                    (project_id, str(floor["id"]), kind, region.name, Jsonb(_geometry(pts)), area_m2(pts, mmpp),
                     region.classification, Jsonb([x.model_dump() for x in region.evidence]), region.confidence),
                )
        conn.execute(
            "UPDATE takeoff_floor SET analysis_status='floor_ready',analysis_model_id=%s,room_version=room_version+1,finish_version=finish_version+1,updated_at=now() WHERE id=%s",
            (analysis_model_id, str(floor["id"])),
        )

    # Openings may already exist when a Floor is reprojected from cache. Recalculate
    # only the derived skirting quantity; the detected FloorSpace geometry remains unchanged.
    try:
        recalculate_skirting_opening_deductions(project_id, str(floor["id"]))
    except Exception:
        # The opening tables may not exist on a database that has not applied later migrations yet.
        # Floor detection itself must remain usable; the cross-element derivation will run again
        # after the Doors & Windows harness publishes its facts.
        pass


def audit_saved_floor_boundaries(project_id: UUID | str, floor_id: UUID | str | None = None) -> dict[str, Any]:
    """Grade already-saved rooms without silently changing their geometry.

    This is used when a project predates the wall-conformity gate. Verified
    human geometry stays verified. All other rooms receive fresh vector evidence;
    unsafe rooms are unconfirmed across finishes and derived floor work.
    """
    pid = str(project_id)
    params: tuple[Any, ...] = (pid, str(floor_id)) if floor_id else (pid,)
    floor_rows = fetch_all(
        "SELECT id FROM takeoff_floor WHERE project_id=%s" + (" AND id=%s" if floor_id else "") + " ORDER BY level_index",
        params,
    )
    summary = {"floors": 0, "rooms": 0, "wall_verified": 0, "boundary_review": 0}
    for floor_row in floor_rows:
        ctx = floor_context(str(floor_row["id"]))
        room_rows = fetch_all(
            """SELECT id,name,raw_label,room_type,environment,geometry,source_evidence,confidence,geometry_status
               FROM floor_space
               WHERE floor_id=%s AND excluded=false AND space_kind<>'connector'
               ORDER BY friendly_number""",
            (str(floor_row["id"]),),
        )
        spaces: list[FloorSpaceOut] = []
        audited_rows: list[dict[str, Any]] = []
        for room in room_rows:
            geometry = room.get("geometry") or {}
            points = _points(geometry)
            holes = geometry.get("deducts") or geometry.get("holes") or [] if isinstance(geometry, dict) else []
            if len(points) < 3:
                continue
            spaces.append(FloorSpaceOut.model_validate({
                "raw_label": room.get("raw_label"),
                "name": room.get("name"),
                "normalized_type": room.get("room_type") or "unclassified",
                "environment": room.get("environment") if room.get("environment") in {"internal", "external", "semi_external"} else "internal",
                "polygon": points,
                "holes": holes,
                "evidence": [],
                "geometry_confidence": min(1.0, max(0.0, float(room.get("confidence") or 0))),
                "semantic_confidence": min(1.0, max(0.0, float(room.get("confidence") or 0))),
            }))
            audited_rows.append(room)
        if not spaces:
            continue
        output = FloorGeometryOutput(
            source_width_px=int(ctx["drawing_width"]),
            source_height_px=int(ctx["drawing_height"]),
            floor_label=str(ctx.get("name") or ""),
            spaces=spaces,
        )
        audits = audit_and_snap_floor_spaces(output, str(ctx["viewport_id"]), snap=False)
        with transaction() as conn:
            for room, audit in zip(audited_rows, audits, strict=True):
                if room.get("geometry_status") == "user_verified":
                    status = "user_verified"
                else:
                    status = str(audit["status"])
                evidence = [item for item in (room.get("source_evidence") or []) if item.get("kind") != "pdf_wall_vectors"]
                evidence.append({
                    "kind": "pdf_wall_vectors",
                    "text": " ".join(audit.get("reasons") or []) or "Boundary supported by PDF wall vectors.",
                    "confidence": audit.get("support_ratio", 0.0),
                    "support_ratio": audit.get("support_ratio", 0.0),
                    "wall_overlap_ratio": audit.get("wall_overlap_ratio", 0.0),
                })
                conn.execute(
                    "UPDATE floor_space SET geometry_status=%s,source_evidence=%s,updated_at=now() WHERE id=%s",
                    (status, Jsonb(evidence), str(room["id"])),
                )
                if status == "boundary_review":
                    conn.execute(
                        "UPDATE finish_assignment SET status='needs_review',review_required=true,user_confirmed=false,updated_at=now() WHERE room_id=%s",
                        (str(room["id"]),),
                    )
                    conn.execute(
                        "UPDATE floor_work_assignment SET status='needs_review',review_required=true,user_confirmed=false,updated_at=now() WHERE room_id=%s",
                        (str(room["id"]),),
                    )
                summary["rooms"] += 1
                summary["wall_verified" if status in {"wall_verified", "user_verified"} else "boundary_review"] += 1
        summary["floors"] += 1
    return summary


def analyze_floor(
    project_id: UUID | str,
    floor_id: UUID | str,
    quality: str = "medium",
    *,
    force: bool = False,
) -> dict[str, Any]:
    """Detect one floor using the signed-in ChatGPT/Codex account.

    The raw structured detection is cached in project storage before it is
    projected into PostgreSQL. Reopening the same unchanged project therefore
    never needs another model turn. Explicit force-runs are the only normal
    way to spend another model turn for the same source.
    """
    pid, fid = str(project_id), str(floor_id)
    project = require_frozen_project(pid)
    ctx = floor_context(fid)
    if str(ctx["project_id"]) != pid:
        raise ValueError("Floor does not belong to project")
    if not ctx.get("scale_verified") or not ctx.get("mm_per_pixel"):
        raise RuntimeError("Confirm the controlling plan scale in Pre before Floor analysis.")

    source_hash = _floor_source_hash(project, ctx)
    viewport_hash = _viewport_source_hash(project, ctx)
    existing = fetch_one("SELECT count(*) AS n FROM floor_space WHERE floor_id=%s", (fid,))
    existing_count = int(existing["n"]) if existing else 0
    if existing_count > 0 and not force:
        boundary_audit = audit_saved_floor_boundaries(pid, fid)
        saved = _load_cached_detection(pid, fid, source_hash)
        if saved is not None:
            saved_geometry, saved_catalog = saved
            _subtract_non_floor_regions(saved_geometry)
            _validate_floor_geometry(saved_geometry)
            _save_viewport_detection(pid, ctx, viewport_hash, quality, saved_geometry, saved_catalog)
        return {
            "spaces": existing_count,
            "skipped": True,
            "cached": True,
            "reason": "saved floor geometry",
            "source_hash": source_hash,
            "boundary_audit": boundary_audit,
        }

    if force:
        confirmed = fetch_one(
            "SELECT count(*) AS n FROM floor_space WHERE floor_id=%s AND user_confirmed=true",
            (fid,),
        )
        if confirmed and int(confirmed["n"]) > 0:
            raise RuntimeError(
                "This floor contains user-confirmed geometry. Clear/replace it explicitly before rerunning detection so confirmed work is never overwritten."
            )

    cached = None if force else _load_cached_detection(pid, fid, source_hash)
    if cached is not None:
        geometry, catalog = cached
        _subtract_non_floor_regions(geometry)
        _validate_floor_geometry(geometry)
        wall_audits = audit_and_snap_floor_spaces(geometry, str(ctx["viewport_id"]))
        _validate_floor_geometry(geometry)
        finish_ids, work_ids = _upsert_catalog(pid, catalog)
        _insert_spaces(pid, ctx, geometry, catalog, finish_ids, work_ids, FLOOR_MODEL_LABEL, wall_audits)
        return {
            "spaces": len(geometry.spaces),
            "warnings": geometry.warnings + catalog.warnings,
            "questions": geometry.questions,
            "cached": True,
            "source_hash": source_hash,
        }

    # A single approved typical-plan viewport can represent several storeys.
    # Reuse the already validated physical geometry so identical walls produce
    # identical quantities on every represented level. Storey identity remains
    # attached by _insert_spaces through the target takeoff_floor record.
    shared = _load_viewport_detection(pid, str(ctx["viewport_id"]), viewport_hash, quality)
    if shared is not None:
        geometry, catalog, source_floor_name = shared
        geometry = geometry.model_copy(deep=True)
        geometry.floor_label = str(ctx.get("name") or geometry.floor_label or "")
        if source_floor_name and source_floor_name != str(ctx.get("name") or ""):
            target_name = str(ctx.get("name") or "this level")
            geometry.warnings = [warning.replace(source_floor_name, target_name) for warning in geometry.warnings]
            geometry.questions = [question.replace(source_floor_name, target_name) for question in geometry.questions]
        _subtract_non_floor_regions(geometry)
        _validate_floor_geometry(geometry)
        shared_missing = _audit_room_label_coverage(geometry, extract_viewport_text(ctx["viewport_id"]))
        if not shared_missing:
            wall_audits = audit_and_snap_floor_spaces(geometry, str(ctx["viewport_id"]))
            _validate_floor_geometry(geometry)
            geometry.warnings.append(
                f"Validated geometry was reused from the same approved typical-plan viewport for {ctx['name']}."
            )
            _save_cached_detection(pid, fid, source_hash, quality, geometry, catalog)
            finish_ids, work_ids = _upsert_catalog(pid, catalog)
            _insert_spaces(pid, ctx, geometry, catalog, finish_ids, work_ids, FLOOR_MODEL_LABEL, wall_audits)
            return {
                "spaces": len(geometry.spaces),
                "warnings": geometry.warnings + catalog.warnings,
                "questions": geometry.questions,
                "cached": True,
                "shared_viewport": True,
                "source_hash": source_hash,
            }

    auth = codex_account_status()
    if not auth.get("available"):
        raise RuntimeError(auth.get("error") or "Floor account detection is not installed")
    if not auth.get("authenticated"):
        raise RuntimeError("Connect a ChatGPT account in the Floor workspace before running detection.")

    run_id = _start_run(pid, fid, "geometry_and_finish", FLOOR_MODEL_LABEL, source_hash)
    try:
        model_client = HarnessModelClient("floor", pid)
        words = extract_viewport_text(ctx["viewport_id"])
        prompt = FLOOR_GEOMETRY_PROMPT.format(
            width=ctx["drawing_width"], height=ctx["drawing_height"], floor_name=ctx["name"],
            context="\n".join(f"{x['text']} @ {x['bbox']}" for x in words),
        )
        geometry = model_client.parse_image(
            ctx["crop_path"], prompt, FloorGeometryOutput,
            system=FLOOR_SYSTEM, quality=quality,
        )

        def validate_detected_geometry(candidate: FloorGeometryOutput) -> tuple[list[str], list[dict[str, Any]]]:
            if candidate.source_width_px != int(ctx["drawing_width"]) or candidate.source_height_px != int(ctx["drawing_height"]):
                raise RuntimeError(
                    f"AI coordinate space mismatch: returned {candidate.source_width_px}x{candidate.source_height_px}, "
                    f"expected {ctx['drawing_width']}x{ctx['drawing_height']}. The result was rejected rather than rescaled silently."
                )
            _subtract_non_floor_regions(candidate)
            _validate_floor_geometry(candidate)
            coverage_failures = _audit_room_label_coverage(candidate, words)
            wall_audits = audit_and_snap_floor_spaces(candidate, str(ctx["viewport_id"]))
            _validate_floor_geometry(candidate)
            return coverage_failures, wall_audits

        validation_failures: list[str]
        wall_audits: list[dict[str, Any]] = []
        try:
            coverage_failures, wall_audits = validate_detected_geometry(geometry)
            validation_failures = coverage_failures + wall_audit_failures(wall_audits)
        except RuntimeError as exc:
            validation_failures = [str(exc)]
        if validation_failures:
            repair_prompt = (
                prompt
                + "\n\nCORRECTION PASS — the previous result failed deterministic geometry and/or room-label validation.\n"
                + "Return a COMPLETE replacement result, not a patch. Fix every listed problem. All polygons and holes "
                  "must be simple, valid, non-self-intersecting rings. Redraw each listed room from its own enclosing "
                  "inner-wall loop and place every edge on the visible INNER FACE of the wall. Room polygons must never "
                  "cut across wall thickness or cross an unrelated partition. The matching label centre must be inside "
                  "its matching room polygon. Do not move or "
                  "rename labels, and do not use balcony/exterior strips as bathroom or bedroom geometry.\nFailures:\n- "
                + "\n- ".join(validation_failures)
                + "\n\nPrevious structured result (use only to locate what must be corrected):\n"
                + geometry.model_dump_json()
            )
            geometry = model_client.parse_image(
                ctx["crop_path"], repair_prompt, FloorGeometryOutput,
                system=FLOOR_SYSTEM, quality="expert",
            )
            try:
                remaining_coverage, wall_audits = validate_detected_geometry(geometry)
            except RuntimeError as exc:
                remaining_coverage = [str(exc)]
                wall_audits = []
            if remaining_coverage:
                raise RuntimeError(
                    "Floor detection was rejected because geometry or labelled rooms remained invalid after correction: "
                    + "; ".join(remaining_coverage)
                )
            geometry.warnings.append(
                "Room boundaries were automatically corrected after deterministic geometry and semantic-label validation."
            )
        wall_review_count = sum(audit.get("status") != "wall_verified" for audit in wall_audits)
        if wall_review_count:
            geometry.warnings.append(
                f"{wall_review_count} room boundary/boundaries remain below the PDF wall-vector confidence gate. "
                "They were saved for visible correction but are blocked from confirmation and BOQ."
            )

        specs = project_text_evidence(pid)
        catalog = FloorCatalogOutput()
        if specs.strip():
            catalog_hash = content_hash({
                "frame_version": project.get("frame_version"),
                "prompt_version": FLOOR_PROMPT_VERSION,
                "spec_sha256": hashlib.sha256(specs.encode("utf-8")).hexdigest(),
            })
            # Geometry may be intentionally re-run while the project specification
            # is unchanged. Reuse the project catalog in that case; its own hash
            # invalidates automatically when specification evidence changes.
            cached_catalog = _load_catalog_cache(pid, catalog_hash)
            if cached_catalog is not None:
                catalog = cached_catalog
            else:
                catalog = model_client.parse_text(
                    FLOOR_CATALOG_PROMPT.format(spec_text=specs), FloorCatalogOutput,
                    system=FLOOR_CATALOG_SYSTEM, quality=quality,
                )
                _save_catalog_cache(pid, catalog_hash, quality, catalog)

        # Save the expensive model result first. If DB projection is interrupted,
        # the same detection can be restored later without another account turn.
        _save_cached_detection(pid, fid, source_hash, quality, geometry, catalog)
        _save_viewport_detection(pid, ctx, viewport_hash, quality, geometry, catalog)

        finish_ids, work_ids = _upsert_catalog(pid, catalog)
        _insert_spaces(pid, ctx, geometry, catalog, finish_ids, work_ids, FLOOR_MODEL_LABEL, wall_audits)
        result = {
            "spaces": len(geometry.spaces),
            "warnings": geometry.warnings + catalog.warnings,
            "questions": geometry.questions,
            "cached": False,
            "source_hash": source_hash,
        }
        _finish_run(run_id, status="completed", progress=100, message="Floor analysis complete", result=result)
        return result
    except Exception as exc:
        _finish_run(run_id, status="failed", progress=100, message="Floor analysis failed", error=str(exc))
        with transaction() as conn:
            conn.execute("UPDATE takeoff_floor SET analysis_status='failed',updated_at=now() WHERE id=%s", (fid,))
        raise


def analyze_project_floors(
    project_id: UUID | str,
    quality: str = "medium",
    *,
    force: bool = False,
    progress_callback: Any | None = None,
) -> dict[str, Any]:
    from .scope.engine import get_scope

    pid = str(project_id)
    scope = get_scope(pid, "floor", auto_run=True)
    if scope.get("status") == "blocked":
        first = next((gap.get("message") for gap in scope.get("coverage_gaps", []) if gap.get("severity") == "blocked"), "Floor Scope is blocked")
        raise RuntimeError(f"Floor Scope is not ready: {first}")
    floors = ensure_takeoff_floors(pid)
    if not floors:
        raise RuntimeError("No Takeoff floors can be built. Complete Pre storeys/plans first.")
    if force:
        # A force run means fresh source interpretation. Remove only the derived
        # viewport AI caches before the first floor is processed. The first use
        # of each unique drawing is then detected afresh; later typical storeys
        # can reuse that newly validated result during this same project run.
        for viewport_id in {str(floor.get("viewport_id")) for floor in floors if floor.get("viewport_id")}:
            _viewport_cache_path(pid, viewport_id).unlink(missing_ok=True)
    results = []
    total = len(floors)
    for index, floor in enumerate(floors, start=1):
        if progress_callback:
            progress_callback(index, total, floor)
        results.append({
            "floor_id": str(floor["id"]),
            **analyze_floor(pid, floor["id"], quality, force=force),
        })
    return {"floors": results}


def _run_floor_analysis(project_id: str, quality: str, force: bool, *, lock_acquired: bool = False) -> None:
    lock = _floor_lock(project_id)
    if not lock_acquired and not lock.acquire(blocking=False):
        return
    try:
        _set_floor_status(project_id, "running", 3, "Preparing floor drawings")

        def progress(index: int, total: int, floor: dict[str, Any]) -> None:
            pct = 8 + int(((index - 1) / max(total, 1)) * 84)
            _set_floor_status(
                project_id, "running", pct,
                f"Detecting floor areas · {floor.get('name') or f'floor {index}'}",
                current=index, total=total, floor_id=str(floor.get("id") or ""),
            )

        result, _harness_report = run_element_harness(
            project_id, "floor", quality, force,
            lambda: analyze_project_floors(project_id, quality, force=force, progress_callback=progress),
            evaluate_element, publish_element_facts,
        )
        _set_floor_status(
            project_id, "completed", 100, "Floor analysis complete", result=result,
            harness_status=_harness_report.status,
            harness_issues=[
                {"code": issue.code, "message": issue.message, "severity": issue.severity, "entity_refs": list(issue.entity_refs)}
                for issue in _harness_report.issues
            ],
            harness_stats=_harness_report.stats,
        )
    except Exception as exc:  # noqa: BLE001
        _set_floor_status(
            project_id, "failed", 100, "Floor analysis failed",
            error_message=str(exc)[:1000], traceback=traceback.format_exc(limit=6),
        )
    finally:
        lock.release()


def start_floor_analysis(project_id: UUID | str, quality: str = "medium", *, force: bool = False) -> dict[str, Any]:
    pid = str(project_id)
    require_frozen_project(pid)
    auth = codex_account_status()
    if not auth.get("available"):
        raise RuntimeError(auth.get("error") or "Floor account detection is not installed")
    if not auth.get("authenticated"):
        raise RuntimeError("Connect a ChatGPT account in the Floor workspace before running detection.")
    if force:
        confirmed = fetch_one(
            "SELECT count(*) AS n FROM floor_space WHERE project_id=%s AND user_confirmed=true",
            (pid,),
        )
        if confirmed and int(confirmed["n"]) > 0:
            raise RuntimeError(
                "This project contains user-confirmed Floor geometry. Clear/replace it explicitly before rerunning detection so confirmed work is never overwritten."
            )

    lock = _floor_lock(pid)
    if not lock.acquire(blocking=False):
        return _read_json(
            _floor_status_path(pid),
            {"status": "running", "progress": 1, "message": "Preparing floor drawings"},
        )
    status = _set_floor_status(pid, "running", 1, "Preparing floor drawings")
    thread = threading.Thread(
        target=_run_floor_analysis,
        kwargs={"project_id": pid, "quality": quality, "force": force, "lock_acquired": True},
        daemon=True,
        name=f"floors-{pid[:8]}",
    )
    try:
        thread.start()
    except Exception:
        lock.release()
        raise
    return status


def floor_analysis_status(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    status = _read_json(_floor_status_path(pid), {})
    if status:
        if status.get("status") == "running" and not _floor_lock(pid).locked():
            return _set_floor_status(pid, "failed", int(status.get("progress") or 0), "Previous Floor run was interrupted. Retry will reuse saved/cached evidence.", error_message="interrupted", recoverable=True)
        return status
    run = fetch_one(
        "SELECT status,progress,message,error_message FROM takeoff_analysis_run "
        "WHERE project_id=%s AND module='floor' ORDER BY created_at DESC LIMIT 1",
        (pid,),
    )
    return run or {"status": "not_started", "progress": 0, "message": None, "error_message": None}


def _db_status(status: str | None) -> str:
    return "confirmed" if status == "confirmed" else "needs_review" if status in {"needs_review", "unassigned", "suggested"} else "ready"


def floor_demo_state(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    context = viewport_demo_context(pid)
    family_rows = fetch_all("SELECT * FROM finish_definition WHERE project_id=%s AND status<>'deleted' ORDER BY original_tag NULLS LAST,name", (pid,))
    families = [
        {
            "id": str(row["id"]), "kind": "floor", "mark": row.get("original_tag") or "F?",
            "description": row.get("description") or row["name"], "material": row.get("material") or row.get("material_category") or "",
            "thicknessMm": row.get("thickness_mm"), "screed": row.get("bedding") or "", "falls": "",
            "source": _source_text(row.get("source_evidence")) or "Project specification / user",
            "color": row.get("display_colour") or "#64748b",
        }
        for row in family_rows
    ]
    rows = fetch_all(
        """SELECT z.*,a.finish_id,a.status AS assignment_status,a.user_confirmed,s.name AS room_name,s.room_type,
                  f.viewport_id FROM finish_zone z
           JOIN floor_space s ON s.id=z.room_id JOIN takeoff_floor f ON f.id=z.floor_id
           LEFT JOIN finish_assignment a ON a.zone_id=z.id
           WHERE z.project_id=%s AND s.space_kind<>'connector'
           ORDER BY f.level_index,z.friendly_number""",
        (pid,),
    )
    zones = []
    for row in rows:
        geometry = row.get("geometry") or {}
        finish_id = str(row["finish_id"]) if row.get("finish_id") else (families[0]["id"] if families else "")
        if not finish_id:
            continue
        status = "confirmed" if row.get("user_confirmed") else _db_status(row.get("assignment_status") or row.get("status"))
        zones.append({
            "id": str(row["id"]), "kind": "floor", "familyId": finish_id, "floorId": str(row["floor_id"]),
            "viewportId": str(row["viewport_id"]), "points": _points(geometry), "deducts": geometry.get("deducts") or [],
            "room": row.get("room_name") or row.get("room_type") or row.get("name") or "Floor zone", "status": status,
        })
    region_rows = fetch_all(
        """SELECT r.*,f.viewport_id FROM floor_region r
           JOIN takeoff_floor f ON f.id=r.floor_id
           WHERE r.project_id=%s AND r.region_kind<>'connector'
           ORDER BY f.level_index,r.region_kind,r.name""",
        (pid,),
    )
    review_regions = [{
        "id": str(row["id"]),
        "kind": str(row["region_kind"]),
        "name": row.get("name") or str(row.get("classification") or "Review region").replace("_", " ").title(),
        "classification": row.get("classification") or row["region_kind"],
        "floorId": str(row["floor_id"]),
        "viewportId": str(row["viewport_id"]),
        "points": _points(row.get("geometry") or {}),
        "areaM2": float(row["area_m2"]) if row.get("area_m2") is not None else None,
        "confidence": float(row["confidence"]) if row.get("confidence") is not None else None,
    } for row in region_rows if len(_points(row.get("geometry") or {})) >= 3]
    ui = fetch_one("SELECT state_json FROM takeoff_ui_state WHERE project_id=%s AND module='floor'", (pid,))
    return {
        **context, "families": families, "zones": zones, "reviewRegions": review_regions,
        "uiState": (ui or {}).get("state_json") or {},
        "analysis": floor_analysis_status(pid),
        "provider": FLOOR_PROVIDER,
        "auth": codex_account_status(),
    }


def save_floor_demo_state(project_id: UUID | str, payload: dict[str, Any]) -> dict[str, Any]:
    """Persist edits made through the exact existing Quanto Dimension/Workbook UI."""
    pid = str(project_id)
    ensure_takeoff_floors(pid)
    families = payload.get("families") or []
    zones = payload.get("zones") or []
    id_map: dict[str, str] = {}
    with transaction() as conn:
        for index, family in enumerate(families):
            client_id = str(family.get("id") or "")
            mark = str(family.get("mark") or f"F-{index+1:02d}").strip()
            existing = None
            try:
                existing = conn.execute("SELECT id FROM finish_definition WHERE id=%s AND project_id=%s", (client_id, pid)).fetchone()
            except Exception:
                existing = None
            if existing:
                dbid = str(existing["id"])
                conn.execute(
                    """UPDATE finish_definition SET original_tag=%s,name=%s,description=%s,material=%s,thickness_mm=%s,
                           bedding=%s,display_colour=%s,source_evidence=%s,updated_at=now() WHERE id=%s""",
                    (mark, family.get("description") or mark, family.get("description"), family.get("material"),
                     family.get("thicknessMm"), family.get("screed"), family.get("color") or PALETTE[index % len(PALETTE)],
                     Jsonb([{"kind": "user", "text": family.get("source") or "Edited in Quanto"}]), dbid),
                )
            else:
                row = conn.execute(
                    """INSERT INTO finish_definition(project_id,original_tag,name,description,material,thickness_mm,bedding,
                           display_colour,source_evidence,confidence,status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,1,'active')
                       ON CONFLICT(project_id,original_tag) DO UPDATE SET name=excluded.name,description=excluded.description,
                           material=excluded.material,thickness_mm=excluded.thickness_mm,bedding=excluded.bedding,
                           display_colour=excluded.display_colour,source_evidence=excluded.source_evidence,updated_at=now()
                       RETURNING id""",
                    (pid, mark, family.get("description") or mark, family.get("description"), family.get("material"),
                     family.get("thicknessMm"), family.get("screed"), family.get("color") or PALETTE[index % len(PALETTE)],
                     Jsonb([{"kind": "user", "text": family.get("source") or "Edited in Quanto"}])),
                ).fetchone()
                dbid = str(row["id"])
            id_map[client_id] = dbid

        existing_zone_ids = {str(r["id"]) for r in conn.execute("SELECT id FROM finish_zone WHERE project_id=%s", (pid,)).fetchall()}
        incoming_db_ids: set[str] = set()
        for index, zone in enumerate(zones):
            client_zone_id = str(zone.get("id") or "")
            floor_id = str(zone.get("floorId") or "")
            floor = conn.execute("SELECT * FROM takeoff_floor WHERE id=%s AND project_id=%s", (floor_id, pid)).fetchone()
            if not floor:
                continue
            pts = _points(zone.get("points") or [])
            if len(pts) < 3:
                continue
            mmpp = float(floor["mm_per_pixel"]) if floor.get("mm_per_pixel") else None
            gross = area_m2(pts, mmpp)
            deducts = [[{"x": float(p["x"]), "y": float(p["y"])} for p in ring] for ring in (zone.get("deducts") or [])]
            deducted = sum((area_m2(ring, mmpp) or 0) for ring in deducts)
            net = round(max(0.0, (gross or 0) - deducted), 4) if gross is not None else None
            family_id = id_map.get(str(zone.get("familyId")), str(zone.get("familyId") or "")) or None
            room_name = str(zone.get("room") or "Floor zone")
            db_zone = None
            try:
                db_zone = conn.execute("SELECT z.*,s.id AS space_id FROM finish_zone z JOIN floor_space s ON s.id=z.room_id WHERE z.id=%s AND z.project_id=%s", (client_zone_id, pid)).fetchone()
            except Exception:
                db_zone = None
            if db_zone:
                zid, room_id = str(db_zone["id"]), str(db_zone["space_id"])
                sibling_count = conn.execute("SELECT count(*) AS n FROM finish_zone WHERE room_id=%s", (room_id,)).fetchone()["n"]
                # Finish zones may partition one physical FloorSpace. Only a one-zone room can
                # safely push its finish polygon back into the physical-space geometry.
                if int(sibling_count) == 1:
                    conn.execute(
                        """UPDATE floor_space SET name=%s,geometry=%s,area_m2=%s,perimeter_m=%s,status=%s,user_confirmed=%s,
                               geometry_version=geometry_version+1,updated_at=now() WHERE id=%s""",
                        (room_name, Jsonb(_geometry(pts, deducts)), net, perimeter_m(pts, mmpp),
                         "confirmed" if zone.get("status") == "confirmed" else "needs_review", zone.get("status") == "confirmed", room_id),
                    )
                else:
                    conn.execute("UPDATE floor_space SET name=COALESCE(name,%s),updated_at=now() WHERE id=%s", (room_name, room_id))
                conn.execute(
                    """UPDATE finish_zone SET name=%s,geometry=%s,gross_area_m2=%s,excluded_area_m2=%s,net_area_m2=%s,status=%s,updated_at=now() WHERE id=%s""",
                    (room_name, Jsonb(_geometry(pts, deducts)), gross, deducted, net,
                     "confirmed" if zone.get("status") == "confirmed" else "needs_review", zid),
                )
            else:
                friendly = f"M-{int(floor['level_index']):02d}-{index+1:03d}"
                room = conn.execute(
                    """INSERT INTO floor_space(project_id,floor_id,friendly_number,name,raw_label,room_type,environment,space_kind,
                           geometry,generated_geometry,source_evidence,area_m2,perimeter_m,confidence,status,user_confirmed,geometry_status)
                       VALUES (%s,%s,%s,%s,%s,'manual','internal','internal',%s,%s,%s,%s,%s,1,%s,%s,'user_edited') RETURNING id""",
                    (pid, floor_id, friendly, room_name, room_name, Jsonb(_geometry(pts, deducts)), Jsonb(_geometry(pts, deducts)),
                     Jsonb([{"kind": "user", "text": "Manually drawn in Quanto"}]), net, perimeter_m(pts, mmpp),
                     "confirmed" if zone.get("status") == "confirmed" else "needs_review", zone.get("status") == "confirmed"),
                ).fetchone()
                room_id = str(room["id"])
                zrow = conn.execute(
                    """INSERT INTO finish_zone(project_id,floor_id,room_id,friendly_number,name,geometry,gross_area_m2,excluded_area_m2,net_area_m2,status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (pid, floor_id, room_id, f"FZ-{friendly}", room_name, Jsonb(_geometry(pts, deducts)), gross, deducted, net,
                     "confirmed" if zone.get("status") == "confirmed" else "needs_review"),
                ).fetchone()
                zid = str(zrow["id"])
            incoming_db_ids.add(zid)
            assignment = conn.execute("SELECT id FROM finish_assignment WHERE zone_id=%s", (zid,)).fetchone()
            user_confirmed = zone.get("status") == "confirmed"
            if assignment:
                conn.execute(
                    """UPDATE finish_assignment SET finish_id=%s,status=%s,assignment_method='user',confidence=1,
                           gross_area_m2=%s,excluded_area_m2=%s,net_area_m2=%s,nrm_quantity=%s,review_required=%s,
                           user_confirmed=%s,updated_at=now() WHERE id=%s""",
                    (family_id, "confirmed" if user_confirmed else "suggested", gross, deducted, net, net,
                     not user_confirmed, user_confirmed, str(assignment["id"])),
                )
            else:
                conn.execute(
                    """INSERT INTO finish_assignment(project_id,floor_id,room_id,zone_id,finish_id,target_key,status,assignment_method,
                           confidence,gross_area_m2,excluded_area_m2,net_area_m2,nrm_quantity,review_required,user_confirmed,source_evidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,'user',1,%s,%s,%s,%s,%s,%s,%s)""",
                    (pid, floor_id, room_id, zid, family_id, f"finish-zone:{zid}", "confirmed" if user_confirmed else "suggested",
                     gross, deducted, net, net, not user_confirmed, user_confirmed,
                     Jsonb([{"kind": "user", "text": "Assigned in Quanto"}])),
                )

        # User deletion in the UI removes only non-confirmed zones automatically.
        for deleted in existing_zone_ids - incoming_db_ids:
            row = conn.execute("SELECT room_id,status FROM finish_zone WHERE id=%s", (deleted,)).fetchone()
            if row and row["status"] != "confirmed":
                siblings = conn.execute("SELECT count(*) AS n FROM finish_zone WHERE room_id=%s", (str(row["room_id"]),)).fetchone()["n"]
                if int(siblings) > 1:
                    conn.execute("DELETE FROM finish_zone WHERE id=%s", (deleted,))
                else:
                    conn.execute("DELETE FROM floor_space WHERE id=%s", (str(row["room_id"]),))

        # The demo UI edits finish zones, while Ceiling must consume confirmed physical
        # FloorSpaces. A room becomes confirmed only when every persisted finish zone
        # partitioning that physical space has been reviewed/confirmed by the user.
        conn.execute(
            """UPDATE floor_space s
               SET user_confirmed = NOT EXISTS (
                     SELECT 1 FROM finish_zone z WHERE z.room_id=s.id AND z.status<>'confirmed'
                   ),
                   status = CASE WHEN NOT EXISTS (
                     SELECT 1 FROM finish_zone z WHERE z.room_id=s.id AND z.status<>'confirmed'
                   ) THEN 'confirmed' ELSE 'needs_review' END,
                   updated_at=now()
               WHERE s.project_id=%s""",
            (pid,),
        )

        ui_state = payload.get("uiState") or {}
        conn.execute(
            """INSERT INTO takeoff_ui_state(project_id,module,state_json,updated_at) VALUES (%s,'floor',%s,now())
               ON CONFLICT(project_id,module) DO UPDATE SET state_json=excluded.state_json,updated_at=now()""",
            (pid, Jsonb(ui_state)),
        )
    return floor_demo_state(pid)
