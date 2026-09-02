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

from ...database.connection import fetch_all, fetch_one, transaction
from ...database.json_value import Jsonb
from ...services.ai.codex_account import CodexAccountModelClient, codex_account_status
from ...services.pdf.media import ensure_viewport_crop
from ...services.storage.paths import project_root
from .common import PALETTE, content_hash, ensure_takeoff_floors, extract_viewport_text, project_text_evidence, require_frozen_project, source_mm_per_pixel
from .model_schemas import ColumnCatalogOutput, ColumnGeometryOutput, ColumnVerticalOutput
from .prompts import COLUMN_CATALOG_PROMPT, COLUMN_CATALOG_SYSTEM, COLUMN_GEOMETRY_PROMPT, COLUMN_SYSTEM, COLUMN_VERTICAL_PROMPT, COLUMN_VERTICAL_SYSTEM

COLUMN_PROVIDER = "codex-account"
COLUMN_MODEL_LABEL = "ChatGPT/Codex account"
COLUMN_CACHE_VERSION = "quanto-columns-account-cache-v1"
COLUMN_PROMPT_VERSION = "columns-account-v1"
_LOCKS: dict[str, threading.Lock] = {}
_LOCK_GUARD = threading.Lock()


def _runtime_dir(project_id: UUID | str) -> Path:
    path = project_root(project_id) / "columns"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _status_path(project_id: UUID | str) -> Path:
    return _runtime_dir(project_id) / "status.json"


def _result_path(project_id: UUID | str, floor_id: UUID | str, viewport_id: UUID | str) -> Path:
    path = _runtime_dir(project_id) / "results"
    path.mkdir(parents=True, exist_ok=True)
    return path / f"{floor_id}-{viewport_id}.json"


def _catalog_path(project_id: UUID | str) -> Path:
    return _runtime_dir(project_id) / "catalog.json"


def _vertical_path(project_id: UUID | str, viewport_id: UUID | str) -> Path:
    path = _runtime_dir(project_id) / "vertical"
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


def _set_status(project_id: UUID | str, status: str, progress: int, message: str, **extra: Any) -> dict[str, Any]:
    payload = {"status": status, "progress": progress, "message": message, **extra}
    _write_json(_status_path(project_id), payload)
    return payload


def _lock(project_id: UUID | str) -> threading.Lock:
    pid = str(project_id)
    with _LOCK_GUARD:
        return _LOCKS.setdefault(pid, threading.Lock())


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _norm(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _safe_uuid(value: Any) -> str | None:
    try:
        return str(UUID(str(value)))
    except Exception:
        return None


def _typical_factor(value: str | None) -> int:
    match = re.search(r"(\d+)\s*[-–]\s*(\d+)", value or "")
    return max(1, int(match.group(2)) - int(match.group(1)) + 1) if match else 1


def _ensure_floor_identity(project_id: str, storey_id: str, viewport_id: str) -> dict[str, Any] | None:
    row = fetch_one("SELECT * FROM takeoff_floor WHERE project_id=%s AND storey_id=%s", (project_id, storey_id))
    if row:
        return row
    storey = fetch_one("SELECT * FROM storey WHERE id=%s AND project_id=%s", (storey_id, project_id))
    if not storey:
        return None
    try:
        _, ctx = ensure_viewport_crop(viewport_id)
    except Exception:
        return None
    mmpp, verified = source_mm_per_pixel(viewport_id)
    with transaction() as conn:
        created = conn.execute(
            """INSERT INTO takeoff_floor(project_id,storey_id,viewport_id,name,level_index,typical_factor,
                   drawing_width,drawing_height,mm_per_pixel,scale_verified,crop_version,updated_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
               ON CONFLICT(project_id,storey_id) DO UPDATE SET updated_at=now() RETURNING *""",
            (project_id, storey_id, viewport_id, storey["name"], storey["level_index"], _typical_factor(storey.get("typical_group")),
             ctx["crop_width_px"], ctx["crop_height_px"], mmpp, verified, ctx["crop_version"]),
        ).fetchone()
    return dict(created)


def _scope(project_id: str) -> dict[str, Any]:
    from .scope.engine import get_scope
    return get_scope(project_id, "columns", auto_run=True)


def _contexts(project_id: UUID | str) -> list[dict[str, Any]]:
    pid = str(project_id)
    ensure_takeoff_floors(pid)
    scope = _scope(pid)
    # A Scope can be partial because Beam/Slab facts are not ready yet. That must not block
    # locating columns; those facts only affect downstream junction/height refinement.
    if scope.get("status") == "blocked":
        message = next((x.get("message") for x in scope.get("coverage_gaps", []) if x.get("severity") == "blocked"), "Column Scope is blocked")
        raise RuntimeError(f"Column Scope is not ready: {message}")
    contexts: list[dict[str, Any]] = []
    for level in scope.get("level_scopes") or []:
        storey_id = str(level.get("level_ref") or "")
        for viewport_value in level.get("primary_viewport_ids") or []:
            viewport_id = str(viewport_value)
            floor = _ensure_floor_identity(pid, storey_id, viewport_id)
            if not floor:
                continue
            crop_path, ctx = ensure_viewport_crop(viewport_id)
            mmpp, verified = source_mm_per_pixel(viewport_id)
            contexts.append({
                **floor,
                "column_viewport_id": viewport_id,
                "crop_path": Path(crop_path),
                "drawing_width": int(ctx["crop_width_px"]),
                "drawing_height": int(ctx["crop_height_px"]),
                "column_crop_version": int(ctx["crop_version"]),
                "mm_per_pixel": mmpp,
                "scale_verified": verified,
                "scope_ref": str(level.get("scope_ref") or storey_id),
                "consumed_facts": level.get("consumed_facts") or [],
            })
    return contexts


def _supporting_viewport_ids(project_id: str) -> list[str]:
    ids: list[str] = []
    for item in _scope(project_id).get("selected_viewports") or []:
        if item.get("role") in {"supporting_schedule", "supporting_detail", "supporting_vertical"}:
            value = str(item.get("viewport_id") or "")
            if value and value not in ids:
                ids.append(value)
    return ids


def _source_hash(project: dict[str, Any], ctx: dict[str, Any]) -> str:
    return content_hash({
        "cache_version": COLUMN_CACHE_VERSION,
        "prompt_version": COLUMN_PROMPT_VERSION,
        "frame_version": project.get("frame_version"),
        "viewport_id": str(ctx["column_viewport_id"]),
        "crop_version": int(ctx.get("column_crop_version") or 0),
        "drawing_width": int(ctx["drawing_width"]),
        "drawing_height": int(ctx["drawing_height"]),
        "mm_per_pixel": float(ctx["mm_per_pixel"]) if ctx.get("mm_per_pixel") else None,
        "crop_sha256": _file_sha256(Path(ctx["crop_path"])),
    })


def _load_geometry_cache(project_id: str, floor_id: str, viewport_id: str, source_hash: str) -> ColumnGeometryOutput | None:
    candidates = [_result_path(project_id, floor_id, viewport_id)]
    result_dir = _runtime_dir(project_id) / "results"
    if result_dir.exists():
        candidates.extend(path for path in result_dir.glob("*.json") if path not in candidates)
    for path in candidates:
        payload = _read_json(path, {})
        if payload.get("schema_version") != COLUMN_CACHE_VERSION or payload.get("source_hash") != source_hash:
            continue
        try:
            return ColumnGeometryOutput.model_validate(payload.get("geometry") or {})
        except Exception:
            continue
    return None


def _save_geometry_cache(project_id: str, floor_id: str, viewport_id: str, source_hash: str, quality: str, output: ColumnGeometryOutput) -> None:
    _write_json(_result_path(project_id, floor_id, viewport_id), {
        "schema_version": COLUMN_CACHE_VERSION,
        "provider": COLUMN_PROVIDER,
        "source_hash": source_hash,
        "quality": quality,
        "geometry": output.model_dump(mode="json"),
    })


def _catalog_hash(project: dict[str, Any], text: str) -> str:
    return content_hash({
        "cache_version": COLUMN_CACHE_VERSION,
        "prompt_version": COLUMN_PROMPT_VERSION,
        "frame_version": project.get("frame_version"),
        "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
    })


def _load_catalog_cache(project_id: str, value_hash: str) -> ColumnCatalogOutput | None:
    payload = _read_json(_catalog_path(project_id), {})
    if payload.get("schema_version") != COLUMN_CACHE_VERSION or payload.get("catalog_hash") != value_hash:
        return None
    try:
        return ColumnCatalogOutput.model_validate(payload.get("catalog") or {})
    except Exception:
        return None


def _save_catalog_cache(project_id: str, value_hash: str, quality: str, output: ColumnCatalogOutput) -> None:
    _write_json(_catalog_path(project_id), {
        "schema_version": COLUMN_CACHE_VERSION,
        "provider": COLUMN_PROVIDER,
        "catalog_hash": value_hash,
        "quality": quality,
        "catalog": output.model_dump(mode="json"),
    })


def _vertical_hash(project: dict[str, Any], viewport_id: str) -> tuple[str, Path, dict[str, Any]]:
    crop_path, ctx = ensure_viewport_crop(viewport_id)
    return content_hash({
        "cache_version": COLUMN_CACHE_VERSION,
        "prompt_version": COLUMN_PROMPT_VERSION,
        "frame_version": project.get("frame_version"),
        "viewport_id": viewport_id,
        "crop_version": int(ctx.get("crop_version") or 0),
        "crop_sha256": _file_sha256(Path(crop_path)),
    }), Path(crop_path), ctx


def _load_vertical_cache(project_id: str, viewport_id: str, source_hash: str) -> ColumnVerticalOutput | None:
    payload = _read_json(_vertical_path(project_id, viewport_id), {})
    if payload.get("schema_version") != COLUMN_CACHE_VERSION or payload.get("source_hash") != source_hash:
        return None
    try:
        return ColumnVerticalOutput.model_validate(payload.get("output") or {})
    except Exception:
        return None


def _save_vertical_cache(project_id: str, viewport_id: str, source_hash: str, quality: str, output: ColumnVerticalOutput) -> None:
    _write_json(_vertical_path(project_id, viewport_id), {
        "schema_version": COLUMN_CACHE_VERSION,
        "provider": COLUMN_PROVIDER,
        "source_hash": source_hash,
        "quality": quality,
        "output": output.model_dump(mode="json"),
    })


def _validate_geometry(output: ColumnGeometryOutput) -> None:
    width, height = output.source_width_px, output.source_height_px
    for item in output.columns:
        x, y, w, h = item.bbox
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > width or y + h > height:
            raise RuntimeError(f"Column {item.column_id} bbox is outside source image")
        if item.center.x > width or item.center.y > height:
            raise RuntimeError(f"Column {item.column_id} center is outside source image")
        for point in item.footprint:
            if point.x > width or point.y > height:
                raise RuntimeError(f"Column {item.column_id} footprint is outside source image")


def _section_area_m2(shape: str, width_mm: float | None, depth_mm: float | None, diameter_mm: float | None) -> float | None:
    if shape == "circular":
        d = float(diameter_mm or width_mm or 0)
        return math.pi * (d / 2000.0) ** 2 if d > 0 else None
    if shape != "rectangular":
        return None
    w, d = float(width_mm or 0), float(depth_mm or 0)
    return (w / 1000.0) * (d / 1000.0) if w > 0 and d > 0 else None


def _section_perimeter_m(shape: str, width_mm: float | None, depth_mm: float | None, diameter_mm: float | None) -> float | None:
    if shape == "circular":
        d = float(diameter_mm or width_mm or 0)
        return math.pi * d / 1000.0 if d > 0 else None
    if shape != "rectangular":
        return None
    w, d = float(width_mm or 0), float(depth_mm or 0)
    return 2.0 * (w + d) / 1000.0 if w > 0 and d > 0 else None


def _polygon_section_metrics(item: Any, mmpp: float | None) -> tuple[float | None, float | None]:
    """Return exact plan-footprint area/perimeter for an irregular column when scale is confirmed."""
    if not mmpp or len(item.footprint) < 3:
        return None, None
    pts = [
        (float(point.get("x") if isinstance(point, dict) else point.x), float(point.get("y") if isinstance(point, dict) else point.y))
        for point in item.footprint
    ]
    twice_area = 0.0
    perimeter_px = 0.0
    for index, (x1, y1) in enumerate(pts):
        x2, y2 = pts[(index + 1) % len(pts)]
        twice_area += x1 * y2 - x2 * y1
        perimeter_px += math.hypot(x2 - x1, y2 - y1)
    area_px2 = abs(twice_area) / 2.0
    if area_px2 <= 0 or perimeter_px <= 0:
        return None, None
    return area_px2 * (float(mmpp) ** 2) / 1_000_000.0, perimeter_px * float(mmpp) / 1000.0


def _dimensions_from_geometry(item: Any, mmpp: float | None) -> tuple[float | None, float | None, float | None, str]:
    if item.shape == "circular":
        if item.diameter_mm_visible:
            return None, None, float(item.diameter_mm_visible), "explicit_plan_note"
        if not mmpp:
            return None, None, None, "unresolved"
        px = item.diameter_px or min(float(item.bbox[2]), float(item.bbox[3]))
        return None, None, round(float(px) * mmpp, 1), "scaled_plan_footprint"
    if item.shape == "rectangular":
        if item.width_mm_visible and item.depth_mm_visible:
            return float(item.width_mm_visible), float(item.depth_mm_visible), None, "explicit_plan_note"
        if not mmpp:
            return None, None, None, "unresolved"
        width_px = item.section_width_px or float(item.bbox[2])
        depth_px = item.section_depth_px or float(item.bbox[3])
        return round(float(width_px) * mmpp, 1), round(float(depth_px) * mmpp, 1), None, "scaled_plan_footprint"
    if item.shape == "polygonal" and mmpp and len(item.footprint) >= 3:
        return None, None, None, "scaled_polygon_footprint"
    return None, None, None, "unresolved"


def _matches_level(value: str | None, ctx: dict[str, Any]) -> bool:
    if not value:
        return True
    query = _norm(value)
    candidates = [_norm(ctx.get("name")), _norm(ctx.get("scope_ref"))]
    storey = fetch_one("SELECT name,typical_group FROM storey WHERE id=%s", (str(ctx.get("storey_id")),)) if ctx.get("storey_id") else None
    if storey:
        candidates += [_norm(storey.get("name")), _norm(storey.get("typical_group"))]
    return any(query and (query in candidate or candidate in query) for candidate in candidates if candidate)


def _catalog_definition(item: Any, catalog_rows: dict[str, dict[str, Any]], ctx: dict[str, Any], catalog: ColumnCatalogOutput) -> dict[str, Any] | None:
    mark = _norm(item.mark)
    if mark and mark in catalog_rows:
        return catalog_rows[mark]
    # Use an explicit level/location rule only when it maps to a real catalog code.
    for rule in catalog.family_rules:
        if rule.level_labels and not any(_matches_level(label, ctx) for label in rule.level_labels):
            continue
        code = _norm(rule.column_code)
        if code in catalog_rows:
            return catalog_rows[code]
    return None


def _vertical_for(item: Any, ctx: dict[str, Any], outputs: list[ColumnVerticalOutput]) -> list[Any]:
    mark = _norm(item.mark)
    candidates = []
    for output in outputs:
        for observation in output.observations:
            # Never broadcast an unmapped generic detail to every column in the project.
            if not observation.target_mark and not observation.level_label:
                continue
            if observation.target_mark and mark and _norm(observation.target_mark) != mark:
                continue
            if observation.target_mark and not mark:
                continue
            if observation.level_label and not _matches_level(observation.level_label, ctx):
                continue
            candidates.append(observation)
    candidates.sort(key=lambda x: float(x.confidence), reverse=True)
    return candidates


def _height_for(item: Any, definition: dict[str, Any] | None, ctx: dict[str, Any], vertical: list[Any]) -> tuple[float | None, str]:
    if item.height_mm_visible:
        return float(item.height_mm_visible), "explicit_plan_note"
    for obs in vertical:
        if obs.height_mm:
            return float(obs.height_mm), "section_detail"
        if obs.start_level_elevation_mm is not None and obs.end_level_elevation_mm is not None:
            height = abs(float(obs.end_level_elevation_mm) - float(obs.start_level_elevation_mm))
            if height > 0:
                return height, "section_levels"
    # A confirmed storey height is a safe fallback only for a normal full-storey lift.
    spans = item.spans_full_storey
    if spans is False:
        return None, "unresolved"
    storey = fetch_one("SELECT height_mm FROM storey WHERE id=%s", (str(ctx.get("storey_id")),)) if ctx.get("storey_id") else None
    if storey and storey.get("height_mm") and spans is True:
        return float(storey["height_mm"]), "confirmed_storey_height"
    return None, "unresolved"


def _is_concrete_column(item: Any, definition: dict[str, Any] | None, vertical: list[Any]) -> bool:
    values = [getattr(item, "construction_hint", None)]
    if definition:
        values += [definition.get("material"), definition.get("concrete_grade"), definition.get("description"), definition.get("name")]
    for obs in vertical:
        values += [obs.concrete_grade, obs.source_text]
    text = " ".join(str(value or "") for value in values).lower()
    return bool(re.search(r"\breinforced\s+concrete\b|\bin[ -]?situ\s+concrete\b|(?:^|[^a-z])r\.?c\.?(?:[^a-z]|$)|\brcc\b|\bconcrete\b", text))


def _resolved_reinforcement_kg(definition: dict[str, Any] | None, vertical: list[Any], concrete_volume_m3: float | None) -> tuple[float | None, str]:
    if definition:
        if definition.get("reinforcement_kg_per_column"):
            return float(definition["reinforcement_kg_per_column"]), "explicit_kg_per_column"
        if definition.get("reinforcement_rate_kg_per_m3") and concrete_volume_m3 is not None:
            return round(float(definition["reinforcement_rate_kg_per_m3"]) * concrete_volume_m3, 3), "explicit_kg_per_m3"
    for obs in vertical:
        if obs.reinforcement_kg_per_column:
            return float(obs.reinforcement_kg_per_column), "section_kg_per_column"
        if obs.reinforcement_rate_kg_per_m3 and concrete_volume_m3 is not None:
            return round(float(obs.reinforcement_rate_kg_per_m3) * concrete_volume_m3, 3), "section_kg_per_m3"
    return None, "information_required"


def _apply_catalog(project_id: str, catalog: ColumnCatalogOutput) -> dict[str, dict[str, Any]]:
    with transaction() as conn:
        existing = { _norm(row["code"]): dict(row) for row in conn.execute("SELECT * FROM column_definition WHERE project_id=%s AND status<>'deleted'", (project_id,)).fetchall() }
        for index, item in enumerate(catalog.definitions):
            code = item.code.strip() or f"COL-{index+1:02d}"
            key = _norm(code)
            current = existing.get(key)
            payload = (
                item.name, item.description, item.shape, item.width_mm, item.depth_mm, item.diameter_mm, item.material,
                item.concrete_grade, item.reinforcement_description, item.reinforcement_rate_kg_per_m3,
                item.reinforcement_kg_per_column, item.cover_mm, item.fire_rating, item.finish, item.nrm_work_section,
                PALETTE[index % len(PALETTE)], Jsonb([{"kind": "catalog", "text": item.source_text, "confidence": item.confidence}]), item.confidence,
            )
            if current and current.get("user_confirmed"):
                continue
            conn.execute(
                """INSERT INTO column_definition(project_id,code,name,description,shape,width_mm,depth_mm,diameter_mm,material,concrete_grade,
                       reinforcement_description,reinforcement_rate_kg_per_m3,reinforcement_kg_per_column,cover_mm,fire_rating,finish,nrm_work_section,
                       display_colour,source_evidence,confidence,status,user_confirmed,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active',false,now())
                   ON CONFLICT(project_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,shape=excluded.shape,
                     width_mm=excluded.width_mm,depth_mm=excluded.depth_mm,diameter_mm=excluded.diameter_mm,material=excluded.material,
                     concrete_grade=excluded.concrete_grade,reinforcement_description=excluded.reinforcement_description,
                     reinforcement_rate_kg_per_m3=excluded.reinforcement_rate_kg_per_m3,reinforcement_kg_per_column=excluded.reinforcement_kg_per_column,
                     cover_mm=excluded.cover_mm,fire_rating=excluded.fire_rating,finish=excluded.finish,nrm_work_section=excluded.nrm_work_section,
                     display_colour=excluded.display_colour,source_evidence=excluded.source_evidence,confidence=excluded.confidence,updated_at=now()
                   WHERE column_definition.user_confirmed=false""",
                (project_id, code, *payload),
            )
        rows = conn.execute("SELECT * FROM column_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code", (project_id,)).fetchall()
    return {_norm(row["code"]): dict(row) for row in rows}


def _ensure_unassigned(project_id: str) -> dict[str, Any]:
    row = fetch_one("SELECT * FROM column_definition WHERE project_id=%s AND code='UNASSIGNED-COLUMN'", (project_id,))
    if row:
        return row
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO column_definition(project_id,code,name,description,shape,display_colour,status,user_confirmed,confidence,source_evidence)
               VALUES (%s,'UNASSIGNED-COLUMN','Unassigned column','Detected column awaiting reliable family/type evidence','unknown','#64748b','active',false,0,%s)
               ON CONFLICT(project_id,code) DO UPDATE SET updated_at=now() RETURNING *""",
            (project_id, Jsonb([{"kind": "system", "text": "Unresolved detected column family"}])),
        ).fetchone()
    return dict(row)


def _insert_geometry(project_id: str, ctx: dict[str, Any], geometry: ColumnGeometryOutput, catalog: ColumnCatalogOutput, vertical_outputs: list[ColumnVerticalOutput]) -> dict[str, Any]:
    floor_id = str(ctx["id"])
    viewport_id = str(ctx["column_viewport_id"])
    catalog_rows = _apply_catalog(project_id, catalog)
    unassigned = _ensure_unassigned(project_id)
    with transaction() as conn:
        conn.execute("DELETE FROM column_review_item WHERE project_id=%s AND floor_id=%s AND resolved=false", (project_id, floor_id))
        conn.execute("DELETE FROM column_instance WHERE project_id=%s AND floor_id=%s AND source_viewport_id=%s AND user_confirmed=false", (project_id, floor_id, viewport_id))
        inserted: list[str] = []
        for index, item in enumerate(geometry.columns):
            definition = _catalog_definition(item, catalog_rows, ctx, catalog)
            definition = definition or unassigned
            shape = item.shape if item.shape != "unknown" else str(definition.get("shape") or "unknown")
            plan_w, plan_d, plan_dia, section_source = _dimensions_from_geometry(item, float(ctx["mm_per_pixel"]) if ctx.get("mm_per_pixel") else None)
            width_mm = definition.get("width_mm") or plan_w
            depth_mm = definition.get("depth_mm") or plan_d
            diameter_mm = definition.get("diameter_mm") or plan_dia
            observations = _vertical_for(item, ctx, vertical_outputs)
            for obs in observations:
                if shape == "circular" and not diameter_mm and obs.diameter_mm:
                    diameter_mm, section_source = float(obs.diameter_mm), "section_detail"
                elif shape != "circular" and (not width_mm or not depth_mm) and obs.width_mm and obs.depth_mm:
                    width_mm, depth_mm, section_source = float(obs.width_mm), float(obs.depth_mm), "section_detail"
            height_mm, height_source = _height_for(item, definition, ctx, observations)
            if shape == "polygonal":
                section_area, perimeter = _polygon_section_metrics(item, float(ctx["mm_per_pixel"]) if ctx.get("mm_per_pixel") else None)
                if section_area is not None:
                    section_source = "scaled_polygon_footprint"
            else:
                section_area = _section_area_m2(shape, width_mm, depth_mm, diameter_mm)
                perimeter = _section_perimeter_m(shape, width_mm, depth_mm, diameter_mm)
            concrete_member = _is_concrete_column(item, definition, observations)
            volume = round(section_area * height_mm / 1000.0, 4) if concrete_member and section_area is not None and height_mm else None
            formwork = round(perimeter * height_mm / 1000.0, 4) if concrete_member and perimeter is not None and height_mm else None
            reinforcement, reinforcement_source = _resolved_reinforcement_kg(definition, observations, volume) if concrete_member else (None, "not_applicable_or_unresolved")
            bbox = {"x": float(item.bbox[0]), "y": float(item.bbox[1]), "width": float(item.bbox[2]), "height": float(item.bbox[3])}
            evidence = [e.model_dump(mode="json") for e in item.evidence]
            evidence.extend({"kind": "vertical_observation", **obs.model_dump(mode="json")} for obs in observations)
            source_key = item.column_id or f"column-{index+1}"
            status = "ready"
            review: list[tuple[str, str]] = []
            if definition["id"] == unassigned["id"]:
                review.append(("family_unresolved", f"Column {item.mark or source_key} has no reliably matched schedule/type family."))
            if section_area is None:
                review.append(("section_unresolved", f"Column {item.mark or source_key} does not have a supported section size; measurable construction quantities remain incomplete."))
            if height_mm is None:
                review.append(("height_unresolved", f"Column {item.mark or source_key} does not have a supported vertical lift/height."))
            if not concrete_member and not str(definition.get("material") or "").strip():
                review.append(("construction_unresolved", f"Column {item.mark or source_key} has no supported construction/material classification. Concrete/formwork quantities were not assumed."))
            if concrete_member and reinforcement is None:
                review.append(("reinforcement_basis_unresolved", f"Column {item.mark or source_key} has no explicit reinforcement kg basis. Reinforcement remains Information Required."))
            for obs in observations:
                if obs.feature_type != "none":
                    review.append(("column_feature_requires_review", f"Column {item.mark or source_key} has a supported {obs.feature_type} feature in vertical evidence. Keep it as a separate review item unless its geometry and ownership are fully resolved; it is not silently folded into the shaft quantity."))
                    break
            if float(item.confidence) < 0.70:
                review.append(("low_confidence", f"Column {item.mark or source_key} has low plan-detection confidence and needs visual review."))
            if review:
                status = "needs_review"
            row = conn.execute(
                """INSERT INTO column_instance(project_id,floor_id,source_viewport_id,source_key,definition_id,column_mark,generated_bbox,bbox,center,
                       footprint,shape,rotation_degrees,width_mm,depth_mm,diameter_mm,section_source,height_mm,height_source,
                       concrete_volume_m3,formwork_area_m2,reinforcement_kg,reinforcement_source,include_in_boq,geometry_user_modified,
                       status,user_confirmed,confidence,source_evidence)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true,false,%s,false,%s,%s)
                   ON CONFLICT(floor_id,source_viewport_id,source_key) DO UPDATE SET definition_id=excluded.definition_id,column_mark=excluded.column_mark,
                     generated_bbox=excluded.generated_bbox,bbox=CASE WHEN column_instance.geometry_user_modified THEN column_instance.bbox ELSE excluded.bbox END,
                     center=CASE WHEN column_instance.geometry_user_modified THEN column_instance.center ELSE excluded.center END,
                     footprint=excluded.footprint,shape=excluded.shape,rotation_degrees=excluded.rotation_degrees,width_mm=excluded.width_mm,
                     depth_mm=excluded.depth_mm,diameter_mm=excluded.diameter_mm,section_source=excluded.section_source,height_mm=excluded.height_mm,
                     height_source=excluded.height_source,concrete_volume_m3=excluded.concrete_volume_m3,formwork_area_m2=excluded.formwork_area_m2,
                     reinforcement_kg=excluded.reinforcement_kg,reinforcement_source=excluded.reinforcement_source,status=excluded.status,
                     confidence=excluded.confidence,source_evidence=excluded.source_evidence,updated_at=now() RETURNING id""",
                (project_id, floor_id, viewport_id, source_key, str(definition["id"]), item.mark, Jsonb(bbox), Jsonb(bbox),
                 Jsonb(item.center.model_dump(mode="json")), Jsonb([p.model_dump(mode="json") for p in item.footprint]), shape,
                 item.rotation_degrees, width_mm, depth_mm, diameter_mm, section_source, height_mm, height_source, volume, formwork,
                 reinforcement, reinforcement_source, status, item.confidence, Jsonb(evidence)),
            ).fetchone()
            cid = str(row["id"])
            inserted.append(cid)
            for code, message in review:
                conn.execute(
                    "INSERT INTO column_review_item(project_id,floor_id,column_id,severity,code,message) VALUES (%s,%s,%s,'warning',%s,%s)",
                    (project_id, floor_id, cid, code, message),
                )
        for warning in [*geometry.warnings, *geometry.questions]:
            conn.execute("INSERT INTO column_review_item(project_id,floor_id,severity,code,message) VALUES (%s,%s,'warning','model_note',%s)", (project_id, floor_id, str(warning)))
    return {"floor_id": floor_id, "count": len(inserted), "column_ids": inserted}


def _publish_instance_facts(project_id: str, floor_ids: list[str]) -> None:
    project = fetch_one("SELECT frame_version FROM project WHERE id=%s", (project_id,)) or {}
    version = int(project.get("frame_version") or 0)
    with transaction() as conn:
        for floor_id in floor_ids:
            floor = conn.execute("SELECT storey_id FROM takeoff_floor WHERE id=%s", (floor_id,)).fetchone()
            if not floor:
                continue
            rows = conn.execute(
                """SELECT ci.id,ci.column_mark,ci.bbox,ci.center,ci.shape,ci.width_mm,ci.depth_mm,ci.diameter_mm,ci.height_mm,
                          cd.code AS family_code FROM column_instance ci LEFT JOIN column_definition cd ON cd.id=ci.definition_id
                   WHERE ci.project_id=%s AND ci.floor_id=%s AND ci.status<>'deleted'""",
                (project_id, floor_id),
            ).fetchall()
            payload = [{"id": str(r["id"]), "mark": r.get("column_mark"), "family_code": r.get("family_code"), "bbox": r.get("bbox"),
                        "center": r.get("center"), "shape": r.get("shape"), "width_mm": r.get("width_mm"), "depth_mm": r.get("depth_mm"),
                        "diameter_mm": r.get("diameter_mm"), "height_mm": r.get("height_mm")} for r in rows]
            status = "complete" if rows else "complete_empty"
            conn.execute(
                """INSERT INTO takeoff_fact_set(project_id,publisher_element,fact_type,scope_ref,frame_version,status,payload_json,fact_version,updated_at)
                   VALUES (%s,'columns','instance_position',%s,%s,%s,%s,1,now())
                   ON CONFLICT(project_id,publisher_element,fact_type,scope_ref,frame_version)
                   DO UPDATE SET status=excluded.status,payload_json=excluded.payload_json,fact_version=takeoff_fact_set.fact_version+1,updated_at=now()""",
                (project_id, str(floor["storey_id"]), version, status, Jsonb({"count": len(rows), "columns": payload})),
            )


def _read_catalog(project_id: str, project: dict[str, Any], quality: str, client: CodexAccountModelClient) -> ColumnCatalogOutput:
    text = project_text_evidence(project_id)
    if not text.strip():
        return ColumnCatalogOutput()
    value_hash = _catalog_hash(project, text)
    cached = _load_catalog_cache(project_id, value_hash)
    if cached is not None:
        return cached
    output = client.parse_text(COLUMN_CATALOG_PROMPT.format(spec_text=text[:60000]), ColumnCatalogOutput, system=COLUMN_CATALOG_SYSTEM, quality=quality)
    _save_catalog_cache(project_id, value_hash, quality, output)
    return output


def _read_vertical(project_id: str, project: dict[str, Any], quality: str, client: CodexAccountModelClient, known_codes: list[str]) -> list[ColumnVerticalOutput]:
    results: list[ColumnVerticalOutput] = []
    storeys = fetch_all("SELECT name,height_mm,typical_group FROM storey WHERE project_id=%s ORDER BY level_index", (project_id,))
    storey_text = json.dumps(storeys, ensure_ascii=False, default=str)
    for viewport_id in _supporting_viewport_ids(project_id):
        row = fetch_one("SELECT view_kind FROM viewport WHERE id=%s", (viewport_id,)) or {}
        if row.get("view_kind") not in {"section", "elevation", "detail", "schedule"}:
            continue
        source_hash, path, _ = _vertical_hash(project, viewport_id)
        cached = _load_vertical_cache(project_id, viewport_id, source_hash)
        if cached is not None:
            results.append(cached)
            continue
        context = extract_viewport_text(viewport_id, 500)
        output = client.parse_image(
            path,
            COLUMN_VERTICAL_PROMPT.format(storeys=storey_text, known_codes=", ".join(known_codes[:120]), context=json.dumps(context, ensure_ascii=False)),
            ColumnVerticalOutput,
            system=COLUMN_VERTICAL_SYSTEM,
            quality=quality,
        )
        _save_vertical_cache(project_id, viewport_id, source_hash, quality, output)
        results.append(output)
    return results


def analyze_column_context(project_id: UUID | str, floor_id: UUID | str, viewport_id: UUID | str, *, quality: str = "medium", force: bool = False) -> dict[str, Any]:
    pid = str(project_id)
    project = require_frozen_project(pid)
    contexts = [c for c in _contexts(pid) if str(c["id"]) == str(floor_id) and str(c["column_viewport_id"]) == str(viewport_id)]
    if not contexts:
        raise ValueError("Column floor/viewport context not found in current Scope")
    if force:
        protected = fetch_one("SELECT count(*) AS n FROM column_instance WHERE project_id=%s AND floor_id=%s AND user_confirmed=true", (pid, str(floor_id)))
        if protected and int(protected["n"] or 0) > 0:
            raise RuntimeError("Confirmed Column geometry exists on this level. Unconfirm or edit it manually before forcing a new detection.")
    auth = codex_account_status(refresh=True)
    if not auth.get("authenticated"):
        raise RuntimeError("Connect ChatGPT before running Column detection.")
    client = CodexAccountModelClient()
    catalog = _read_catalog(pid, project, quality, client)
    _apply_catalog(pid, catalog)
    vertical = _read_vertical(pid, project, quality, client, [x.code for x in catalog.definitions])
    ctx = contexts[0]
    source_hash = _source_hash(project, ctx)
    geometry = None if force else _load_geometry_cache(pid, str(ctx["id"]), str(ctx["column_viewport_id"]), source_hash)
    if geometry is None:
        context = extract_viewport_text(ctx["column_viewport_id"], 650)
        geometry = client.parse_image(
            Path(ctx["crop_path"]),
            COLUMN_GEOMETRY_PROMPT.format(width=ctx["drawing_width"], height=ctx["drawing_height"], floor_name=ctx["name"],
                                          mm_per_pixel=ctx.get("mm_per_pixel"), context=json.dumps(context, ensure_ascii=False)),
            ColumnGeometryOutput,
            system=COLUMN_SYSTEM,
            quality=quality,
        )
        if geometry.source_width_px != int(ctx["drawing_width"]) or geometry.source_height_px != int(ctx["drawing_height"]):
            raise RuntimeError("Column detector returned a coordinate space that does not match the exact source crop")
        _validate_geometry(geometry)
        _save_geometry_cache(pid, str(ctx["id"]), str(ctx["column_viewport_id"]), source_hash, quality, geometry)
    result = _insert_geometry(pid, ctx, geometry, catalog, vertical)
    _publish_instance_facts(pid, [str(ctx["id"])])
    return result


def _run_analysis(project_id: str, quality: str, force: bool, *, lock_acquired: bool = False) -> None:
    lock = _lock(project_id)
    acquired_here = False
    if not lock_acquired:
        if not lock.acquire(blocking=False):
            return
        acquired_here = True
    try:
        project = require_frozen_project(project_id)
        contexts = _contexts(project_id)
        if not contexts:
            raise RuntimeError("No approved Column plan contexts are available in Scope")
        if force:
            protected = fetch_one("SELECT count(*) AS n FROM column_instance WHERE project_id=%s AND user_confirmed=true", (project_id,))
            if protected and int(protected["n"] or 0) > 0:
                raise RuntimeError("Confirmed Column geometry exists. Unconfirm or edit it manually before forcing project-wide detection.")
        auth = codex_account_status(refresh=True)
        if not auth.get("authenticated"):
            raise RuntimeError("Connect ChatGPT before running Column detection.")
        _set_status(project_id, "running", 5, "Reading Column schedules and structural notes")
        client = CodexAccountModelClient()
        catalog = _read_catalog(project_id, project, quality, client)
        _apply_catalog(project_id, catalog)
        _set_status(project_id, "running", 18, "Reading Column sections and vertical evidence")
        vertical = _read_vertical(project_id, project, quality, client, [x.code for x in catalog.definitions])
        touched: list[str] = []
        for index, ctx in enumerate(contexts):
            pct = 20 + int(70 * index / max(1, len(contexts)))
            _set_status(project_id, "running", pct, f"Detecting columns on {ctx['name']}")
            source_hash = _source_hash(project, ctx)
            geometry = None if force else _load_geometry_cache(project_id, str(ctx["id"]), str(ctx["column_viewport_id"]), source_hash)
            if geometry is None:
                context = extract_viewport_text(ctx["column_viewport_id"], 650)
                geometry = client.parse_image(
                    Path(ctx["crop_path"]),
                    COLUMN_GEOMETRY_PROMPT.format(width=ctx["drawing_width"], height=ctx["drawing_height"], floor_name=ctx["name"],
                                                  mm_per_pixel=ctx.get("mm_per_pixel"), context=json.dumps(context, ensure_ascii=False)),
                    ColumnGeometryOutput,
                    system=COLUMN_SYSTEM,
                    quality=quality,
                )
                if geometry.source_width_px != int(ctx["drawing_width"]) or geometry.source_height_px != int(ctx["drawing_height"]):
                    raise RuntimeError(f"Column detector returned the wrong coordinate space for {ctx['name']}")
                _validate_geometry(geometry)
                _save_geometry_cache(project_id, str(ctx["id"]), str(ctx["column_viewport_id"]), source_hash, quality, geometry)
            _insert_geometry(project_id, ctx, geometry, catalog, vertical)
            touched.append(str(ctx["id"]))
        _publish_instance_facts(project_id, touched)
        _set_status(project_id, "completed", 100, "Column detection complete", floors=len(contexts))
    except Exception as exc:  # noqa: BLE001
        _set_status(project_id, "failed", 100, str(exc)[:500], traceback=traceback.format_exc()[-4000:])
    finally:
        if acquired_here or lock_acquired:
            try:
                lock.release()
            except RuntimeError:
                pass


def start_column_analysis(project_id: UUID | str, quality: str = "medium", *, force: bool = False) -> dict[str, Any]:
    pid = str(project_id)
    require_frozen_project(pid)
    if force:
        protected = fetch_one("SELECT count(*) AS n FROM column_instance WHERE project_id=%s AND user_confirmed=true", (pid,))
        if protected and int(protected["n"] or 0) > 0:
            raise RuntimeError("Confirmed Column geometry exists. Unconfirm or edit it manually before forcing project-wide detection.")
    lock = _lock(pid)
    if not lock.acquire(blocking=False):
        return column_analysis_status(pid)
    _set_status(pid, "running", 1, "Preparing Column drawings")
    thread = threading.Thread(target=_run_analysis, args=(pid, quality, force), kwargs={"lock_acquired": True}, daemon=True, name=f"quanto-columns-{pid}")
    thread.start()
    return column_analysis_status(pid)


def column_analysis_status(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    status = _read_json(_status_path(pid), {})
    if status:
        return status
    row = fetch_one("SELECT count(*) AS n FROM column_instance WHERE project_id=%s AND status<>'deleted'", (pid,))
    if row and int(row["n"] or 0) > 0:
        return {"status": "completed", "progress": 100, "message": "Saved Column detection loaded"}
    return {"status": "not_started", "progress": 0, "message": "Column detection has not started"}


def _demo_context(project_id: str) -> dict[str, Any]:
    contexts = _contexts(project_id)
    sheets: list[dict[str, Any]] = []
    viewports: list[dict[str, Any]] = []
    storeys: list[dict[str, Any]] = []
    seen_vp: set[str] = set()
    seen_storey: set[str] = set()
    for ctx in contexts:
        vp = str(ctx["column_viewport_id"])
        if vp not in seen_vp:
            seen_vp.add(vp)
            sid = f"column-sheet-{vp}"
            sheets.append({"id": sid, "sheetNo": str(ctx.get("level_index") or ""), "title": ctx["name"], "revision": "", "image": f"/api/v1/viewports/{vp}/crop",
                           "page": 200 + int(ctx.get("level_index") or 0), "included": True, "width": ctx["drawing_width"], "height": ctx["drawing_height"]})
            viewports.append({"id": vp, "name": ctx["name"], "category": "plan", "sheetId": sid, "bbox": [0,0,ctx["drawing_width"],ctx["drawing_height"]],
                              "status": "confirmed", "scaleMPerPx": float(ctx["mm_per_pixel"])/1000.0 if ctx.get("mm_per_pixel") else None, "takeoffElement": "columns"})
        storey_id = str(ctx.get("storey_id") or "")
        if storey_id and storey_id not in seen_storey:
            seen_storey.add(storey_id)
            storey = fetch_one("SELECT name,level_index,height_mm,typical_group FROM storey WHERE id=%s", (storey_id,)) or {}
            storeys.append({"id": storey_id, "name": storey.get("name") or ctx["name"], "levelIndex": int(storey.get("level_index") or 0),
                            "factor": int(ctx.get("typical_factor") or 1), "heightM": float(storey.get("height_mm") or 0)/1000.0,
                            "status": "confirmed" if storey.get("height_mm") else "ready"})
    return {"sheets": sheets, "viewports": viewports, "storeys": storeys, "contexts": contexts}


def column_demo_state(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    context = _demo_context(pid)
    families = []
    for row in fetch_all("SELECT * FROM column_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code", (pid,)):
        if row["code"] == "UNASSIGNED-COLUMN":
            # Keep this family visible in the editor because unresolved members need a safe editable target.
            pass
        shape = "Circular" if row.get("shape") == "circular" else "Rectangular"
        families.append({
            "id": str(row["id"]), "mark": row["code"], "description": row.get("description") or row.get("name") or row["code"],
            "shape": shape, "widthMm": float(row.get("width_mm") or row.get("diameter_mm") or 0),
            "depthMm": float(row.get("depth_mm") or row.get("diameter_mm") or 0), "diameterMm": float(row.get("diameter_mm") or 0) or None,
            "source": ((row.get("source_evidence") or [{}])[0].get("text") if row.get("source_evidence") else "Project schedule / specification"),
            "color": row.get("display_colour") or "#64748b", "sourceShape": row.get("shape"), "material": row.get("material"), "concreteGrade": row.get("concrete_grade"),
            "reinforcementDescription": row.get("reinforcement_description"), "reinforcementRateKgPerM3": row.get("reinforcement_rate_kg_per_m3"),
            "reinforcementKgPerColumn": row.get("reinforcement_kg_per_column"), "nrmWorkSection": row.get("nrm_work_section"),
        })
    floor_map = {str(ctx["id"]): ctx for ctx in context["contexts"]}
    columns = []
    for row in fetch_all("SELECT * FROM column_instance WHERE project_id=%s AND status<>'deleted' ORDER BY floor_id,created_at", (pid,)):
        ctx = floor_map.get(str(row["floor_id"]))
        if not ctx or not row.get("definition_id"):
            continue
        columns.append({
            "id": str(row["id"]), "familyId": str(row["definition_id"]), "floorId": str(ctx.get("storey_id") or row["floor_id"]),
            "takeoffFloorId": str(row["floor_id"]), "viewportId": str(row.get("source_viewport_id") or ctx["column_viewport_id"]),
            "bbox": row.get("bbox") or {}, "widthOverrideMm": row.get("width_mm"), "depthOverrideMm": row.get("depth_mm"),
            "diameterOverrideMm": row.get("diameter_mm"), "heightM": float(row.get("height_mm") or 0)/1000.0,
            "status": "confirmed" if row.get("user_confirmed") else ("needs_review" if row.get("status") == "needs_review" else "ready"),
            "columnMark": row.get("column_mark"), "shape": row.get("shape"), "rotationDegrees": row.get("rotation_degrees"),
            "sectionSource": row.get("section_source"), "heightSource": row.get("height_source"), "concreteVolumeM3": row.get("concrete_volume_m3"),
            "formworkAreaM2": row.get("formwork_area_m2"), "reinforcementKg": row.get("reinforcement_kg"),
            "reinforcementSource": row.get("reinforcement_source"), "confidence": row.get("confidence"),
        })
    ui = fetch_one("SELECT state_json FROM takeoff_ui_state WHERE project_id=%s AND module='columns'", (pid,))
    return {**{k:v for k,v in context.items() if k != "contexts"}, "families": families, "columns": columns,
            "uiState": (ui or {}).get("state_json") or {}, "analysis": column_analysis_status(pid), "provider": COLUMN_PROVIDER, "auth": codex_account_status()}


def _family_section(family: dict[str, Any]) -> tuple[str, float | None, float | None, float | None]:
    ui_shape = str(family.get("shape") or "").lower()
    source_shape = str(family.get("sourceShape") or "").lower()
    if ui_shape.startswith("circ"):
        dia = float(family.get("diameterMm") or family.get("widthMm") or 0) or None
        return "circular", None, None, dia
    if source_shape == "polygonal":
        # The current editor displays polygonal families using the rectangular inspector,
        # but must not silently convert the persisted structural family to a rectangle.
        return "polygonal", (float(family.get("widthMm") or 0) or None), (float(family.get("depthMm") or 0) or None), None
    return "rectangular", (float(family.get("widthMm") or 0) or None), (float(family.get("depthMm") or 0) or None), None


def save_column_demo_state(project_id: UUID | str, payload: dict[str, Any]) -> dict[str, Any]:
    pid = str(project_id)
    contexts = _contexts(pid)
    by_storey = {str(ctx.get("storey_id")): ctx for ctx in contexts}
    families = list(payload.get("families") or [])
    columns = list(payload.get("columns") or [])
    family_map: dict[str, str] = {}
    touched_floors: set[str] = set()
    with transaction() as conn:
        for index, family in enumerate(families):
            client_id = str(family.get("id") or "")
            existing = conn.execute("SELECT * FROM column_definition WHERE id=%s AND project_id=%s", (_safe_uuid(client_id), pid)).fetchone() if _safe_uuid(client_id) else None
            code = str(family.get("mark") or f"C{index+1}").strip()
            shape, width_mm, depth_mm, diameter_mm = _family_section(family)
            colour = family.get("color") or PALETTE[index % len(PALETTE)]
            if existing:
                dbid = str(existing["id"])
                changed = any([
                    str(existing.get("code") or "") != code, str(existing.get("description") or existing.get("name") or "") != str(family.get("description") or ""),
                    str(existing.get("shape") or "") != shape, float(existing.get("width_mm") or 0) != float(width_mm or 0),
                    float(existing.get("depth_mm") or 0) != float(depth_mm or 0), float(existing.get("diameter_mm") or 0) != float(diameter_mm or 0),
                    str(existing.get("display_colour") or "") != str(colour),
                ])
                conn.execute(
                    """UPDATE column_definition SET code=%s,name=%s,description=%s,shape=%s,width_mm=%s,depth_mm=%s,diameter_mm=%s,
                           display_colour=%s,user_confirmed=(user_confirmed OR %s),updated_at=now() WHERE id=%s""",
                    (code, existing.get("name") or family.get("description") or code, family.get("description"), shape, width_mm, depth_mm, diameter_mm, colour, changed, dbid),
                )
            else:
                row = conn.execute(
                    """INSERT INTO column_definition(project_id,code,name,description,shape,width_mm,depth_mm,diameter_mm,display_colour,
                           source_evidence,confidence,status,user_confirmed)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,1,'active',true)
                       ON CONFLICT(project_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,shape=excluded.shape,
                         width_mm=excluded.width_mm,depth_mm=excluded.depth_mm,diameter_mm=excluded.diameter_mm,display_colour=excluded.display_colour,
                         user_confirmed=true,updated_at=now() RETURNING id""",
                    (pid, code, family.get("description") or code, family.get("description"), shape, width_mm, depth_mm, diameter_mm, colour,
                     Jsonb([{"kind":"user","text":"Column family created/edited in Quanto"}])),
                ).fetchone()
                dbid = str(row["id"])
            family_map[client_id] = dbid

        keep: set[str] = set()
        for index, item in enumerate(columns):
            storey_id = str(item.get("floorId") or "")
            ctx = by_storey.get(storey_id)
            if not ctx:
                continue
            floor_id = str(ctx["id"])
            touched_floors.add(floor_id)
            family_id = family_map.get(str(item.get("familyId") or "")) or _safe_uuid(item.get("familyId"))
            if not family_id:
                continue
            family = conn.execute("SELECT * FROM column_definition WHERE id=%s AND project_id=%s", (family_id, pid)).fetchone()
            if not family:
                continue
            bbox = item.get("bbox") or {}
            if not all(k in bbox for k in ("x","y","width","height")):
                continue
            center = {"x": float(bbox["x"]) + float(bbox["width"])/2.0, "y": float(bbox["y"]) + float(bbox["height"])/2.0}
            raw_item_shape = str(item.get("shape") or "").lower()
            if raw_item_shape in {"rectangular", "circular", "polygonal"}:
                shape = raw_item_shape
            else:
                shape = "circular" if str(family.get("shape") or "") == "circular" else ("polygonal" if str(family.get("shape") or "") == "polygonal" else "rectangular")
            width_mm = item.get("widthOverrideMm") if shape != "circular" else None
            depth_mm = item.get("depthOverrideMm") if shape != "circular" else None
            diameter_mm = item.get("diameterOverrideMm") if shape == "circular" else None
            width_mm = float(width_mm or family.get("width_mm") or 0) or None
            depth_mm = float(depth_mm or family.get("depth_mm") or 0) or None
            diameter_mm = float(diameter_mm or family.get("diameter_mm") or family.get("width_mm") or 0) or None
            height_m = float(item.get("heightM") or 0)
            area = _section_area_m2(shape, width_mm, depth_mm, diameter_mm)
            perimeter = _section_perimeter_m(shape, width_mm, depth_mm, diameter_mm)
            family_text = " ".join(str(family.get(k) or "") for k in ("material","concrete_grade","description","name"))
            concrete_member = bool(re.search(r"\breinforced\s+concrete\b|\bin[ -]?situ\s+concrete\b|(?:^|[^a-z])r\.?c\.?(?:[^a-z]|$)|\brcc\b|\bconcrete\b", family_text.lower()))
            volume = round(area * height_m, 4) if concrete_member and area is not None and height_m > 0 else None
            formwork = round(perimeter * height_m, 4) if concrete_member and perimeter is not None and height_m > 0 else None
            if shape == "polygonal" and concrete_member:
                # The browser editor currently carries the authoritative engine quantities
                # but not the full footprint polygon. Reuse them unless a later check sees
                # that the user changed the geometry/height.
                volume = float(item.get("concreteVolumeM3")) if item.get("concreteVolumeM3") is not None else volume
                formwork = float(item.get("formworkAreaM2")) if item.get("formworkAreaM2") is not None else formwork
            reinforcement = None
            reinforcement_source = "information_required" if concrete_member else "not_applicable_or_unresolved"
            if family.get("reinforcement_kg_per_column"):
                reinforcement, reinforcement_source = float(family["reinforcement_kg_per_column"]), "explicit_kg_per_column"
            elif family.get("reinforcement_rate_kg_per_m3") and volume is not None:
                reinforcement = round(float(family["reinforcement_rate_kg_per_m3"]) * volume, 3)
                reinforcement_source = "explicit_kg_per_m3"
            column_uuid = _safe_uuid(item.get("id"))
            existing = conn.execute("SELECT * FROM column_instance WHERE id=%s AND project_id=%s", (column_uuid, pid)).fetchone() if column_uuid else None
            status = str(item.get("status") or "ready")
            confirmed = status == "confirmed"
            viewport_id = str(item.get("viewportId") or ctx["column_viewport_id"])
            if existing:
                cid = str(existing["id"])
                geometry_changed = json.dumps(existing.get("bbox") or {}, sort_keys=True) != json.dumps(bbox, sort_keys=True)
                height_changed = abs(float(existing.get("height_mm") or 0)/1000.0 - height_m) > 1e-6
                if shape == "polygonal" and (geometry_changed or height_changed):
                    # We cannot safely recompute an edited irregular section from its bbox.
                    volume = None
                    formwork = None
                    reinforcement = None
                    reinforcement_source = "information_required" if concrete_member else "not_applicable_or_unresolved"
                conn.execute(
                    """UPDATE column_instance SET definition_id=%s,source_viewport_id=%s,bbox=%s,center=%s,shape=%s,width_mm=%s,depth_mm=%s,
                           diameter_mm=%s,height_mm=%s,height_source=%s,concrete_volume_m3=%s,formwork_area_m2=%s,reinforcement_kg=%s,
                           reinforcement_source=%s,geometry_user_modified=(geometry_user_modified OR %s),status=%s,user_confirmed=%s,updated_at=now()
                       WHERE id=%s""",
                    (family_id, viewport_id, Jsonb(bbox), Jsonb(center), shape, width_mm, depth_mm, diameter_mm, height_m*1000 if height_m else None,
                     "user" if height_changed else str(item.get("heightSource") or existing.get("height_source") or "unknown"), volume, formwork,
                     reinforcement, reinforcement_source, geometry_changed, "confirmed" if confirmed else status, confirmed, cid),
                )
            else:
                row = conn.execute(
                    """INSERT INTO column_instance(project_id,floor_id,source_viewport_id,source_key,definition_id,column_mark,generated_bbox,bbox,center,
                           shape,width_mm,depth_mm,diameter_mm,section_source,height_mm,height_source,concrete_volume_m3,formwork_area_m2,
                           reinforcement_kg,reinforcement_source,include_in_boq,geometry_user_modified,status,user_confirmed,confidence,source_evidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'user',%s,'user',%s,%s,%s,%s,true,true,%s,%s,1,%s) RETURNING id""",
                    (pid, floor_id, viewport_id, f"user:{index}:{hashlib.sha1(json.dumps(bbox,sort_keys=True).encode()).hexdigest()[:10]}", family_id,
                     item.get("columnMark") or family.get("code"), Jsonb(bbox), Jsonb(bbox), Jsonb(center), shape, width_mm, depth_mm, diameter_mm,
                     height_m*1000 if height_m else None, volume, formwork, reinforcement, reinforcement_source,
                     "confirmed" if confirmed else status, confirmed, Jsonb([{"kind":"user","text":"Column edited/drawn in Quanto"}])),
                ).fetchone()
                cid = str(row["id"])
            keep.add(cid)
        submitted = {value for item in columns if (value := _safe_uuid(item.get("id")))}
        preserve = submitted | keep
        if preserve:
            conn.execute("DELETE FROM column_instance WHERE project_id=%s AND NOT (id = ANY(%s::uuid[]))", (pid, list(preserve)))
        elif columns == []:
            conn.execute("DELETE FROM column_instance WHERE project_id=%s", (pid,))
        conn.execute(
            """INSERT INTO takeoff_ui_state(project_id,module,state_json,updated_at) VALUES (%s,'columns',%s,now())
               ON CONFLICT(project_id,module) DO UPDATE SET state_json=excluded.state_json,updated_at=now()""",
            (pid, Jsonb(payload.get("uiState") or {})),
        )
    if touched_floors:
        _publish_instance_facts(pid, sorted(touched_floors))
    return column_demo_state(pid)


def column_quantities(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    rows = fetch_all(
        """SELECT cd.id AS family_id,cd.code AS mark,cd.name,cd.description,cd.shape,cd.width_mm,cd.depth_mm,cd.diameter_mm,cd.material,
                  cd.concrete_grade,cd.reinforcement_description,cd.nrm_work_section,
                  COALESCE(SUM(CASE WHEN ci.include_in_boq THEN tf.typical_factor ELSE 0 END),0) AS count_nr,
                  COALESCE(SUM(CASE WHEN ci.include_in_boq THEN COALESCE(ci.concrete_volume_m3,0)*tf.typical_factor ELSE 0 END),0) AS concrete_m3,
                  COALESCE(SUM(CASE WHEN ci.include_in_boq THEN COALESCE(ci.formwork_area_m2,0)*tf.typical_factor ELSE 0 END),0) AS formwork_m2,
                  SUM(CASE WHEN ci.include_in_boq AND ci.reinforcement_kg IS NOT NULL THEN ci.reinforcement_kg*tf.typical_factor ELSE 0 END) AS reinforcement_kg,
                  bool_and(CASE WHEN ci.id IS NULL THEN true ELSE ci.user_confirmed END) AS confirmed
           FROM column_definition cd LEFT JOIN column_instance ci ON ci.definition_id=cd.id AND ci.status<>'deleted'
           LEFT JOIN takeoff_floor tf ON tf.id=ci.floor_id
           WHERE cd.project_id=%s AND cd.status<>'deleted' AND cd.code<>'UNASSIGNED-COLUMN'
           GROUP BY cd.id,cd.code,cd.name,cd.description,cd.shape,cd.width_mm,cd.depth_mm,cd.diameter_mm,cd.material,cd.concrete_grade,
                    cd.reinforcement_description,cd.nrm_work_section
           HAVING COALESCE(SUM(CASE WHEN ci.include_in_boq THEN tf.typical_factor ELSE 0 END),0)>0
           ORDER BY cd.code""",
        (pid,),
    )
    for row in rows:
        unresolved = fetch_one(
            """SELECT count(*) AS n FROM column_instance ci JOIN column_definition cd ON cd.id=ci.definition_id
               WHERE ci.project_id=%s AND cd.id=%s AND ci.include_in_boq=true AND ci.reinforcement_kg IS NULL AND ci.status<>'deleted'""",
            (pid, str(row["family_id"])),
        )
        row["reinforcement_information_required"] = bool(unresolved and int(unresolved["n"] or 0) > 0)
        concrete = bool(row.get("concrete_grade") or re.search(r"\bconcrete\b|\brcc\b|(?:^|[^a-z])r\.?c\.?(?:[^a-z]|$)", str(row.get("material") or "").lower()))
        row["work_section"] = row.get("nrm_work_section") or ("In-situ concrete / columns" if concrete else "Columns / structural frame")
    review = fetch_one("SELECT count(*) AS n FROM column_review_item WHERE project_id=%s AND resolved=false", (pid,))
    return {"columns": rows, "unresolved_review_items": int(review["n"]) if review else 0}
