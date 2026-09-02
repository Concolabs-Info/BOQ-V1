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
from ...services.ai.codex_account import codex_account_status
from .harness.model_client import HarnessModelClient
from .harness.evaluator import evaluate_element
from .harness.facts import publish_element_facts
from .harness.runtime import run_element_harness
from ...services.pdf.media import ensure_viewport_crop
from ...services.storage.paths import project_root
from .common import (
    PALETTE,
    content_hash,
    ensure_takeoff_floors,
    extract_viewport_text,
    polygon_area_px,
    project_text_evidence,
    require_frozen_project,
    source_mm_per_pixel,
)
from .model_schemas import StairRampCatalogOutput, StairRampGeometryOutput, StairRampVerticalOutput
from .prompts import (
    STAIR_RAMP_CATALOG_PROMPT,
    STAIR_RAMP_CATALOG_SYSTEM,
    STAIR_RAMP_GEOMETRY_PROMPT,
    STAIR_RAMP_SYSTEM,
    STAIR_RAMP_VERTICAL_PROMPT,
    STAIR_RAMP_VERTICAL_SYSTEM,
)

STAIR_RAMP_PROVIDER = "codex-account"
STAIR_RAMP_MODEL_LABEL = "ChatGPT/Codex account"
STAIR_RAMP_CACHE_VERSION = "quanto-stairs-ramps-account-cache-v1"
STAIR_RAMP_PROMPT_VERSION = "stairs-ramps-account-v1"
_LOCKS: dict[str, threading.Lock] = {}
_LOCK_GUARD = threading.Lock()


def _runtime_dir(project_id: UUID | str) -> Path:
    path = project_root(project_id) / "stairs-ramps"
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
            (
                project_id,
                storey_id,
                viewport_id,
                storey["name"],
                storey["level_index"],
                _typical_factor(storey.get("typical_group")),
                ctx["crop_width_px"],
                ctx["crop_height_px"],
                mmpp,
                verified,
                ctx["crop_version"],
            ),
        ).fetchone()
    return dict(created)


def _contexts(project_id: UUID | str) -> list[dict[str, Any]]:
    """One geometry context for each Scope-approved stair/ramp plan viewport."""
    from .scope.engine import get_scope

    pid = str(project_id)
    # Populate normal level identities first without changing the Floor module's source authority.
    ensure_takeoff_floors(pid)
    scope = get_scope(pid, "stairs-ramps", auto_run=True)
    if scope.get("status") == "blocked":
        message = next(
            (x.get("message") for x in scope.get("coverage_gaps", []) if x.get("severity") == "blocked"),
            "Stairs & Ramps Scope is blocked",
        )
        raise RuntimeError(f"Stairs & Ramps Scope is not ready: {message}")

    contexts: list[dict[str, Any]] = []
    for level in scope.get("level_scopes") or []:
        storey_id = str(level.get("level_ref") or "")
        for viewport_id_value in level.get("primary_viewport_ids") or []:
            viewport_id = str(viewport_id_value)
            floor = _ensure_floor_identity(pid, storey_id, viewport_id)
            if not floor:
                continue
            crop_path, vp_ctx = ensure_viewport_crop(viewport_id)
            mmpp, verified = source_mm_per_pixel(viewport_id)
            storey = fetch_one("SELECT height_mm,name,level_index FROM storey WHERE id=%s", (storey_id,)) or {}
            contexts.append(
                {
                    **floor,
                    "stair_viewport_id": viewport_id,
                    "crop_path": Path(crop_path),
                    "drawing_width": int(vp_ctx["crop_width_px"]),
                    "drawing_height": int(vp_ctx["crop_height_px"]),
                    "stair_crop_version": int(vp_ctx["crop_version"]),
                    "mm_per_pixel": mmpp,
                    "scale_verified": verified,
                    "storey_height_mm": float(storey["height_mm"]) if storey.get("height_mm") else None,
                    "scope_status": scope.get("status"),
                    "vertical_coverage": level.get("vertical_coverage") or {},
                }
            )
    return contexts


def _source_hash(project: dict[str, Any], ctx: dict[str, Any]) -> str:
    return content_hash(
        {
            "cache_version": STAIR_RAMP_CACHE_VERSION,
            "prompt_version": STAIR_RAMP_PROMPT_VERSION,
            "frame_version": project.get("frame_version"),
            "viewport_id": str(ctx["stair_viewport_id"]),
            "crop_version": int(ctx.get("stair_crop_version") or 0),
            "drawing_width": int(ctx["drawing_width"]),
            "drawing_height": int(ctx["drawing_height"]),
            "mm_per_pixel": float(ctx["mm_per_pixel"]) if ctx.get("mm_per_pixel") else None,
            "crop_sha256": _file_sha256(Path(ctx["crop_path"])),
        }
    )


def _load_geometry_cache(project_id: str, floor_id: str, viewport_id: str, source_hash: str) -> StairRampGeometryOutput | None:
    candidates = [_result_path(project_id, floor_id, viewport_id)]
    result_dir = _runtime_dir(project_id) / "results"
    if result_dir.exists():
        candidates.extend(path for path in result_dir.glob("*.json") if path not in candidates)
    for path in candidates:
        payload = _read_json(path, {})
        if payload.get("schema_version") != STAIR_RAMP_CACHE_VERSION or payload.get("source_hash") != source_hash:
            continue
        try:
            return StairRampGeometryOutput.model_validate(payload.get("geometry") or {})
        except Exception:
            continue
    return None


def _save_geometry_cache(project_id: str, floor_id: str, viewport_id: str, source_hash: str, quality: str, output: StairRampGeometryOutput) -> None:
    _write_json(
        _result_path(project_id, floor_id, viewport_id),
        {
            "schema_version": STAIR_RAMP_CACHE_VERSION,
            "provider": STAIR_RAMP_PROVIDER,
            "source_hash": source_hash,
            "quality": quality,
            "geometry": output.model_dump(mode="json"),
        },
    )


def _catalog_hash(project: dict[str, Any], text: str) -> str:
    return content_hash(
        {
            "cache_version": STAIR_RAMP_CACHE_VERSION,
            "prompt_version": STAIR_RAMP_PROMPT_VERSION,
            "frame_version": project.get("frame_version"),
            "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        }
    )


def _load_catalog_cache(project_id: str, value_hash: str) -> StairRampCatalogOutput | None:
    payload = _read_json(_catalog_path(project_id), {})
    if payload.get("schema_version") != STAIR_RAMP_CACHE_VERSION or payload.get("catalog_hash") != value_hash:
        return None
    try:
        return StairRampCatalogOutput.model_validate(payload.get("catalog") or {})
    except Exception:
        return None


def _save_catalog_cache(project_id: str, value_hash: str, quality: str, output: StairRampCatalogOutput) -> None:
    _write_json(
        _catalog_path(project_id),
        {
            "schema_version": STAIR_RAMP_CACHE_VERSION,
            "provider": STAIR_RAMP_PROVIDER,
            "catalog_hash": value_hash,
            "quality": quality,
            "catalog": output.model_dump(mode="json"),
        },
    )


def _vertical_source_hash(project: dict[str, Any], viewport_id: str) -> tuple[str, Path]:
    crop_path, ctx = ensure_viewport_crop(viewport_id)
    value = content_hash(
        {
            "cache_version": STAIR_RAMP_CACHE_VERSION,
            "prompt_version": STAIR_RAMP_PROMPT_VERSION,
            "frame_version": project.get("frame_version"),
            "viewport_id": viewport_id,
            "crop_version": int(ctx.get("crop_version") or 0),
            "crop_sha256": _file_sha256(Path(crop_path)),
        }
    )
    return value, Path(crop_path)


def _load_vertical_cache(project_id: str, viewport_id: str, source_hash: str) -> StairRampVerticalOutput | None:
    payload = _read_json(_vertical_path(project_id, viewport_id), {})
    if payload.get("schema_version") != STAIR_RAMP_CACHE_VERSION or payload.get("source_hash") != source_hash:
        return None
    try:
        return StairRampVerticalOutput.model_validate(payload.get("output") or {})
    except Exception:
        return None


def _save_vertical_cache(project_id: str, viewport_id: str, source_hash: str, quality: str, output: StairRampVerticalOutput) -> None:
    _write_json(
        _vertical_path(project_id, viewport_id),
        {
            "schema_version": STAIR_RAMP_CACHE_VERSION,
            "provider": STAIR_RAMP_PROVIDER,
            "source_hash": source_hash,
            "quality": quality,
            "output": output.model_dump(mode="json"),
        },
    )


def _validate_points(points: list[Any], width: int, height: int, minimum: int) -> None:
    if len(points) < minimum:
        raise RuntimeError("Stairs/Ramps model returned incomplete geometry")
    for point in points:
        x = float(point.x if hasattr(point, "x") else point["x"])
        y = float(point.y if hasattr(point, "y") else point["y"])
        if x < 0 or y < 0 or x > width or y > height:
            raise RuntimeError("Stairs/Ramps model returned coordinates outside the source crop")


def _validate_geometry(output: StairRampGeometryOutput) -> None:
    for item in output.items:
        _validate_points(item.outer_boundary, output.source_width_px, output.source_height_px, 3)
        for hole in item.holes:
            _validate_points(hole, output.source_width_px, output.source_height_px, 3)
        for run in item.runs:
            _validate_points(run.polygon, output.source_width_px, output.source_height_px, 3)
            _validate_points(run.centerline, output.source_width_px, output.source_height_px, 2)
        for landing in item.landings:
            _validate_points(landing.polygon, output.source_width_px, output.source_height_px, 3)
        for rail in item.rail_segments:
            _validate_points(rail.line, output.source_width_px, output.source_height_px, 2)


def _point_dicts(points: list[Any]) -> list[dict[str, float]]:
    return [{"x": float(p.x if hasattr(p, "x") else p["x"]), "y": float(p.y if hasattr(p, "y") else p["y"])} for p in points]


def _poly_area_m2(points: list[Any], holes: list[list[Any]], mmpp: float | None) -> float | None:
    if not mmpp:
        return None
    outer = polygon_area_px(_point_dicts(points))
    inner = sum(polygon_area_px(_point_dicts(hole)) for hole in holes)
    return max(0.0, outer - inner) * mmpp * mmpp / 1_000_000.0


def _line_length_px(points: list[Any]) -> float:
    values = _point_dicts(points)
    return sum(math.hypot(b["x"] - a["x"], b["y"] - a["y"]) for a, b in zip(values, values[1:]))


def _line_length_m(points: list[Any], mmpp: float | None) -> float | None:
    return _line_length_px(points) * mmpp / 1000.0 if mmpp else None


def _angle_from_dimensions(riser_mm: float | None, tread_mm: float | None) -> float | None:
    if not riser_mm or not tread_mm or riser_mm <= 0 or tread_mm <= 0:
        return None
    return math.degrees(math.atan(riser_mm / tread_mm))


def _vertical_matches(item: Any, ctx: dict[str, Any], observations: list[Any]) -> list[Any]:
    mark = _norm(item.type_mark)
    level = _norm(ctx.get("name"))
    exact: list[Any] = []
    generic: list[Any] = []
    for obs in observations:
        if obs.kind not in {"unknown", item.kind}:
            continue
        target = _norm(obs.target_mark)
        obs_level = _norm(obs.level_label)
        if target and mark and (target == mark or target in mark or mark in target):
            exact.append(obs)
            continue
        if obs_level and level and (obs_level == level or obs_level in level or level in obs_level):
            exact.append(obs)
            continue
        if not target and not obs_level:
            generic.append(obs)
    return exact or generic


def _first_value(observations: list[Any], field: str) -> Any:
    ranked = sorted(observations, key=lambda x: float(getattr(x, "confidence", 0) or 0), reverse=True)
    for obs in ranked:
        value = getattr(obs, field, None)
        if value not in (None, "", "unknown"):
            return value
    return None


def _ensure_fallback_families(project_id: str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    with transaction() as conn:
        stair = conn.execute(
            """INSERT INTO stair_ramp_family(project_id,code,name,kind,description,display_colour,status,confidence)
               VALUES (%s,'UNASSIGNED-STAIR','Unassigned stair — review required','stair','Stair type/construction is unresolved','#7c3aed','active',0)
               ON CONFLICT(project_id,code) DO UPDATE SET updated_at=now() RETURNING *""",
            (project_id,),
        ).fetchone()
        ramp = conn.execute(
            """INSERT INTO stair_ramp_family(project_id,code,name,kind,description,display_colour,status,confidence)
               VALUES (%s,'UNASSIGNED-RAMP','Unassigned ramp — review required','ramp','Ramp type/construction is unresolved','#2563eb','active',0)
               ON CONFLICT(project_id,code) DO UPDATE SET updated_at=now() RETURNING *""",
            (project_id,),
        ).fetchone()
        rail = conn.execute(
            """INSERT INTO balustrade_family(project_id,code,name,description,display_colour,status,confidence)
               VALUES (%s,'UNASSIGNED-RAIL','Rail / balustrade — review required','Balustrade type/height is unresolved','#f59e0b','active',0)
               ON CONFLICT(project_id,code) DO UPDATE SET updated_at=now() RETURNING *""",
            (project_id,),
        ).fetchone()
    return dict(stair), dict(ramp), dict(rail)


def _upsert_catalog(project_id: str, catalog: StairRampCatalogOutput) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    family_rows: dict[str, dict[str, Any]] = {}
    rail_rows: dict[str, dict[str, Any]] = {}
    with transaction() as conn:
        for index, item in enumerate(catalog.families):
            code = item.code.strip() or f"SR-{index+1:02d}"
            row = conn.execute(
                """INSERT INTO stair_ramp_family(project_id,code,name,kind,description,construction_type,material,width_mm,
                       riser_mm,tread_mm,waist_mm,landing_thickness_mm,support_condition,concrete_profile,tread_finish_code,
                       riser_finish_code,string_finish_code,ramp_finish_code,nrm_work_section,display_colour,source_evidence,
                       confidence,status,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active',now())
                   ON CONFLICT(project_id,code) DO UPDATE SET name=excluded.name,kind=excluded.kind,description=excluded.description,
                     construction_type=excluded.construction_type,material=excluded.material,width_mm=excluded.width_mm,
                     riser_mm=excluded.riser_mm,tread_mm=excluded.tread_mm,waist_mm=excluded.waist_mm,
                     landing_thickness_mm=excluded.landing_thickness_mm,support_condition=excluded.support_condition,
                     concrete_profile=excluded.concrete_profile,tread_finish_code=excluded.tread_finish_code,
                     riser_finish_code=excluded.riser_finish_code,string_finish_code=excluded.string_finish_code,
                     ramp_finish_code=excluded.ramp_finish_code,nrm_work_section=excluded.nrm_work_section,
                     source_evidence=excluded.source_evidence,confidence=excluded.confidence,updated_at=now()
                   RETURNING *""",
                (
                    project_id,
                    code,
                    item.name,
                    item.kind,
                    item.description,
                    item.construction_type,
                    item.material,
                    item.width_mm,
                    item.riser_mm,
                    item.tread_mm,
                    item.waist_mm,
                    item.landing_thickness_mm,
                    item.support_condition,
                    item.concrete_profile,
                    item.tread_finish_code,
                    item.riser_finish_code,
                    item.string_finish_code,
                    item.ramp_finish_code,
                    item.nrm_work_section,
                    PALETTE[index % len(PALETTE)],
                    Jsonb([{"kind": "specification", "text": item.source_text}]),
                    item.confidence,
                ),
            ).fetchone()
            family_rows[_norm(code)] = dict(row)
        for index, item in enumerate(catalog.balustrades):
            code = item.code.strip() or f"BR-{index+1:02d}"
            row = conn.execute(
                """INSERT INTO balustrade_family(project_id,code,name,description,material,height_mm,finish,display_colour,
                       source_evidence,confidence,status,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active',now())
                   ON CONFLICT(project_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,
                     material=excluded.material,height_mm=excluded.height_mm,finish=excluded.finish,
                     source_evidence=excluded.source_evidence,confidence=excluded.confidence,updated_at=now()
                   RETURNING *""",
                (
                    project_id,
                    code,
                    item.name,
                    item.description,
                    item.material,
                    item.height_mm,
                    item.finish,
                    "#f59e0b",
                    Jsonb([{"kind": "specification", "text": item.source_text}]),
                    item.confidence,
                ),
            ).fetchone()
            rail_rows[_norm(code)] = dict(row)
    fallback_stair, fallback_ramp, fallback_rail = _ensure_fallback_families(project_id)
    family_rows.setdefault(_norm(fallback_stair["code"]), fallback_stair)
    family_rows.setdefault(_norm(fallback_ramp["code"]), fallback_ramp)
    rail_rows.setdefault(_norm(fallback_rail["code"]), fallback_rail)
    return family_rows, rail_rows


def _family_for_item(
    project_id: str,
    item: Any,
    rows: dict[str, dict[str, Any]],
    catalog: StairRampCatalogOutput | None = None,
    ctx: dict[str, Any] | None = None,
) -> dict[str, Any]:
    mark = _norm(item.type_mark)
    if mark:
        for key, row in rows.items():
            if (key == mark or key in mark or mark in key) and row.get("kind") == item.kind:
                return row
        # Preserve a visible mark even when the schedule/specification has not defined it.
        code = str(item.type_mark).strip()[:80]
        with transaction() as conn:
            row = conn.execute(
                """INSERT INTO stair_ramp_family(project_id,code,name,kind,description,construction_type,display_colour,
                       source_evidence,confidence,status)
                   VALUES (%s,%s,%s,%s,%s,'unknown',%s,%s,%s,'active')
                   ON CONFLICT(project_id,code) DO UPDATE SET updated_at=now() RETURNING *""",
                (
                    project_id,
                    code,
                    code,
                    item.kind,
                    "Detected type mark; construction definition requires evidence",
                    "#2563eb" if item.kind == "ramp" else "#7c3aed",
                    Jsonb([{"kind": "plan", "text": f"Detected mark {code}"}]),
                    item.confidence,
                ),
            ).fetchone()
        resolved = dict(row)
        rows[_norm(code)] = resolved
        return resolved

    # Apply only explicit catalog location/level rules. This avoids assigning a generic
    # stair family merely because it is the only family in a project.
    if catalog is not None:
        level_haystack = " ".join(
            _norm(value)
            for value in [
                (ctx or {}).get("name"),
                item.start_level_label,
                item.end_level_label,
            ]
            if value
        )
        location_haystack = " ".join(_norm(value) for value in [item.name, item.finish_hint, item.construction_hint] if value)
        ranked = sorted(catalog.family_rules, key=lambda rule: float(rule.confidence or 0), reverse=True)
        for rule in ranked:
            level_terms = [_norm(value) for value in rule.level_labels if _norm(value)]
            location_terms = [_norm(value) for value in rule.location_labels if _norm(value)]
            level_ok = not level_terms or any(term in level_haystack or level_haystack in term for term in level_terms if level_haystack)
            location_ok = not location_terms or any(term in location_haystack or location_haystack in term for term in location_terms if location_haystack)
            if not (level_ok and location_ok):
                continue
            row = rows.get(_norm(rule.family_code))
            if row and row.get("kind") == item.kind:
                return row

    fallback_key = _norm("UNASSIGNED-RAMP" if item.kind == "ramp" else "UNASSIGNED-STAIR")
    return rows[fallback_key]


def _rail_family_for_item(item: Any, vertical: list[Any], rows: dict[str, dict[str, Any]]) -> dict[str, Any]:
    marks = [x.rail_mark for x in item.rail_segments if x.rail_mark]
    vmark = _first_value(vertical, "rail_mark")
    if vmark:
        marks.append(vmark)
    for mark_value in marks:
        mark = _norm(mark_value)
        for key, row in rows.items():
            if key == mark or (mark and (key in mark or mark in key)):
                return row
    return rows[_norm("UNASSIGNED-RAIL")]


def _resolved_dimensions(item: Any, family: dict[str, Any], vertical: list[Any], ctx: dict[str, Any]) -> dict[str, Any]:
    width_from_plan = None
    if item.width_px and ctx.get("mm_per_pixel"):
        width_from_plan = float(item.width_px) * float(ctx["mm_per_pixel"])
    if width_from_plan is None:
        widths = [float(run.width_px) * float(ctx["mm_per_pixel"]) for run in item.runs if run.width_px and ctx.get("mm_per_pixel")]
        width_from_plan = sum(widths) / len(widths) if widths else None

    rise = item.rise_mm_visible
    rise_source = "plan_note" if rise else "unknown"
    if rise is None and item.start_level_elevation_mm_visible is not None and item.end_level_elevation_mm_visible is not None:
        rise = abs(float(item.end_level_elevation_mm_visible) - float(item.start_level_elevation_mm_visible))
        rise_source = "plan_levels"
    if rise is None:
        rise = _first_value(vertical, "rise_mm")
        if rise is not None:
            rise_source = "section_detail"
    if rise is None:
        start_level = _first_value(vertical, "start_level_elevation_mm")
        end_level = _first_value(vertical, "end_level_elevation_mm")
        if start_level is not None and end_level is not None:
            rise = abs(float(end_level) - float(start_level))
            rise_source = "section_levels"
    if not rise and item.connects_adjacent_storey and ctx.get("storey_height_mm"):
        rise = float(ctx["storey_height_mm"])
        rise_source = "confirmed_storey_height"

    slope_deg = item.slope_degrees_visible or _first_value(vertical, "slope_degrees")
    slope_pct = item.slope_percent_visible or _first_value(vertical, "slope_percent")
    if not slope_deg and slope_pct:
        slope_deg = math.degrees(math.atan(float(slope_pct) / 100.0))
    if not slope_pct and slope_deg:
        slope_pct = math.tan(math.radians(float(slope_deg))) * 100.0

    construction = _first_value(vertical, "construction_type") or family.get("construction_type") or "unknown"
    support = _first_value(vertical, "support_condition") or family.get("support_condition") or "unknown"
    return {
        "width_mm": width_from_plan or _first_value(vertical, "width_mm") or family.get("width_mm"),
        "rise_mm": rise,
        "rise_source": rise_source,
        "riser_mm": _first_value(vertical, "riser_mm") or family.get("riser_mm"),
        "tread_mm": _first_value(vertical, "tread_mm") or family.get("tread_mm"),
        "waist_mm": _first_value(vertical, "waist_mm") or family.get("waist_mm"),
        "landing_thickness_mm": _first_value(vertical, "landing_thickness_mm") or family.get("landing_thickness_mm") or family.get("waist_mm"),
        "slope_degrees": slope_deg,
        "slope_percent": slope_pct,
        "construction_type": construction,
        "support_condition": support,
        "concrete_profile": family.get("concrete_profile") or "unknown",
        "tread_finish_code": _first_value(vertical, "tread_finish_code") or family.get("tread_finish_code"),
        "riser_finish_code": _first_value(vertical, "riser_finish_code") or family.get("riser_finish_code"),
        "string_finish_code": _first_value(vertical, "string_finish_code") or family.get("string_finish_code"),
        "ramp_finish_code": _first_value(vertical, "ramp_finish_code") or family.get("ramp_finish_code"),
        "riser_count_vertical": _first_value(vertical, "riser_count"),
        "tread_count_vertical": _first_value(vertical, "tread_count"),
    }


def calculate_stair_ramp_quantities(item: Any, mm_per_pixel: float | None, dims: dict[str, Any]) -> tuple[dict[str, Any], list[tuple[str, str]]]:
    """Deterministic QS quantities from model geometry + supported dimensions.

    The model identifies geometry/evidence; this function owns all official maths.
    Unsupported reinforcement, side-formwork and string/apron extents remain unresolved.
    """
    reviews: list[tuple[str, str]] = []
    outline_area = _poly_area_m2(item.outer_boundary, item.holes, mm_per_pixel)
    landing_area = 0.0
    for landing in item.landings:
        if landing.include_in_element and landing.landing_type not in {"bottom", "top"}:
            landing_area += _poly_area_m2(landing.polygon, [], mm_per_pixel) or 0.0

    stair_runs = [run for run in item.runs if run.run_kind == "stair_flight"]
    ramp_runs = [run for run in item.runs if run.run_kind == "ramp_run"]
    stair_projected = sum((_poly_area_m2(run.polygon, [], mm_per_pixel) or 0.0) for run in stair_runs)
    ramp_projected = sum((_poly_area_m2(run.polygon, [], mm_per_pixel) or 0.0) for run in ramp_runs)
    stair_run_m = sum((_line_length_m(run.centerline, mm_per_pixel) or 0.0) for run in stair_runs)
    ramp_run_m = sum((_line_length_m(run.centerline, mm_per_pixel) or 0.0) for run in ramp_runs)

    stair_angle = _angle_from_dimensions(dims.get("riser_mm"), dims.get("tread_mm"))
    if stair_angle is None and dims.get("rise_mm") and stair_run_m > 0:
        stair_angle = math.degrees(math.atan((float(dims["rise_mm"]) / 1000.0) / stair_run_m))
    ramp_angle = float(dims["slope_degrees"]) if dims.get("slope_degrees") else None
    if ramp_angle is None and dims.get("rise_mm") and ramp_run_m > 0:
        ramp_angle = math.degrees(math.atan((float(dims["rise_mm"]) / 1000.0) / ramp_run_m))

    stair_surface = stair_projected / math.cos(math.radians(stair_angle)) if stair_projected and stair_angle is not None and stair_angle < 89 else None
    ramp_surface = ramp_projected / math.cos(math.radians(ramp_angle)) if ramp_projected and ramp_angle is not None and ramp_angle < 89 else None

    visible_risers = [run.visible_riser_count for run in stair_runs if run.visible_riser_count is not None]
    visible_treads = [run.visible_tread_count for run in stair_runs if run.visible_tread_count is not None]
    riser_count = int(dims.get("riser_count_vertical")) if dims.get("riser_count_vertical") else (sum(visible_risers) if visible_risers else None)
    tread_count = int(dims.get("tread_count_vertical")) if dims.get("tread_count_vertical") else (sum(visible_treads) if visible_treads else None)
    if riser_count is None and dims.get("rise_mm") and dims.get("riser_mm"):
        proposed = max(1, round(float(dims["rise_mm"]) / float(dims["riser_mm"])))
        actual = float(dims["rise_mm"]) / proposed
        if abs(actual - float(dims["riser_mm"])) <= max(5.0, float(dims["riser_mm"]) * 0.03):
            riser_count = proposed
    if tread_count is None and stair_run_m > 0 and dims.get("tread_mm"):
        proposed = round(stair_run_m * 1000.0 / float(dims["tread_mm"]))
        if proposed > 0:
            tread_count = proposed

    sloping_surface = (stair_surface or 0.0) + (ramp_surface or 0.0)
    construction = str(dims.get("construction_type") or "unknown")
    concrete_volume = None
    formwork = None
    if construction == "in_situ_concrete":
        waist_mm = dims.get("waist_mm")
        landing_thickness = dims.get("landing_thickness_mm") or waist_mm
        if waist_mm and (stair_surface is not None or ramp_surface is not None):
            concrete_volume = 0.0
            if stair_surface is not None:
                concrete_volume += stair_surface * float(waist_mm) / 1000.0
                if dims.get("concrete_profile") == "waist_slab_with_steps" and dims.get("riser_mm"):
                    # Conventional cast step wedges above a sloping waist: 1/2 * projected flight area * one riser height.
                    concrete_volume += 0.5 * stair_projected * float(dims["riser_mm"]) / 1000.0
            if ramp_surface is not None:
                concrete_volume += ramp_surface * float(waist_mm) / 1000.0
            if landing_area and landing_thickness:
                concrete_volume += landing_area * float(landing_thickness) / 1000.0
        else:
            reviews.append(("concrete_dimensions_unresolved", "In-situ concrete is indicated but waist/slab thickness or sloping geometry is unresolved, so concrete volume was not invented."))

        support = str(dims.get("support_condition") or "unknown")
        if item.kind == "stair":
            if support == "ground_bearing":
                formwork = 0.0
            elif support in {"suspended", "mixed"} and stair_surface is not None:
                formwork = stair_surface + landing_area
            elif stair_surface is None:
                reviews.append(("stair_soffit_unresolved", "Stair slope is unresolved, so soffit formwork cannot be calculated safely."))
            else:
                reviews.append(("stair_formwork_basis_unresolved", "Stair support condition is unresolved, so soffit formwork was not assumed."))
        elif item.kind == "ramp":
            if support == "ground_bearing":
                formwork = 0.0
            elif support in {"suspended", "mixed"} and ramp_surface is not None:
                formwork = ramp_surface + landing_area
            else:
                reviews.append(("ramp_formwork_basis_unresolved", "Ramp support condition is unresolved, so soffit formwork was not assumed."))

    width_m = float(dims["width_mm"]) / 1000.0 if dims.get("width_mm") else None
    if width_m is None and stair_run_m > 0 and stair_projected > 0:
        width_m = stair_projected / stair_run_m

    tread_finish_area = stair_projected + landing_area if dims.get("tread_finish_code") and item.kind == "stair" else None
    riser_finish_area = width_m * float(dims["rise_mm"]) / 1000.0 if dims.get("riser_finish_code") and width_m and dims.get("rise_mm") else None
    if dims.get("riser_finish_code") and riser_finish_area is None:
        reviews.append(("riser_finish_extent_unresolved", "A riser finish is specified but stair width/rise is unresolved, so riser finish area was not guessed."))
    ramp_finish_area = ((ramp_surface or 0.0) + landing_area) if dims.get("ramp_finish_code") and item.kind == "ramp" and ramp_surface is not None else None
    if dims.get("ramp_finish_code") and item.kind == "ramp" and ramp_finish_area is None:
        reviews.append(("ramp_finish_slope_unresolved", "A ramp finish is specified but the ramp slope is unresolved, so true surface area was not guessed."))
    string_finish_area = None
    if dims.get("string_finish_code"):
        reviews.append(("string_apron_extent_unresolved", "A stair string/apron finish is specified, but no supported side-profile extent is available. It remains information required."))

    run_angles = {run.run_id: (stair_angle if run.run_kind == "stair_flight" else ramp_angle) for run in item.runs}
    balustrade_length = 0.0
    rail_unresolved = False
    for rail in item.rail_segments:
        projected = _line_length_m(rail.line, mm_per_pixel)
        if projected is None:
            continue
        angle = run_angles.get(rail.host_run_id) if rail.host_run_id else None
        if rail.segment_kind == "sloping":
            if angle is not None and angle < 89:
                balustrade_length += projected / math.cos(math.radians(angle))
            else:
                balustrade_length += projected
                rail_unresolved = True
        else:
            balustrade_length += projected
    if rail_unresolved:
        reviews.append(("balustrade_slope_unresolved", "A sloping balustrade edge was found but its stair/ramp slope is unresolved. Its plan length is retained for review, not treated as a confirmed true length."))

    if item.kind == "stair" and dims.get("rise_mm") is None:
        reviews.append(("stair_rise_unresolved", "Stair rise is unresolved. Storey height was used only when the drawing explicitly supports an adjacent-storey connection."))
    if item.kind == "stair" and (dims.get("riser_mm") is None or dims.get("tread_mm") is None):
        reviews.append(("stair_step_dimensions_unresolved", "Riser/tread dimensions are unresolved; step counts and sloping quantities remain reviewable rather than assumed."))
    if item.kind == "ramp" and ramp_angle is None:
        reviews.append(("ramp_slope_unresolved", "Ramp gradient/slope is unresolved, so true sloping area was not invented."))
    if construction == "unknown":
        reviews.append(("construction_unresolved", "Stair/ramp construction type is unresolved. Concrete, formwork and reinforcement quantities were not assumed."))

    quantity_status = "ready" if not reviews else "needs_review"
    values = {
        "plan_area_m2": round(outline_area, 4) if outline_area is not None else None,
        "sloping_surface_area_m2": round(sloping_surface, 4) if sloping_surface > 0 else None,
        "intermediate_landing_area_m2": round(landing_area, 4),
        "concrete_volume_m3": round(concrete_volume, 4) if concrete_volume is not None else None,
        "formwork_soffit_m2": round(formwork, 4) if formwork is not None else None,
        "tread_finish_area_m2": round(tread_finish_area, 4) if tread_finish_area is not None else None,
        "riser_finish_area_m2": round(riser_finish_area, 4) if riser_finish_area is not None else None,
        "string_apron_finish_area_m2": string_finish_area,
        "ramp_finish_area_m2": round(ramp_finish_area, 4) if ramp_finish_area is not None else None,
        "balustrade_length_m": round(balustrade_length, 4) if item.rail_segments else 0.0,
        "flight_count": len(stair_runs) if item.kind == "stair" else len(ramp_runs),
        "riser_count": riser_count,
        "tread_count": tread_count,
        "slope_degrees": round(stair_angle if item.kind == "stair" and stair_angle is not None else ramp_angle, 4) if (stair_angle if item.kind == "stair" else ramp_angle) is not None else None,
        "slope_percent": round(math.tan(math.radians(stair_angle if item.kind == "stair" else ramp_angle)) * 100.0, 4) if (stair_angle if item.kind == "stair" else ramp_angle) is not None else None,
        "quantity_status": quantity_status,
        "reinforcement_status": "information_required",
    }
    return values, reviews


def _catalog(project_id: str, project: dict[str, Any], quality: str, client: HarnessModelClient) -> StairRampCatalogOutput:
    text = project_text_evidence(project_id)
    if not text.strip():
        return StairRampCatalogOutput()
    value_hash = _catalog_hash(project, text)
    cached = _load_catalog_cache(project_id, value_hash)
    if cached is not None:
        return cached
    output = client.parse_text(
        STAIR_RAMP_CATALOG_PROMPT.format(spec_text=text),
        StairRampCatalogOutput,
        system=STAIR_RAMP_CATALOG_SYSTEM,
        quality=quality,
    )
    _save_catalog_cache(project_id, value_hash, quality, output)
    return output


def _supporting_vertical_outputs(project_id: str, project: dict[str, Any], quality: str, client: HarnessModelClient) -> list[Any]:
    from .scope.engine import get_scope

    scope = get_scope(project_id, "stairs-ramps", auto_run=True)
    ids: list[str] = []
    for item in scope.get("selected_viewports") or []:
        if item.get("role") in {"supporting_vertical", "supporting_detail"}:
            viewport_id = str(item.get("viewport_id") or "")
            if viewport_id and viewport_id not in ids:
                ids.append(viewport_id)
    storeys = fetch_all("SELECT name,level_index,height_mm FROM storey WHERE project_id=%s ORDER BY level_index", (project_id,))
    storey_text = "\n".join(f"{x.get('level_index')}: {x.get('name')} ({x.get('height_mm') or 'height unresolved'} mm)" for x in storeys)
    observations: list[Any] = []
    for viewport_id in ids:
        source_hash, crop_path = _vertical_source_hash(project, viewport_id)
        output = _load_vertical_cache(project_id, viewport_id, source_hash)
        if output is None:
            words = extract_viewport_text(viewport_id)
            output = client.parse_image(
                crop_path,
                STAIR_RAMP_VERTICAL_PROMPT.format(
                    storeys=storey_text,
                    context="\n".join(f"{x['text']} @ {x['bbox']}" for x in words),
                ),
                StairRampVerticalOutput,
                system=STAIR_RAMP_VERTICAL_SYSTEM,
                quality=quality,
            )
            _save_vertical_cache(project_id, viewport_id, source_hash, quality, output)
        observations.extend(output.observations)
    return observations


def _insert_geometry(project_id: str, ctx: dict[str, Any], geometry: StairRampGeometryOutput, catalog: StairRampCatalogOutput, observations: list[Any]) -> dict[str, Any]:
    family_rows, rail_rows = _upsert_catalog(project_id, catalog)
    created: list[dict[str, Any]] = []
    floor_id = str(ctx["id"])
    viewport_id = str(ctx["stair_viewport_id"])

    with transaction() as conn:
        # Replace only generated/unconfirmed objects for this exact plan source.
        stale = conn.execute(
            "SELECT id FROM stair_ramp_instance WHERE project_id=%s AND floor_id=%s AND source_viewport_id=%s AND user_confirmed=false",
            (project_id, floor_id, viewport_id),
        ).fetchall()
        stale_ids = [str(x["id"]) for x in stale]
        if stale_ids:
            conn.execute("DELETE FROM stair_ramp_review_item WHERE instance_id = ANY(%s::uuid[])", (stale_ids,))
            conn.execute("DELETE FROM stair_ramp_instance WHERE id = ANY(%s::uuid[])", (stale_ids,))

    for item in geometry.items:
        family = _family_for_item(project_id, item, family_rows, catalog, ctx)
        vertical = _vertical_matches(item, ctx, observations)
        rail_family = _rail_family_for_item(item, vertical, rail_rows)
        dims = _resolved_dimensions(item, family, vertical, ctx)
        quantities, reviews = calculate_stair_ramp_quantities(item, float(ctx["mm_per_pixel"]) if ctx.get("mm_per_pixel") else None, dims)
        if family.get("code", "").startswith("UNASSIGNED-"):
            reviews.append(("family_unresolved", f"{item.kind.title()} family/type is unresolved; unsupported construction information was not invented."))
        confidence = float(item.confidence or 0)
        if confidence < 0.65:
            reviews.append(("low_geometry_confidence", "Stair/ramp geometry confidence is low and requires visual review."))
        status = "needs_review" if reviews else "ready"
        components = [
            {"component_type": "run", **run.model_dump(mode="json")}
            for run in item.runs
        ] + [
            {"component_type": "landing", **landing.model_dump(mode="json")}
            for landing in item.landings
        ]
        evidence = [x.model_dump(mode="json") for x in item.evidence]
        evidence.extend(
            {
                "kind": "vertical_detail",
                "text": obs.source_text or obs.observation_type,
                "confidence": obs.confidence,
            }
            for obs in vertical
        )
        source_key = item.item_id.strip() or f"{item.kind}-{len(created)+1}"
        with transaction() as conn:
            row = conn.execute(
                """INSERT INTO stair_ramp_instance(project_id,floor_id,source_viewport_id,source_key,family_id,rail_family_id,
                       kind,type_mark,name,generated_boundary,outer_boundary,holes,components,generated_rail_segments,rail_segments,
                       manual_rail_edges,start_level_label,end_level_label,rise_mm,rise_source,width_mm,riser_mm,tread_mm,waist_mm,
                       landing_thickness_mm,slope_degrees,slope_percent,construction_type,support_condition,concrete_profile,
                       flight_count,riser_count,tread_count,plan_area_m2,sloping_surface_area_m2,intermediate_landing_area_m2,
                       concrete_volume_m3,formwork_soffit_m2,tread_finish_area_m2,riser_finish_area_m2,string_apron_finish_area_m2,
                       ramp_finish_area_m2,balustrade_length_m,quantity_status,reinforcement_status,geometry_user_modified,
                       include_in_boq,status,user_confirmed,confidence,source_evidence,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'[]'::jsonb,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                           %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,false,%s,%s,false,%s,%s,now())
                   ON CONFLICT(floor_id,source_viewport_id,source_key) DO UPDATE SET
                     family_id=excluded.family_id,rail_family_id=excluded.rail_family_id,kind=excluded.kind,type_mark=excluded.type_mark,
                     name=excluded.name,generated_boundary=excluded.generated_boundary,outer_boundary=excluded.outer_boundary,
                     holes=excluded.holes,components=excluded.components,generated_rail_segments=excluded.generated_rail_segments,
                     rail_segments=excluded.rail_segments,start_level_label=excluded.start_level_label,end_level_label=excluded.end_level_label,
                     rise_mm=excluded.rise_mm,rise_source=excluded.rise_source,width_mm=excluded.width_mm,riser_mm=excluded.riser_mm,
                     tread_mm=excluded.tread_mm,waist_mm=excluded.waist_mm,landing_thickness_mm=excluded.landing_thickness_mm,
                     slope_degrees=excluded.slope_degrees,slope_percent=excluded.slope_percent,construction_type=excluded.construction_type,
                     support_condition=excluded.support_condition,concrete_profile=excluded.concrete_profile,flight_count=excluded.flight_count,
                     riser_count=excluded.riser_count,tread_count=excluded.tread_count,plan_area_m2=excluded.plan_area_m2,
                     sloping_surface_area_m2=excluded.sloping_surface_area_m2,intermediate_landing_area_m2=excluded.intermediate_landing_area_m2,
                     concrete_volume_m3=excluded.concrete_volume_m3,formwork_soffit_m2=excluded.formwork_soffit_m2,
                     tread_finish_area_m2=excluded.tread_finish_area_m2,riser_finish_area_m2=excluded.riser_finish_area_m2,
                     string_apron_finish_area_m2=excluded.string_apron_finish_area_m2,ramp_finish_area_m2=excluded.ramp_finish_area_m2,
                     balustrade_length_m=excluded.balustrade_length_m,quantity_status=excluded.quantity_status,
                     reinforcement_status=excluded.reinforcement_status,geometry_user_modified=false,status=excluded.status,
                     confidence=excluded.confidence,source_evidence=excluded.source_evidence,updated_at=now()
                   WHERE stair_ramp_instance.user_confirmed=false
                   RETURNING *""",
                (
                    project_id,
                    floor_id,
                    viewport_id,
                    source_key,
                    str(family["id"]),
                    str(rail_family["id"]),
                    item.kind,
                    item.type_mark,
                    item.name,
                    Jsonb(_point_dicts(item.outer_boundary)),
                    Jsonb(_point_dicts(item.outer_boundary)),
                    Jsonb([_point_dicts(x) for x in item.holes]),
                    Jsonb(components),
                    Jsonb([x.model_dump(mode="json") for x in item.rail_segments]),
                    Jsonb([x.model_dump(mode="json") for x in item.rail_segments]),
                    item.start_level_label,
                    item.end_level_label,
                    dims.get("rise_mm"),
                    dims.get("rise_source"),
                    dims.get("width_mm"),
                    dims.get("riser_mm"),
                    dims.get("tread_mm"),
                    dims.get("waist_mm"),
                    dims.get("landing_thickness_mm"),
                    quantities.get("slope_degrees"),
                    quantities.get("slope_percent"),
                    dims.get("construction_type"),
                    dims.get("support_condition"),
                    dims.get("concrete_profile"),
                    quantities.get("flight_count"),
                    quantities.get("riser_count"),
                    quantities.get("tread_count"),
                    quantities.get("plan_area_m2"),
                    quantities.get("sloping_surface_area_m2"),
                    quantities.get("intermediate_landing_area_m2"),
                    quantities.get("concrete_volume_m3"),
                    quantities.get("formwork_soffit_m2"),
                    quantities.get("tread_finish_area_m2"),
                    quantities.get("riser_finish_area_m2"),
                    quantities.get("string_apron_finish_area_m2"),
                    quantities.get("ramp_finish_area_m2"),
                    quantities.get("balustrade_length_m"),
                    quantities.get("quantity_status"),
                    quantities.get("reinforcement_status"),
                    bool(item.include_in_quantity),
                    status,
                    confidence,
                    Jsonb(evidence),
                ),
            ).fetchone()
            if not row:
                # A confirmed row with the same source key was intentionally protected.
                continue
            instance_id = str(row["id"])
            conn.execute("DELETE FROM stair_ramp_review_item WHERE instance_id=%s", (instance_id,))
            for code, message in reviews:
                conn.execute(
                    "INSERT INTO stair_ramp_review_item(project_id,floor_id,instance_id,severity,code,message) VALUES (%s,%s,%s,'warning',%s,%s)",
                    (project_id, floor_id, instance_id, code, message),
                )
        created.append({"id": instance_id, "status": status})
    return {"items": len(created), "needs_review": sum(1 for x in created if x["status"] == "needs_review")}


def _start_run(project_id: str, floor_id: str | None, request_hash: str) -> str:
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO takeoff_analysis_run(project_id,floor_id,module,task_type,provider,model_id,prompt_version,
                   status,progress,message,request_hash)
               VALUES (%s,%s,'stairs-ramps','stairs_ramps_geometry',%s,%s,%s,'running',5,'Starting Stairs & Ramps analysis',%s)
               RETURNING id""",
            (project_id, floor_id, STAIR_RAMP_PROVIDER, STAIR_RAMP_MODEL_LABEL, STAIR_RAMP_PROMPT_VERSION, request_hash),
        ).fetchone()
    return str(row["id"])


def _finish_run(run_id: str, *, status: str, message: str, result: Any = None, error: str | None = None) -> None:
    with transaction() as conn:
        conn.execute(
            "UPDATE takeoff_analysis_run SET status=%s,progress=100,message=%s,result_json=%s,error_message=%s,updated_at=now() WHERE id=%s",
            (status, message, Jsonb(result) if result is not None else None, error, run_id),
        )


def analyze_stair_ramp_context(
    project_id: UUID | str,
    floor_id: UUID | str,
    viewport_id: UUID | str,
    quality: str = "medium",
    *,
    force: bool = False,
    shared_catalog: StairRampCatalogOutput | None = None,
    shared_vertical: list[Any] | None = None,
    shared_client: HarnessModelClient | None = None,
) -> dict[str, Any]:
    pid, fid, vid = str(project_id), str(floor_id), str(viewport_id)
    project = require_frozen_project(pid)
    ctx = next((x for x in _contexts(pid) if str(x["id"]) == fid and str(x["stair_viewport_id"]) == vid), None)
    if not ctx:
        raise ValueError("Stairs & Ramps context not found")
    if not ctx.get("scale_verified") or not ctx.get("mm_per_pixel"):
        raise RuntimeError("Confirm the controlling Stairs/Ramps plan scale in Pre before analysis.")
    source_hash = _source_hash(project, ctx)
    if not force:
        existing = fetch_one(
            "SELECT count(*) AS n FROM stair_ramp_instance WHERE project_id=%s AND floor_id=%s AND source_viewport_id=%s",
            (pid, fid, vid),
        )
        cached_geometry = _load_geometry_cache(pid, fid, vid, source_hash)
        if existing and int(existing["n"]) > 0 and cached_geometry is not None:
            return {"items": int(existing["n"]), "skipped": True, "cached": True, "reason": "saved Stairs & Ramps geometry", "source_hash": source_hash}
    else:
        confirmed = fetch_one(
            "SELECT count(*) AS n FROM stair_ramp_instance WHERE project_id=%s AND floor_id=%s AND source_viewport_id=%s AND user_confirmed=true",
            (pid, fid, vid),
        )
        if confirmed and int(confirmed["n"]) > 0:
            raise RuntimeError("This drawing contains user-confirmed Stairs/Ramps. Clear/replace them explicitly before rerunning detection.")

    auth = codex_account_status()
    if not auth.get("available"):
        raise RuntimeError(auth.get("error") or "Stairs & Ramps account detection is not installed")
    if not auth.get("authenticated"):
        raise RuntimeError("Connect a ChatGPT account in the Stairs & Ramps workspace before running detection.")
    client = shared_client or HarnessModelClient("stairs-ramps", pid)
    catalog = shared_catalog or _catalog(pid, project, quality, client)
    vertical = shared_vertical if shared_vertical is not None else _supporting_vertical_outputs(pid, project, quality, client)
    cached = None if force else _load_geometry_cache(pid, fid, vid, source_hash)
    run_id = _start_run(pid, fid, source_hash)
    try:
        if cached is not None:
            geometry = cached
        else:
            words = extract_viewport_text(vid)
            geometry = client.parse_image(
                Path(ctx["crop_path"]),
                STAIR_RAMP_GEOMETRY_PROMPT.format(
                    width=ctx["drawing_width"],
                    height=ctx["drawing_height"],
                    floor_name=ctx["name"],
                    mm_per_pixel=round(float(ctx["mm_per_pixel"]), 6),
                    context="\n".join(f"{x['text']} @ {x['bbox']}" for x in words),
                ),
                StairRampGeometryOutput,
                system=STAIR_RAMP_SYSTEM,
                quality=quality,
            )
            if geometry.source_width_px != int(ctx["drawing_width"]) or geometry.source_height_px != int(ctx["drawing_height"]):
                raise RuntimeError(
                    f"AI coordinate space mismatch: returned {geometry.source_width_px}x{geometry.source_height_px}, "
                    f"expected {ctx['drawing_width']}x{ctx['drawing_height']}. The result was rejected rather than silently rescaled."
                )
            _validate_geometry(geometry)
            # Persist the expensive account result before database projection so a DB interruption does not spend another model turn.
            _save_geometry_cache(pid, fid, vid, source_hash, quality, geometry)
        result = _insert_geometry(pid, ctx, geometry, catalog, vertical)
        result.update(
            {
                "cached": cached is not None,
                "source_hash": source_hash,
                "warnings": geometry.warnings + catalog.warnings,
                "questions": geometry.questions,
            }
        )
        _finish_run(run_id, status="completed", message="Stairs & Ramps analysis complete", result=result)
        return result
    except Exception as exc:
        _finish_run(run_id, status="failed", message="Stairs & Ramps analysis failed", error=str(exc))
        raise


def analyze_project_stairs_ramps(
    project_id: UUID | str,
    quality: str = "medium",
    *,
    force: bool = False,
    progress_callback: Any | None = None,
) -> dict[str, Any]:
    pid = str(project_id)
    project = require_frozen_project(pid)
    contexts = _contexts(pid)
    if not contexts:
        return {"contexts": [], "message": "No Stairs/Ramps primary plan was selected by Scope; no automatic geometry was created."}
    client = HarnessModelClient("stairs-ramps", pid)
    catalog = _catalog(pid, project, quality, client)
    vertical = _supporting_vertical_outputs(pid, project, quality, client)
    results = []
    for index, ctx in enumerate(contexts, start=1):
        if progress_callback:
            progress_callback(index, len(contexts), ctx)
        results.append(
            {
                "floor_id": str(ctx["id"]),
                "viewport_id": str(ctx["stair_viewport_id"]),
                **analyze_stair_ramp_context(
                    pid,
                    ctx["id"],
                    ctx["stair_viewport_id"],
                    quality,
                    force=force,
                    shared_catalog=catalog,
                    shared_vertical=vertical,
                    shared_client=client,
                ),
            }
        )
    return {"contexts": results}


def _run_analysis(project_id: str, quality: str, force: bool, *, lock_acquired: bool = False) -> None:
    lock = _lock(project_id)
    if not lock_acquired and not lock.acquire(blocking=False):
        return
    try:
        _set_status(project_id, "running", 3, "Preparing Stairs & Ramps drawings")

        def progress(index: int, total: int, ctx: dict[str, Any]) -> None:
            pct = 8 + int(((index - 1) / max(total, 1)) * 84)
            _set_status(
                project_id,
                "running",
                pct,
                f"Detecting stairs and ramps · {ctx.get('name') or f'level {index}'}",
                current=index,
                total=total,
                floor_id=str(ctx.get("id") or ""),
                viewport_id=str(ctx.get("stair_viewport_id") or ""),
            )

        result, _harness_report = run_element_harness(
            project_id, "stairs-ramps", quality, force,
            lambda: analyze_project_stairs_ramps(project_id, quality, force=force, progress_callback=progress),
            evaluate_element, publish_element_facts,
        )
        _set_status(
            project_id, "completed", 100, "Stairs & Ramps analysis complete", result=result,
            harness_status=_harness_report.status,
            harness_issues=[
                {"code": issue.code, "message": issue.message, "severity": issue.severity, "entity_refs": list(issue.entity_refs)}
                for issue in _harness_report.issues
            ],
            harness_stats=_harness_report.stats,
        )
    except Exception as exc:  # noqa: BLE001
        _set_status(
            project_id,
            "failed",
            100,
            "Stairs & Ramps analysis failed",
            error_message=str(exc)[:1000],
            traceback=traceback.format_exc(limit=6),
        )
    finally:
        lock.release()


def start_stair_ramp_analysis(project_id: UUID | str, quality: str = "medium", *, force: bool = False) -> dict[str, Any]:
    pid = str(project_id)
    require_frozen_project(pid)
    auth = codex_account_status()
    if not auth.get("available"):
        raise RuntimeError(auth.get("error") or "Stairs & Ramps account detection is not installed")
    if not auth.get("authenticated"):
        raise RuntimeError("Connect a ChatGPT account in the Stairs & Ramps workspace before running detection.")
    if force:
        confirmed = fetch_one("SELECT count(*) AS n FROM stair_ramp_instance WHERE project_id=%s AND user_confirmed=true", (pid,))
        if confirmed and int(confirmed["n"]) > 0:
            raise RuntimeError("This project contains user-confirmed Stairs/Ramps. Clear/replace them explicitly before rerunning detection.")
    lock = _lock(pid)
    if not lock.acquire(blocking=False):
        return _read_json(_status_path(pid), {"status": "running", "progress": 1, "message": "Preparing Stairs & Ramps drawings"})
    status = _set_status(pid, "running", 1, "Preparing Stairs & Ramps drawings")
    thread = threading.Thread(
        target=_run_analysis,
        kwargs={"project_id": pid, "quality": quality, "force": force, "lock_acquired": True},
        daemon=True,
        name=f"stairs-ramps-{pid[:8]}",
    )
    try:
        thread.start()
    except Exception:
        lock.release()
        raise
    return status


def stair_ramp_analysis_status(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    status = _read_json(_status_path(pid), {})
    if status:
        if status.get("status") == "running" and not _lock(pid).locked():
            return _set_status(pid, "failed", int(status.get("progress") or 0), "Previous Stairs & Ramps run was interrupted. Retry will reuse saved/cached evidence.", error_message="interrupted", recoverable=True)
        return status
    run = fetch_one(
        "SELECT status,progress,message,error_message FROM takeoff_analysis_run WHERE project_id=%s AND module='stairs-ramps' ORDER BY created_at DESC LIMIT 1",
        (pid,),
    )
    return run or {"status": "not_started", "progress": 0, "message": None, "error_message": None}


def _nearest_outline_edges(outline: list[dict[str, float]], segments: list[dict[str, Any]]) -> list[bool]:
    if not outline:
        return []
    flags = [False] * len(outline)
    for segment in segments:
        line = segment.get("line") or []
        if len(line) < 2:
            continue
        mx = (float(line[0]["x"]) + float(line[-1]["x"])) / 2.0
        my = (float(line[0]["y"]) + float(line[-1]["y"])) / 2.0
        best_i, best_d = None, float("inf")
        for index, a in enumerate(outline):
            b = outline[(index + 1) % len(outline)]
            ax, ay, bx, by = float(a["x"]), float(a["y"]), float(b["x"]), float(b["y"])
            dx, dy = bx - ax, by - ay
            if dx == 0 and dy == 0:
                continue
            t = max(0.0, min(1.0, ((mx - ax) * dx + (my - ay) * dy) / (dx * dx + dy * dy)))
            px, py = ax + t * dx, ay + t * dy
            distance = math.hypot(mx - px, my - py)
            if distance < best_d:
                best_i, best_d = index, distance
        if best_i is not None and best_d <= 24:
            flags[best_i] = True
    return flags


def _demo_context(project_id: str) -> dict[str, Any]:
    from .scope.engine import get_scope

    contexts = _contexts(project_id)
    scope = get_scope(project_id, "stairs-ramps", auto_run=True)
    floors = fetch_all("SELECT * FROM takeoff_floor WHERE project_id=%s ORDER BY level_index", (project_id,))
    floor_by_storey = {str(x.get("storey_id")): x for x in floors if x.get("storey_id")}
    sheets: list[dict[str, Any]] = []
    viewports: list[dict[str, Any]] = []
    seen: set[str] = set()
    selected = scope.get("selected_viewports") or []
    # Map primary viewport to canonical takeoff-floor id.
    primary_floor = {str(ctx["stair_viewport_id"]): str(ctx["id"]) for ctx in contexts}
    for order, item in enumerate(selected):
        role = str(item.get("role") or "")
        if role not in {"primary_measurement", "supporting_vertical", "supporting_detail", "supporting_schedule", "supporting_definition", "supporting_attribute"}:
            continue
        viewport_id = str(item.get("viewport_id") or "")
        if not viewport_id or viewport_id in seen:
            continue
        try:
            _, crop_ctx = ensure_viewport_crop(viewport_id)
        except Exception:
            continue
        seen.add(viewport_id)
        width, height = int(crop_ctx["crop_width_px"]), int(crop_ctx["crop_height_px"])
        sid = f"stairs-sheet-{viewport_id}"
        sheets.append(
            {
                "id": sid,
                "sheetNo": item.get("sheet_no") or str(order + 1),
                "title": item.get("sheet_title") or item.get("name") or "Stairs & Ramps evidence",
                "revision": item.get("sheet_revision") or "",
                "image": f"/api/v1/viewports/{viewport_id}/crop",
                "page": 200 + order,
                "included": True,
                "width": width,
                "height": height,
            }
        )
        kind = str(item.get("view_kind") or "detail")
        category = kind if kind in {"plan", "section", "elevation", "detail", "schedule"} else "detail"
        mmpp, verified = source_mm_per_pixel(viewport_id) if category == "plan" else (None, False)
        level_ref = str(item.get("level_ref") or "")
        connected_floor = primary_floor.get(viewport_id)
        if not connected_floor and level_ref in floor_by_storey:
            connected_floor = str(floor_by_storey[level_ref]["id"])
        viewports.append(
            {
                "id": viewport_id,
                "name": item.get("name") or item.get("sheet_title") or category.title(),
                "category": category,
                "sheetId": sid,
                "bbox": [0, 0, width, height],
                "order": order,
                "status": "confirmed",
                "scaleMPerPx": float(mmpp) / 1000.0 if verified and mmpp else None,
                "scopeRole": role,
                "connectedLevelRefs": [connected_floor] if connected_floor else [],
            }
        )
    storeys = []
    for floor in floors:
        height = fetch_one("SELECT height_mm FROM storey WHERE id=%s", (str(floor.get("storey_id")),)) if floor.get("storey_id") else None
        storeys.append(
            {
                "id": str(floor["id"]),
                "name": floor["name"],
                "levelIndex": floor["level_index"],
                "factor": floor["typical_factor"],
                "heightM": float(height["height_mm"]) / 1000.0 if height and height.get("height_mm") else 0.0,
                "status": "confirmed" if height and height.get("height_mm") else "ready",
            }
        )
    return {"sheets": sheets, "viewports": viewports, "storeys": storeys}


def stair_ramp_demo_state(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    context = _demo_context(pid)
    _ensure_fallback_families(pid)
    families = fetch_all("SELECT * FROM stair_ramp_family WHERE project_id=%s AND status<>'deleted' ORDER BY code", (pid,))
    rails = fetch_all("SELECT * FROM balustrade_family WHERE project_id=%s AND status<>'deleted' ORDER BY code", (pid,))
    items = fetch_all("SELECT * FROM stair_ramp_instance WHERE project_id=%s ORDER BY floor_id,created_at", (pid,))
    ui = fetch_one("SELECT state_json FROM takeoff_ui_state WHERE project_id=%s AND module='stairs-ramps'", (pid,))

    family_payload = [
        {
            "id": str(row["id"]),
            "mark": row["code"],
            "description": row.get("description") or row["name"],
            "kind": "Stair" if row["kind"] == "stair" else "Ramp",
            "widthMm": float(row.get("width_mm") or 0),
            "riserMm": float(row.get("riser_mm") or 0),
            "treadMm": float(row.get("tread_mm") or 0),
            "waistMm": float(row.get("waist_mm") or 0),
            "landingThicknessMm": float(row.get("landing_thickness_mm") or 0),
            "finish": row.get("tread_finish_code") or row.get("ramp_finish_code") or "",
            "treadFinish": row.get("tread_finish_code") or "",
            "riserFinish": row.get("riser_finish_code") or "",
            "stringFinish": row.get("string_finish_code") or "",
            "rampFinish": row.get("ramp_finish_code") or "",
            "constructionType": row.get("construction_type") or "unknown",
            "material": row.get("material") or "",
            "supportCondition": row.get("support_condition") or "unknown",
            "concreteProfile": row.get("concrete_profile") or "unknown",
            "source": (row.get("source_evidence") or [{}])[0].get("text") if row.get("source_evidence") else "Detected / information required",
            "color": row.get("display_colour") or "#7c3aed",
        }
        for row in families
    ]
    rail_payload = [
        {
            "id": str(row["id"]),
            "mark": row["code"],
            "description": row.get("description") or row["name"],
            "heightMm": float(row.get("height_mm") or 0),
            "material": row.get("material") or "",
            "finish": row.get("finish") or "",
            "source": (row.get("source_evidence") or [{}])[0].get("text") if row.get("source_evidence") else "Detected / information required",
            "color": row.get("display_colour") or "#f59e0b",
        }
        for row in rails
    ]
    flight_payload = []
    for row in items:
        outline = row.get("outer_boundary") or []
        segments = row.get("rail_segments") or []
        manual_edges = row.get("manual_rail_edges") or []
        rail_edges = manual_edges if len(manual_edges) == len(outline) else _nearest_outline_edges(outline, segments)
        flight_payload.append(
            {
                "id": str(row["id"]),
                "familyId": str(row["family_id"]) if row.get("family_id") else "",
                "railFamilyId": str(row["rail_family_id"]) if row.get("rail_family_id") else "",
                "floorId": str(row["floor_id"]),
                "viewportId": str(row["source_viewport_id"]) if row.get("source_viewport_id") else "",
                "points": outline,
                "voids": row.get("holes") or [],
                "railEdges": rail_edges,
                "railSegments": segments,
                "railEdgesEdited": bool(manual_edges),
                "riseOverrideM": float(row["rise_mm"]) / 1000.0 if row.get("rise_mm") else None,
                "status": "confirmed" if row.get("user_confirmed") else (row.get("status") or "needs_review"),
                "evidenceOnly": not bool(row.get("include_in_boq", True)),
                "kind": "Stair" if row["kind"] == "stair" else "Ramp",
                "typeMark": row.get("type_mark"),
                "startLevelLabel": row.get("start_level_label"),
                "endLevelLabel": row.get("end_level_label"),
                "widthMm": row.get("width_mm"),
                "riserMm": row.get("riser_mm"),
                "treadMm": row.get("tread_mm"),
                "waistMm": row.get("waist_mm"),
                "landingThicknessMm": row.get("landing_thickness_mm"),
                "planAreaM2": row.get("plan_area_m2"),
                "slopingSurfaceAreaM2": row.get("sloping_surface_area_m2"),
                "landingAreaM2": row.get("intermediate_landing_area_m2"),
                "concreteM3": row.get("concrete_volume_m3"),
                "formworkM2": row.get("formwork_soffit_m2"),
                "treadFinishM2": row.get("tread_finish_area_m2"),
                "riserFinishM2": row.get("riser_finish_area_m2"),
                "stringApronFinishM2": row.get("string_apron_finish_area_m2"),
                "rampFinishM2": row.get("ramp_finish_area_m2"),
                "balustradeLengthM": row.get("balustrade_length_m"),
                "riserCount": row.get("riser_count"),
                "treadCount": row.get("tread_count"),
                "slopeDegrees": row.get("slope_degrees"),
                "slopePercent": row.get("slope_percent"),
                "quantityStatus": row.get("quantity_status"),
                "reinforcementStatus": row.get("reinforcement_status"),
                "geometryUserModified": bool(row.get("geometry_user_modified")),
                "confidence": row.get("confidence"),
                "components": row.get("components") or [],
            }
        )
    return {
        **context,
        "flightFamilies": family_payload,
        "railFamilies": rail_payload,
        "flights": flight_payload,
        "uiState": (ui or {}).get("state_json") or {},
        "analysis": stair_ramp_analysis_status(pid),
        "provider": STAIR_RAMP_PROVIDER,
        "auth": codex_account_status(),
    }


def _same_optional_number(left: Any, right: Any, *, tolerance: float = 0.01) -> bool:
    if left is None and right is None:
        return True
    if left is None or right is None:
        return False
    try:
        return abs(float(left) - float(right)) <= tolerance
    except (TypeError, ValueError):
        return False


def _update_family_from_demo(conn: Any, project_id: str, value: dict[str, Any]) -> str:
    family_id = _safe_uuid(value.get("id"))
    kind = "ramp" if str(value.get("kind") or "").lower() == "ramp" else "stair"
    params = (
        value.get("mark") or ("Manual ramp" if kind == "ramp" else "Manual stair"),
        value.get("description") or "",
        kind,
        value.get("constructionType") or "unknown",
        value.get("material") or None,
        float(value.get("widthMm") or 0) or None,
        float(value.get("riserMm") or 0) or None,
        float(value.get("treadMm") or 0) or None,
        float(value.get("waistMm") or 0) or None,
        float(value.get("landingThicknessMm") or 0) or None,
        value.get("supportCondition") or "unknown",
        value.get("concreteProfile") or "unknown",
        value.get("treadFinish") or (value.get("finish") if kind == "stair" else None) or None,
        value.get("riserFinish") or None,
        value.get("stringFinish") or None,
        value.get("rampFinish") or (value.get("finish") if kind == "ramp" else None) or None,
        value.get("color") or ("#2563eb" if kind == "ramp" else "#7c3aed"),
    )
    if family_id:
        current = conn.execute(
            "SELECT * FROM stair_ramp_family WHERE id=%s AND project_id=%s",
            (family_id, project_id),
        ).fetchone()
        if current:
            text_fields = (
                "code", "description", "kind", "construction_type", "material",
                "support_condition", "concrete_profile", "tread_finish_code",
                "riser_finish_code", "string_finish_code", "ramp_finish_code", "display_colour",
            )
            text_values = (
                params[0], params[1], params[2], params[3], params[4],
                params[10], params[11], params[12], params[13], params[14], params[15], params[16],
            )
            numeric_fields = ("width_mm", "riser_mm", "tread_mm", "waist_mm", "landing_thickness_mm")
            numeric_values = (params[5], params[6], params[7], params[8], params[9])
            unchanged = all((current.get(field) or None) == (value_ or None) for field, value_ in zip(text_fields, text_values))
            unchanged = unchanged and all(_same_optional_number(current.get(field), value_) for field, value_ in zip(numeric_fields, numeric_values))
            if unchanged:
                return str(current["id"])
            row = conn.execute(
                """UPDATE stair_ramp_family SET code=%s,description=%s,kind=%s,construction_type=%s,material=%s,width_mm=%s,
                       riser_mm=%s,tread_mm=%s,waist_mm=%s,landing_thickness_mm=%s,support_condition=%s,concrete_profile=%s,
                       tread_finish_code=%s,riser_finish_code=%s,string_finish_code=%s,ramp_finish_code=%s,display_colour=%s,
                       user_confirmed=true,updated_at=now() WHERE id=%s AND project_id=%s RETURNING id""",
                (*params, family_id, project_id),
            ).fetchone()
            if row:
                return str(row["id"])
    row = conn.execute(
        """INSERT INTO stair_ramp_family(project_id,code,name,description,kind,construction_type,material,width_mm,riser_mm,tread_mm,
               waist_mm,landing_thickness_mm,support_condition,concrete_profile,tread_finish_code,riser_finish_code,string_finish_code,
               ramp_finish_code,display_colour,user_confirmed,source_evidence)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true,%s)
           ON CONFLICT(project_id,code) DO UPDATE SET updated_at=now() RETURNING id""",
        (
            project_id,
            params[0],
            params[0],
            params[1],
            *params[2:],
            Jsonb([{"kind": "user", "text": "User-created/edited Stairs & Ramps family"}]),
        ),
    ).fetchone()
    return str(row["id"])


def _update_rail_family_from_demo(conn: Any, project_id: str, value: dict[str, Any]) -> str:
    rail_id = _safe_uuid(value.get("id"))
    params = (
        value.get("mark") or "Manual rail",
        value.get("description") or "",
        value.get("material") or None,
        float(value.get("heightMm") or 0) or None,
        value.get("finish") or None,
        value.get("color") or "#f59e0b",
    )
    if rail_id:
        current = conn.execute(
            "SELECT * FROM balustrade_family WHERE id=%s AND project_id=%s",
            (rail_id, project_id),
        ).fetchone()
        if current:
            unchanged = all(
                (current.get(field) or None) == (value_ or None)
                for field, value_ in zip(
                    ("code", "description", "material", "finish", "display_colour"),
                    (params[0], params[1], params[2], params[4], params[5]),
                )
            ) and _same_optional_number(current.get("height_mm"), params[3])
            if unchanged:
                return str(current["id"])
            row = conn.execute(
                """UPDATE balustrade_family SET code=%s,description=%s,material=%s,height_mm=%s,finish=%s,display_colour=%s,
                       user_confirmed=true,updated_at=now() WHERE id=%s AND project_id=%s RETURNING id""",
                (*params, rail_id, project_id),
            ).fetchone()
            if row:
                return str(row["id"])
    row = conn.execute(
        """INSERT INTO balustrade_family(project_id,code,name,description,material,height_mm,finish,display_colour,user_confirmed,source_evidence)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,true,%s)
           ON CONFLICT(project_id,code) DO UPDATE SET updated_at=now() RETURNING id""",
        (project_id, params[0], params[0], *params[1:], Jsonb([{"kind": "user", "text": "User-created/edited balustrade family"}])),
    ).fetchone()
    return str(row["id"])

def _manual_rail_segments(points: list[dict[str, float]], flags: list[bool]) -> list[dict[str, Any]]:
    result = []
    for index, flag in enumerate(flags[: len(points)]):
        if not flag:
            continue
        result.append(
            {
                "rail_id": f"manual-edge-{index+1}",
                "line": [points[index], points[(index + 1) % len(points)]],
                "host_run_id": None,
                "rail_mark": None,
                "segment_kind": "unknown",
                "evidence": [{"kind": "user", "text": "User-selected balustrade edge"}],
                "confidence": 1.0,
            }
        )
    return result


def save_stair_ramp_demo_state(project_id: UUID | str, payload: dict[str, Any]) -> dict[str, Any]:
    pid = str(project_id)
    family_map: dict[str, str] = {}
    rail_map: dict[str, str] = {}
    kept_ids: list[str] = []
    with transaction() as conn:
        for family in payload.get("flightFamilies") or []:
            family_map[str(family.get("id") or "")] = _update_family_from_demo(conn, pid, family)
        for family in payload.get("railFamilies") or []:
            rail_map[str(family.get("id") or "")] = _update_rail_family_from_demo(conn, pid, family)

        for value in payload.get("flights") or []:
            points = value.get("points") or []
            if len(points) < 3:
                continue
            item_id = _safe_uuid(value.get("id"))
            existing = conn.execute("SELECT * FROM stair_ramp_instance WHERE id=%s AND project_id=%s", (item_id, pid)).fetchone() if item_id else None
            family_id = family_map.get(str(value.get("familyId") or "")) or _safe_uuid(value.get("familyId"))
            rail_family_id = rail_map.get(str(value.get("railFamilyId") or "")) or _safe_uuid(value.get("railFamilyId"))
            floor_id = _safe_uuid(value.get("floorId"))
            viewport_id = _safe_uuid(value.get("viewportId"))
            if not family_id or not floor_id:
                continue
            family = conn.execute("SELECT * FROM stair_ramp_family WHERE id=%s", (family_id,)).fetchone()
            if not family:
                continue
            mmpp, _ = source_mm_per_pixel(viewport_id) if viewport_id else (None, False)
            generated = (existing or {}).get("generated_boundary") or points
            geometry_changed = json.dumps(generated, sort_keys=True) != json.dumps(points, sort_keys=True)
            flags = [bool(x) for x in (value.get("railEdges") or [])]
            rails_edited = bool(value.get("railEdgesEdited")) or geometry_changed
            rail_segments = _manual_rail_segments(points, flags) if rails_edited else ((existing or {}).get("rail_segments") or value.get("railSegments") or [])
            holes = value.get("voids") or []
            kind = "ramp" if str(value.get("kind") or family.get("kind") or "").lower() == "ramp" else "stair"
            provided_rise_mm = float(value.get("riseOverrideM") or 0) * 1000.0 or None
            existing_rise_mm = float(existing["rise_mm"]) if existing and existing.get("rise_mm") else None
            rise_mm = provided_rise_mm if provided_rise_mm is not None else existing_rise_mm
            rise_changed = provided_rise_mm is not None and (existing_rise_mm is None or abs(provided_rise_mm - existing_rise_mm) > 0.5)
            dims = {
                "width_mm": family.get("width_mm") or value.get("widthMm") or (existing or {}).get("width_mm"),
                "rise_mm": rise_mm,
                "riser_mm": family.get("riser_mm") or value.get("riserMm") or (existing or {}).get("riser_mm"),
                "tread_mm": family.get("tread_mm") or value.get("treadMm") or (existing or {}).get("tread_mm"),
                "waist_mm": family.get("waist_mm") or value.get("waistMm") or (existing or {}).get("waist_mm"),
                "landing_thickness_mm": family.get("landing_thickness_mm") or value.get("landingThicknessMm") or (existing or {}).get("landing_thickness_mm") or family.get("waist_mm"),
                "slope_degrees": (existing or {}).get("slope_degrees"),
                "slope_percent": (existing or {}).get("slope_percent"),
                "construction_type": family.get("construction_type") or "unknown",
                "support_condition": family.get("support_condition") or "unknown",
                "concrete_profile": family.get("concrete_profile") or "unknown",
                "tread_finish_code": family.get("tread_finish_code"),
                "riser_finish_code": family.get("riser_finish_code"),
                "string_finish_code": family.get("string_finish_code"),
                "ramp_finish_code": family.get("ramp_finish_code"),
            }
            if geometry_changed:
                plan_area = _poly_area_m2(points, holes, mmpp)
                rail_length = sum((_line_length_m(x.get("line") or [], mmpp) or 0.0) for x in rail_segments)
                quantities = {
                    "plan_area_m2": round(plan_area, 4) if plan_area is not None else None,
                    "sloping_surface_area_m2": None,
                    "intermediate_landing_area_m2": None,
                    "concrete_volume_m3": None,
                    "formwork_soffit_m2": None,
                    "tread_finish_area_m2": None,
                    "riser_finish_area_m2": None,
                    "string_apron_finish_area_m2": None,
                    "ramp_finish_area_m2": None,
                    "balustrade_length_m": round(rail_length, 4),
                    "flight_count": (existing or {}).get("flight_count"),
                    "riser_count": (existing or {}).get("riser_count"),
                    "tread_count": (existing or {}).get("tread_count"),
                    "slope_degrees": (existing or {}).get("slope_degrees"),
                    "slope_percent": (existing or {}).get("slope_percent"),
                    "quantity_status": "needs_review",
                    "reinforcement_status": "information_required",
                }
            elif existing:
                # Family-only edits can safely reuse the saved component geometry and recalculate.
                class Obj:
                    pass
                item = Obj()
                item.kind = kind
                item.outer_boundary = points
                item.holes = holes
                item.runs = []
                item.landings = []
                item.rail_segments = []
                for component in existing.get("components") or []:
                    c = Obj()
                    for key, val in component.items():
                        setattr(c, key, val)
                    if component.get("component_type") == "run":
                        item.runs.append(c)
                    elif component.get("component_type") == "landing":
                        item.landings.append(c)
                for segment in rail_segments:
                    c = Obj()
                    for key, val in segment.items():
                        setattr(c, key, val)
                    item.rail_segments.append(c)
                quantities, _ = calculate_stair_ramp_quantities(item, mmpp, dims)
            else:
                plan_area = _poly_area_m2(points, holes, mmpp)
                rail_length = sum((_line_length_m(x.get("line") or [], mmpp) or 0.0) for x in rail_segments)
                quantities = {
                    "plan_area_m2": round(plan_area, 4) if plan_area is not None else None,
                    "sloping_surface_area_m2": None,
                    "intermediate_landing_area_m2": None,
                    "concrete_volume_m3": None,
                    "formwork_soffit_m2": None,
                    "tread_finish_area_m2": None,
                    "riser_finish_area_m2": None,
                    "string_apron_finish_area_m2": None,
                    "ramp_finish_area_m2": None,
                    "balustrade_length_m": round(rail_length, 4),
                    "flight_count": None,
                    "riser_count": None,
                    "tread_count": None,
                    "slope_degrees": None,
                    "slope_percent": None,
                    "quantity_status": "needs_review",
                    "reinforcement_status": "information_required",
                }
            status = str(value.get("status") or "needs_review")
            if geometry_changed and status != "confirmed":
                status = "needs_review"
            user_confirmed = status == "confirmed"
            if existing:
                row = conn.execute(
                    """UPDATE stair_ramp_instance SET family_id=%s,rail_family_id=%s,floor_id=%s,source_viewport_id=%s,kind=%s,
                           outer_boundary=%s,holes=%s,rail_segments=%s,manual_rail_edges=%s,rise_mm=%s,rise_source=%s,width_mm=%s,
                           riser_mm=%s,tread_mm=%s,waist_mm=%s,landing_thickness_mm=%s,construction_type=%s,support_condition=%s,
                           concrete_profile=%s,flight_count=%s,riser_count=%s,tread_count=%s,plan_area_m2=%s,
                           sloping_surface_area_m2=%s,intermediate_landing_area_m2=%s,concrete_volume_m3=%s,formwork_soffit_m2=%s,
                           tread_finish_area_m2=%s,riser_finish_area_m2=%s,string_apron_finish_area_m2=%s,ramp_finish_area_m2=%s,
                           balustrade_length_m=%s,quantity_status=%s,reinforcement_status=%s,geometry_user_modified=%s,include_in_boq=%s,status=%s,
                           user_confirmed=%s,updated_at=now() WHERE id=%s RETURNING id""",
                    (
                        family_id,
                        rail_family_id,
                        floor_id,
                        viewport_id,
                        kind,
                        Jsonb(points),
                        Jsonb(holes),
                        Jsonb(rail_segments),
                        Jsonb(flags if rails_edited else ((existing or {}).get("manual_rail_edges") or [])),
                        rise_mm,
                        "user_override" if rise_changed or not existing else (existing or {}).get("rise_source") or "unknown",
                        dims.get("width_mm"),
                        dims.get("riser_mm"),
                        dims.get("tread_mm"),
                        dims.get("waist_mm"),
                        dims.get("landing_thickness_mm"),
                        dims.get("construction_type"),
                        dims.get("support_condition"),
                        dims.get("concrete_profile"),
                        quantities.get("flight_count"),
                        quantities.get("riser_count"),
                        quantities.get("tread_count"),
                        quantities.get("plan_area_m2"),
                        quantities.get("sloping_surface_area_m2"),
                        quantities.get("intermediate_landing_area_m2"),
                        quantities.get("concrete_volume_m3"),
                        quantities.get("formwork_soffit_m2"),
                        quantities.get("tread_finish_area_m2"),
                        quantities.get("riser_finish_area_m2"),
                        quantities.get("string_apron_finish_area_m2"),
                        quantities.get("ramp_finish_area_m2"),
                        quantities.get("balustrade_length_m"),
                        quantities.get("quantity_status"),
                        quantities.get("reinforcement_status"),
                        geometry_changed or bool((existing or {}).get("geometry_user_modified")),
                        not bool(value.get("evidenceOnly")),
                        status,
                        user_confirmed,
                        str(existing["id"]),
                    ),
                ).fetchone()
            else:
                source_key = f"manual-{value.get('id') or hashlib.sha1(json.dumps(points).encode()).hexdigest()[:10]}"
                row = conn.execute(
                    """INSERT INTO stair_ramp_instance(project_id,floor_id,source_viewport_id,source_key,family_id,rail_family_id,kind,
                           generated_boundary,outer_boundary,holes,components,generated_rail_segments,rail_segments,manual_rail_edges,rise_mm,
                           rise_source,width_mm,riser_mm,tread_mm,waist_mm,landing_thickness_mm,construction_type,support_condition,concrete_profile,
                           flight_count,riser_count,tread_count,plan_area_m2,sloping_surface_area_m2,intermediate_landing_area_m2,concrete_volume_m3,
                           formwork_soffit_m2,tread_finish_area_m2,riser_finish_area_m2,string_apron_finish_area_m2,ramp_finish_area_m2,
                           balustrade_length_m,quantity_status,reinforcement_status,geometry_user_modified,include_in_boq,status,user_confirmed,confidence,source_evidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'[]'::jsonb,'[]'::jsonb,%s,%s,%s,'user_override',%s,%s,%s,%s,%s,%s,%s,%s,
                               %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true,%s,%s,%s,1,%s) RETURNING id""",
                    (
                        pid,
                        floor_id,
                        viewport_id,
                        source_key,
                        family_id,
                        rail_family_id,
                        kind,
                        Jsonb(points),
                        Jsonb(points),
                        Jsonb(holes),
                        Jsonb(rail_segments),
                        Jsonb(flags),
                        rise_mm,
                        dims.get("width_mm"),
                        dims.get("riser_mm"),
                        dims.get("tread_mm"),
                        dims.get("waist_mm"),
                        dims.get("landing_thickness_mm"),
                        dims.get("construction_type"),
                        dims.get("support_condition"),
                        dims.get("concrete_profile"),
                        quantities.get("flight_count"),
                        quantities.get("riser_count"),
                        quantities.get("tread_count"),
                        quantities.get("plan_area_m2"),
                        quantities.get("sloping_surface_area_m2"),
                        quantities.get("intermediate_landing_area_m2"),
                        quantities.get("concrete_volume_m3"),
                        quantities.get("formwork_soffit_m2"),
                        quantities.get("tread_finish_area_m2"),
                        quantities.get("riser_finish_area_m2"),
                        quantities.get("string_apron_finish_area_m2"),
                        quantities.get("ramp_finish_area_m2"),
                        quantities.get("balustrade_length_m"),
                        quantities.get("quantity_status"),
                        quantities.get("reinforcement_status"),
                        not bool(value.get("evidenceOnly")),
                        status,
                        user_confirmed,
                        Jsonb([{"kind": "user", "text": "Manually created Stairs/Ramps item"}]),
                    ),
                ).fetchone()
            kept_ids.append(str(row["id"]))

        if kept_ids:
            conn.execute("DELETE FROM stair_ramp_instance WHERE project_id=%s AND NOT (id = ANY(%s::uuid[]))", (pid, kept_ids))
        elif payload.get("flights") == []:
            conn.execute("DELETE FROM stair_ramp_instance WHERE project_id=%s", (pid,))
        conn.execute(
            """INSERT INTO takeoff_ui_state(project_id,module,state_json,updated_at) VALUES (%s,'stairs-ramps',%s,now())
               ON CONFLICT(project_id,module) DO UPDATE SET state_json=excluded.state_json,updated_at=now()""",
            (pid, Jsonb(payload.get("uiState") or {})),
        )
    return stair_ramp_demo_state(pid)


def stair_ramp_quantities(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    rows = fetch_all(
        """SELECT i.*,f.code AS family_code,f.name AS family_name,f.tread_finish_code,f.riser_finish_code,f.string_finish_code,
                  f.ramp_finish_code,b.code AS rail_code,tf.name AS floor_name,tf.typical_factor
           FROM stair_ramp_instance i
           LEFT JOIN stair_ramp_family f ON f.id=i.family_id
           LEFT JOIN balustrade_family b ON b.id=i.rail_family_id
           JOIN takeoff_floor tf ON tf.id=i.floor_id
           WHERE i.project_id=%s AND i.include_in_boq=true ORDER BY tf.level_index,i.created_at""",
        (pid,),
    )
    items = []
    totals = {"count_nr": 0.0, "concrete_m3": 0.0, "formwork_m2": 0.0, "tread_finish_m2": 0.0, "riser_finish_m2": 0.0, "ramp_finish_m2": 0.0, "balustrade_m": 0.0}
    for row in rows:
        factor = int(row.get("typical_factor") or 1)
        values = {
            "count_nr": float(factor),
            "concrete_m3": float(row["concrete_volume_m3"]) * factor if row.get("concrete_volume_m3") is not None else None,
            "formwork_m2": float(row["formwork_soffit_m2"]) * factor if row.get("formwork_soffit_m2") is not None else None,
            "tread_finish_m2": float(row["tread_finish_area_m2"]) * factor if row.get("tread_finish_area_m2") is not None else None,
            "riser_finish_m2": float(row["riser_finish_area_m2"]) * factor if row.get("riser_finish_area_m2") is not None else None,
            "ramp_finish_m2": float(row["ramp_finish_area_m2"]) * factor if row.get("ramp_finish_area_m2") is not None else None,
            "balustrade_m": float(row["balustrade_length_m"] or 0) * factor,
        }
        totals["count_nr"] += values["count_nr"]
        for key in totals:
            if key == "count_nr":
                continue
            if values.get(key) is not None:
                totals[key] += float(values[key])
        items.append(
            {
                "id": str(row["id"]),
                "kind": row["kind"],
                "family_code": row.get("family_code"),
                "family_name": row.get("family_name"),
                "floor": row.get("floor_name"),
                "typical_factor": factor,
                "quantity_status": row.get("quantity_status"),
                "reinforcement_status": row.get("reinforcement_status"),
                "nrm2": {
                    "construction": "NRM2 11 — In-situ concrete/formwork" if row.get("construction_type") == "in_situ_concrete" else "Family-specific stair/ramp construction",
                    "treads": "NRM2 28.11 — Stair tread finishes",
                    "risers": "NRM2 28.12 — Stair riser finishes",
                    "strings": "NRM2 28.13 — Stair string/apron finishes",
                    "balustrades": "Stairs / walkways / balustrades — linear quantity",
                },
                **values,
            }
        )
    return {"items": items, "totals": {key: round(value, 4) for key, value in totals.items()}}
