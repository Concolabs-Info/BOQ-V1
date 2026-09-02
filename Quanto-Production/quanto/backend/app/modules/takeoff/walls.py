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

from shapely.geometry import Point as ShapelyPoint, Polygon

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
    project_text_evidence,
    require_frozen_project,
    source_mm_per_pixel,
)
from .model_schemas import WallCatalogOutput, WallGeometryOutput, WallVerticalOutput
from .prompts import (
    WALL_CATALOG_PROMPT,
    WALL_CATALOG_SYSTEM,
    WALL_GEOMETRY_PROMPT,
    WALL_SYSTEM,
    WALL_VERTICAL_PROMPT,
    WALL_VERTICAL_SYSTEM,
)

WALL_PROVIDER = "codex-account"
WALL_MODEL_LABEL = "ChatGPT/Codex account"
WALL_CACHE_VERSION = "quanto-wall-account-cache-v1"
WALL_PROMPT_VERSION = "wall-account-v1"
_WALL_LOCKS: dict[str, threading.Lock] = {}
_WALL_LOCK_GUARD = threading.Lock()


def _runtime_dir(project_id: UUID | str) -> Path:
    path = project_root(project_id) / "walls"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _status_path(project_id: UUID | str) -> Path:
    return _runtime_dir(project_id) / "status.json"


def _result_path(project_id: UUID | str, floor_id: UUID | str) -> Path:
    path = _runtime_dir(project_id) / "results"
    path.mkdir(parents=True, exist_ok=True)
    return path / f"{floor_id}.json"


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
    with _WALL_LOCK_GUARD:
        return _WALL_LOCKS.setdefault(pid, threading.Lock())


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


def _wall_contexts(project_id: UUID | str) -> list[dict[str, Any]]:
    """Return one production Wall context per physical storey.

    takeoff_floor is retained as the canonical level/factor identity while the
    Wall Scope manifest is authoritative for the actual wall-plan viewport.
    """
    from .scope.engine import get_scope

    pid = str(project_id)
    floors = ensure_takeoff_floors(pid)
    floor_by_storey = {str(row.get("storey_id")): row for row in floors if row.get("storey_id")}
    scope = get_scope(pid, "walls", auto_run=True)
    if scope.get("status") == "blocked":
        message = next(
            (x.get("message") for x in scope.get("coverage_gaps", []) if x.get("severity") == "blocked"),
            "Wall Scope is blocked",
        )
        raise RuntimeError(f"Wall Scope is not ready: {message}")

    contexts: list[dict[str, Any]] = []
    for level in scope.get("level_scopes") or []:
        storey_id = str(level.get("level_ref") or "")
        floor = floor_by_storey.get(storey_id)
        primary_ids = level.get("primary_viewport_ids") or []
        if not floor or not primary_ids:
            continue
        viewport_id = str(primary_ids[0])
        crop_path, vp_ctx = ensure_viewport_crop(viewport_id)
        mmpp, verified = source_mm_per_pixel(viewport_id)
        contexts.append({
            **floor,
            "wall_viewport_id": viewport_id,
            "crop_path": crop_path,
            "drawing_width": int(vp_ctx["crop_width_px"]),
            "drawing_height": int(vp_ctx["crop_height_px"]),
            "wall_crop_version": int(vp_ctx["crop_version"]),
            "mm_per_pixel": mmpp,
            "scale_verified": verified,
            "wall_scope_status": scope.get("status"),
            "vertical_coverage": level.get("vertical_coverage") or {},
        })
    return contexts


def _wall_source_hash(project: dict[str, Any], ctx: dict[str, Any]) -> str:
    return content_hash({
        "cache_version": WALL_CACHE_VERSION,
        "prompt_version": WALL_PROMPT_VERSION,
        "frame_version": project.get("frame_version"),
        # Geometry belongs to the exact source viewport, not to a repeated/typical storey.
        # Height/finish projection remains floor-specific after the raw geometry is reused.
        "viewport_id": str(ctx["wall_viewport_id"]),
        "crop_version": int(ctx.get("wall_crop_version") or 0),
        "drawing_width": int(ctx["drawing_width"]),
        "drawing_height": int(ctx["drawing_height"]),
        "mm_per_pixel": float(ctx["mm_per_pixel"]) if ctx.get("mm_per_pixel") else None,
        "crop_sha256": _file_sha256(Path(ctx["crop_path"])),
    })


def _load_geometry_cache(project_id: str, floor_id: str, source_hash: str) -> WallGeometryOutput | None:
    # First try the floor projection's own raw result. If a typical/repeated storey uses
    # the same exact viewport, reuse another floor's identical raw geometry instead of
    # paying for the same image twice.
    candidates = [_result_path(project_id, floor_id)]
    result_dir = _runtime_dir(project_id) / "results"
    if result_dir.exists():
        candidates.extend(path for path in result_dir.glob("*.json") if path not in candidates)
    for path in candidates:
        payload = _read_json(path, {})
        if payload.get("schema_version") != WALL_CACHE_VERSION or payload.get("source_hash") != source_hash:
            continue
        try:
            return WallGeometryOutput.model_validate(payload.get("geometry") or {})
        except Exception:
            continue
    return None


def _save_geometry_cache(project_id: str, floor_id: str, source_hash: str, quality: str, geometry: WallGeometryOutput) -> None:
    _write_json(_result_path(project_id, floor_id), {
        "schema_version": WALL_CACHE_VERSION,
        "provider": WALL_PROVIDER,
        "source_hash": source_hash,
        "quality": quality,
        "geometry": geometry.model_dump(mode="json"),
    })


def _load_catalog_cache(project_id: str, catalog_hash: str) -> WallCatalogOutput | None:
    payload = _read_json(_catalog_path(project_id), {})
    if payload.get("schema_version") != WALL_CACHE_VERSION or payload.get("catalog_hash") != catalog_hash:
        return None
    try:
        return WallCatalogOutput.model_validate(payload.get("catalog") or {})
    except Exception:
        return None


def _save_catalog_cache(project_id: str, catalog_hash: str, quality: str, catalog: WallCatalogOutput) -> None:
    _write_json(_catalog_path(project_id), {
        "schema_version": WALL_CACHE_VERSION,
        "provider": WALL_PROVIDER,
        "catalog_hash": catalog_hash,
        "quality": quality,
        "catalog": catalog.model_dump(mode="json"),
    })


def _vertical_source_hash(project: dict[str, Any], viewport_id: str) -> tuple[str, Path, dict[str, Any]]:
    crop_path, ctx = ensure_viewport_crop(viewport_id)
    return content_hash({
        "cache_version": WALL_CACHE_VERSION,
        "prompt_version": WALL_PROMPT_VERSION,
        "frame_version": project.get("frame_version"),
        "viewport_id": viewport_id,
        "crop_version": int(ctx.get("crop_version") or 0),
        "crop_sha256": _file_sha256(Path(crop_path)),
    }), Path(crop_path), ctx


def _load_vertical_cache(project_id: str, viewport_id: str, source_hash: str) -> WallVerticalOutput | None:
    payload = _read_json(_vertical_path(project_id, viewport_id), {})
    if payload.get("schema_version") != WALL_CACHE_VERSION or payload.get("source_hash") != source_hash:
        return None
    try:
        return WallVerticalOutput.model_validate(payload.get("output") or {})
    except Exception:
        return None


def _save_vertical_cache(project_id: str, viewport_id: str, source_hash: str, quality: str, output: WallVerticalOutput) -> None:
    _write_json(_vertical_path(project_id, viewport_id), {
        "schema_version": WALL_CACHE_VERSION,
        "provider": WALL_PROVIDER,
        "source_hash": source_hash,
        "quality": quality,
        "output": output.model_dump(mode="json"),
    })


def _validate_geometry(output: WallGeometryOutput) -> None:
    for wall in output.walls:
        if len(wall.centerline) < 2:
            raise RuntimeError(f"Wall {wall.wall_id} has fewer than two centreline points")
        for point in wall.centerline:
            if not (0 <= point.x <= output.source_width_px and 0 <= point.y <= output.source_height_px):
                raise RuntimeError(f"Wall {wall.wall_id} has coordinates outside the exact source crop")
        if sum(math.hypot(b.x - a.x, b.y - a.y) for a, b in zip(wall.centerline, wall.centerline[1:])) < 2:
            raise RuntimeError(f"Wall {wall.wall_id} has zero/invalid centreline length")
    for opening in output.opening_candidates:
        if not (0 <= opening.center.x <= output.source_width_px and 0 <= opening.center.y <= output.source_height_px):
            raise RuntimeError(f"Opening {opening.opening_id} is outside the exact source crop")


def _line_length_px(points: list[dict[str, float]]) -> float:
    return sum(math.hypot(b["x"] - a["x"], b["y"] - a["y"]) for a, b in zip(points, points[1:]))


def _distance_point_segment(px: float, py: float, a: dict[str, float], b: dict[str, float]) -> float:
    dx, dy = b["x"] - a["x"], b["y"] - a["y"]
    if dx == 0 and dy == 0:
        return math.hypot(px - a["x"], py - a["y"])
    t = max(0.0, min(1.0, ((px - a["x"]) * dx + (py - a["y"]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (a["x"] + t * dx), py - (a["y"] + t * dy))


def _segment_key(a: dict[str, float], b: dict[str, float]) -> tuple[int, int, int, int]:
    p1 = (round(a["x"]), round(a["y"]))
    p2 = (round(b["x"]), round(b["y"]))
    lo, hi = sorted((p1, p2))
    return (*lo, *hi)


def _flatten_walls(geometry: WallGeometryOutput) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    seen: set[tuple[int, int, int, int]] = set()
    for wall in geometry.walls:
        pts = [{"x": float(p.x), "y": float(p.y)} for p in wall.centerline]
        for index, (start, end) in enumerate(zip(pts, pts[1:]), start=1):
            if math.hypot(end["x"] - start["x"], end["y"] - start["y"]) < 2:
                continue
            key = _segment_key(start, end)
            if key in seen:
                continue
            seen.add(key)
            result.append({
                "source_key": f"{wall.wall_id}:{index}",
                "parent_key": wall.wall_id,
                "start": start,
                "end": end,
                "wall_mark": wall.wall_mark,
                "wall_kind": wall.wall_kind,
                "classification": wall.classification,
                "thickness_px": wall.thickness_px,
                "thickness_mm_visible": wall.thickness_mm_visible,
                "height_mm_visible": wall.height_mm_visible,
                "adjacent_space_a": wall.adjacent_space_left,
                "adjacent_space_b": wall.adjacent_space_right,
                "evidence": [x.model_dump() for x in wall.evidence],
                "confidence": wall.confidence,
            })
    return result


def _merge_opening_gaps(segments: list[dict[str, Any]], geometry: WallGeometryOutput, mmpp: float) -> list[dict[str, Any]]:
    """Conservatively join collinear host-wall pieces split by an opening symbol."""
    items = [dict(x) for x in segments]
    max_gap = max(24.0, 1800.0 / max(mmpp, 1e-9))
    line_tol = max(10.0, 250.0 / max(mmpp, 1e-9))

    def compatible(a: dict[str, Any], b: dict[str, Any]) -> bool:
        if a.get("wall_mark") and b.get("wall_mark") and _norm(a.get("wall_mark")) != _norm(b.get("wall_mark")):
            return False
        for key in ("classification", "wall_kind"):
            av, bv = a.get(key), b.get(key)
            if av and bv and av != "unknown" and bv != "unknown" and av != bv:
                return False
        adx, ady = a["end"]["x"] - a["start"]["x"], a["end"]["y"] - a["start"]["y"]
        bdx, bdy = b["end"]["x"] - b["start"]["x"], b["end"]["y"] - b["start"]["y"]
        al, bl = math.hypot(adx, ady), math.hypot(bdx, bdy)
        return bool(al > 1 and bl > 1 and abs((adx * bdx + ady * bdy) / (al * bl)) >= math.cos(math.radians(4)))

    changed = True
    while changed:
        changed = False
        for i, a in enumerate(items):
            if changed:
                break
            for j in range(i + 1, len(items)):
                b = items[j]
                if not compatible(a, b):
                    continue
                endpoint_pairs = [("start", "start"), ("start", "end"), ("end", "start"), ("end", "end")]
                ka, kb = min(endpoint_pairs, key=lambda pair: math.hypot(a[pair[0]]["x"] - b[pair[1]]["x"], a[pair[0]]["y"] - b[pair[1]]["y"]))
                pa, pb = a[ka], b[kb]
                gap = math.hypot(pa["x"] - pb["x"], pa["y"] - pb["y"] )
                if gap < 2 or gap > max_gap:
                    continue
                has_opening = False
                for opening in geometry.opening_candidates:
                    ox, oy = opening.center.x, opening.center.y
                    on_gap = _distance_point_segment(ox, oy, pa, pb) <= line_tol
                    between = math.hypot(ox-pa["x"], oy-pa["y"]) + math.hypot(ox-pb["x"], oy-pb["y"]) <= gap + line_tol * 2
                    if on_gap and between:
                        has_opening = True
                        break
                if not has_opening:
                    continue
                far_a = a["end" if ka == "start" else "start"]
                far_b = b["end" if kb == "start" else "start"]
                merged = {**a, "source_key": f"{a['source_key']}+{b['source_key']}", "start": far_a, "end": far_b}
                merged["confidence"] = min(float(a.get("confidence") or 0), float(b.get("confidence") or 0))
                merged["evidence"] = list(a.get("evidence") or []) + list(b.get("evidence") or []) + [{"kind": "postprocess", "text": "Collinear wall pieces joined across a detected opening"}]
                items = [x for k, x in enumerate(items) if k not in {i, j}] + [merged]
                changed = True
                break
    return items


def _ensure_fallback_definitions(project_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    with transaction() as conn:
        wall = conn.execute(
            """INSERT INTO wall_definition(project_id,code,name,description,wall_kind,classification,display_colour,status,confidence)
               VALUES (%s,'UNASSIGNED-WALL','Unassigned wall — review required','Wall type/thickness is not supported by current evidence',
                       'unknown','unknown','#64748b','active',0)
               ON CONFLICT(project_id,code) DO UPDATE SET updated_at=now() RETURNING *""",
            (project_id,),
        ).fetchone()
        finish = conn.execute(
            """INSERT INTO wall_finish_definition(project_id,code,name,description,material,display_colour,status,confidence)
               VALUES (%s,'UNASSIGNED-WF','Unassigned wall finish — review required','No supported finish rule has been resolved',
                       'Unassigned','#64748b','active',0)
               ON CONFLICT(project_id,code) DO UPDATE SET updated_at=now() RETURNING *""",
            (project_id,),
        ).fetchone()
    return dict(wall), dict(finish)


def _upsert_catalog(project_id: str, catalog: WallCatalogOutput) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    walls: dict[str, dict[str, Any]] = {}
    finishes: dict[str, dict[str, Any]] = {}
    with transaction() as conn:
        conn.execute("DELETE FROM wall_finish_rule WHERE project_id=%s AND source='ai_catalog'", (project_id,))
        for index, item in enumerate(catalog.wall_types):
            code = item.code.strip() or f"W-{index+1:02d}"
            row = conn.execute(
                """INSERT INTO wall_definition(project_id,code,name,description,wall_kind,classification,material,
                       thickness_mm,height_mm,construction,structural_role,nrm_work_section,display_colour,source_evidence,
                       confidence,status,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active',now())
                   ON CONFLICT(project_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,
                     wall_kind=excluded.wall_kind,classification=excluded.classification,material=excluded.material,
                     thickness_mm=excluded.thickness_mm,height_mm=excluded.height_mm,construction=excluded.construction,
                     structural_role=excluded.structural_role,nrm_work_section=excluded.nrm_work_section,
                     source_evidence=excluded.source_evidence,confidence=excluded.confidence,updated_at=now()
                   RETURNING *""",
                (project_id, code, item.name, item.description, item.wall_kind, item.classification, item.material,
                 item.thickness_mm, item.height_mm, item.construction, item.structural_role, item.nrm_work_section,
                 PALETTE[index % len(PALETTE)], Jsonb([{"kind": "specification", "text": item.source_text}]), item.confidence),
            ).fetchone()
            walls[_norm(code)] = dict(row)
        for index, item in enumerate(catalog.finish_definitions):
            code = item.code.strip() or f"WF-{index+1:02d}"
            row = conn.execute(
                """INSERT INTO wall_finish_definition(project_id,code,name,description,material,thickness_mm,
                       internal_external,coverage_mode,coverage_height_mm,display_colour,source_evidence,confidence,status,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active',now())
                   ON CONFLICT(project_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,
                     material=excluded.material,thickness_mm=excluded.thickness_mm,internal_external=excluded.internal_external,
                     coverage_mode=excluded.coverage_mode,coverage_height_mm=excluded.coverage_height_mm,
                     source_evidence=excluded.source_evidence,confidence=excluded.confidence,updated_at=now()
                   RETURNING *""",
                (project_id, code, item.name, item.description, item.material, item.thickness_mm, item.internal_external,
                 item.coverage_mode, item.coverage_height_mm, PALETTE[(index + 6) % len(PALETTE)],
                 Jsonb([{"kind": "specification", "text": item.source_text}]), item.confidence),
            ).fetchone()
            finishes[_norm(code)] = dict(row)
        for rule in catalog.finish_rules:
            conn.execute(
                """INSERT INTO wall_finish_rule(project_id,room_types,finish_codes,side_scope,exceptions,source_text,confidence,source,status)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,'ai_catalog','active')""",
                (project_id, rule.room_types, rule.finish_codes, rule.side_scope, Jsonb(rule.exceptions), rule.source_text, rule.confidence),
            )
    fallback, ffallback = _ensure_fallback_definitions(project_id)
    # Catalog extraction must never make previously user-created definitions unavailable.
    # Merge every active persisted definition into the resolver map after the AI catalog upsert.
    for row in fetch_all("SELECT * FROM wall_definition WHERE project_id=%s AND status<>'deleted'", (project_id,)):
        walls[_norm(row.get("code"))] = dict(row)
    for row in fetch_all("SELECT * FROM wall_finish_definition WHERE project_id=%s AND status<>'deleted'", (project_id,)):
        finishes[_norm(row.get("code"))] = dict(row)
    walls["unassigned wall"] = fallback
    finishes["unassigned wf"] = ffallback
    return walls, finishes


def _resolve_wall_definition(project_id: str, segment: dict[str, Any], catalog_rows: dict[str, dict[str, Any]], mmpp: float) -> tuple[dict[str, Any], float | None, str]:
    mark = _norm(segment.get("wall_mark"))
    if mark and mark in catalog_rows:
        row = catalog_rows[mark]
        thickness = segment.get("thickness_mm_visible") or row.get("thickness_mm") or (segment.get("thickness_px") * mmpp if segment.get("thickness_px") else None)
        return row, float(thickness) if thickness else None, "wall_mark"

    measured = segment.get("thickness_mm_visible") or (segment.get("thickness_px") * mmpp if segment.get("thickness_px") else None)
    candidates = [row for key, row in catalog_rows.items() if key != "unassigned wall" and row.get("thickness_mm")]
    if measured and candidates:
        same_class = [r for r in candidates if str(r.get("classification") or "unknown") in {segment.get("classification"), "both", "unknown"}]
        pool = same_class or candidates
        nearest = min(pool, key=lambda r: abs(float(r["thickness_mm"]) - float(measured)))
        tolerance = max(12.0, float(measured) * 0.10)
        if abs(float(nearest["thickness_mm"]) - float(measured)) <= tolerance:
            return nearest, float(measured), "measured_thickness"

    if measured:
        code = f"AUTO-{round(float(measured))}-{str(segment.get('classification') or 'UNK').upper()[:3]}"
        with transaction() as conn:
            row = conn.execute(
                """INSERT INTO wall_definition(project_id,code,name,description,wall_kind,classification,thickness_mm,
                       display_colour,source_evidence,confidence,status)
                   VALUES (%s,%s,%s,%s,'unknown',%s,%s,'#64748b',%s,%s,'active')
                   ON CONFLICT(project_id,code) DO UPDATE SET thickness_mm=excluded.thickness_mm,updated_at=now() RETURNING *""",
                (project_id, code, f"Detected {round(float(measured))} mm wall", "Detected thickness; wall construction/type requires review",
                 segment.get("classification") or "unknown", float(measured),
                 Jsonb(segment.get("evidence") or []), min(float(segment.get("confidence") or 0), 0.75)),
            ).fetchone()
        return dict(row), float(measured), "detected_thickness_review"
    return catalog_rows["unassigned wall"], None, "unassigned"


def _height_for(segment: dict[str, Any], definition: dict[str, Any], ctx: dict[str, Any], vertical: list[Any]) -> tuple[float | None, str]:
    if segment.get("height_mm_visible"):
        return float(segment["height_mm_visible"]), "plan_note"
    mark = _norm(segment.get("wall_mark"))
    level = _norm(ctx.get("name"))
    exact = [o for o in vertical if o.height_mm and mark and _norm(o.wall_code) == mark and (not o.level_label or _norm(o.level_label) in level or level in _norm(o.level_label))]
    if exact:
        best = max(exact, key=lambda o: o.confidence)
        return float(best.height_mm), "vertical_wall_code"
    kinds = {
        "parapet": {"parapet_height"}, "guard_wall": {"parapet_height", "partial_height"},
        "retaining_wall": {"retaining_height"}, "partial_height": {"partial_height"},
        "double_height": {"double_height"},
    }
    wanted = kinds.get(segment.get("wall_kind"), set())
    typed = [o for o in vertical if o.height_mm and o.observation_type in wanted and (not o.level_label or _norm(o.level_label) in level or level in _norm(o.level_label))]
    if len(typed) == 1:
        return float(typed[0].height_mm), "vertical_type_evidence"
    if definition.get("height_mm"):
        return float(definition["height_mm"]), "wall_schedule"
    if segment.get("wall_kind") in {"full_height", "partition", "external_wall", "core_wall", "shaft_wall"}:
        row = fetch_one("SELECT height_mm FROM storey WHERE id=%s", (str(ctx.get("storey_id")),)) if ctx.get("storey_id") else None
        if row and row.get("height_mm"):
            return float(row["height_mm"]), "confirmed_storey_height"
    return None, "unresolved"


def _room_polygons(floor_id: str, source_viewport_id: str, floor_viewport_id: str) -> list[tuple[str, str, Polygon]]:
    if str(source_viewport_id) != str(floor_viewport_id):
        return []
    rows = fetch_all("SELECT id,name,room_type,geometry FROM floor_space WHERE floor_id=%s AND excluded=false", (floor_id,))
    result: list[tuple[str, str, Polygon]] = []
    for row in rows:
        geom = row.get("geometry") or {}
        points = geom.get("points") or []
        holes = geom.get("deducts") or []
        try:
            poly = Polygon([(float(p["x"]), float(p["y"])) for p in points], [[(float(p["x"]), float(p["y"])) for p in ring] for ring in holes])
            if poly.is_valid and not poly.is_empty:
                result.append((str(row["id"]), str(row.get("room_type") or row.get("name") or ""), poly))
        except Exception:
            continue
    return result


def _adjacent_rooms(segment: dict[str, Any], thickness_mm: float | None, mmpp: float, rooms: list[tuple[str, str, Polygon]]) -> tuple[tuple[str | None, str | None], tuple[str | None, str | None]]:
    a, b = segment["start"], segment["end"]
    dx, dy = b["x"] - a["x"], b["y"] - a["y"]
    length = math.hypot(dx, dy)
    if length < 1:
        return (None, segment.get("adjacent_space_a")), (None, segment.get("adjacent_space_b"))
    mx, my = (a["x"] + b["x"]) / 2, (a["y"] + b["y"]) / 2
    offset = max(8.0, ((thickness_mm or 150.0) / mmpp) / 2 + 5.0)
    nx, ny = -dy / length, dx / length
    samples = [(mx + nx * offset, my + ny * offset), (mx - nx * offset, my - ny * offset)]
    resolved: list[tuple[str | None, str | None]] = []
    fallbacks = [segment.get("adjacent_space_a"), segment.get("adjacent_space_b")]
    for idx, (x, y) in enumerate(samples):
        hit = next(((rid, room) for rid, room, poly in rooms if poly.buffer(1).contains(ShapelyPoint(x, y))), None)
        resolved.append(hit or (None, fallbacks[idx]))
    return resolved[0], resolved[1]


def _resolve_finishes(room_label: str | None, side_external: bool, catalog: WallCatalogOutput, finish_rows: dict[str, dict[str, Any]]) -> list[tuple[dict[str, Any], str, float]]:
    """Resolve every supported finish layer for one wall face, not only one display finish."""
    room = _norm(room_label)
    resolved: list[tuple[dict[str, Any], str, float]] = []
    seen: set[str] = set()
    for rule in catalog.finish_rules:
        if side_external and rule.side_scope not in {"external_face", "both_faces"}:
            continue
        if not side_external and rule.side_scope == "external_face":
            continue
        matches_room = side_external or any(_norm(r) and room and (_norm(r) in room or room in _norm(r)) for r in rule.room_types)
        if not matches_room:
            continue
        for code in rule.finish_codes:
            row = finish_rows.get(_norm(code))
            if not row or str(row["id"]) in seen:
                continue
            applicability = str(row.get("internal_external") or "both")
            if side_external and applicability == "internal":
                continue
            if not side_external and applicability == "external":
                continue
            method = "finish_rule_exception_review" if rule.exceptions else "finish_rule"
            confidence = min(float(rule.confidence), 0.70) if rule.exceptions else float(rule.confidence)
            resolved.append((row, method, confidence))
            seen.add(str(row["id"]))
    if resolved:
        return resolved
    return [(finish_rows["unassigned wf"], "unassigned", 0.0)]


def _opening_dimensions(candidate: Any, catalog: WallCatalogOutput, mmpp: float) -> tuple[float | None, float | None, str]:
    tag = _norm(candidate.tag)
    if tag:
        ref = next((x for x in catalog.opening_references if _norm(x.code) == tag), None)
        if ref:
            return ref.width_mm, ref.height_mm, "opening_schedule"
    width = float(candidate.width_px) * mmpp if candidate.width_px else None
    return width, None, "plan_width_only" if width else "unresolved"


def _insert_geometry(project_id: str, ctx: dict[str, Any], geometry: WallGeometryOutput, catalog: WallCatalogOutput, vertical: list[Any]) -> dict[str, Any]:
    wall_defs, finish_defs = _upsert_catalog(project_id, catalog)
    segments = _flatten_walls(geometry)
    mmpp = float(ctx["mm_per_pixel"])
    segments = _merge_opening_gaps(segments, geometry, mmpp)
    rooms = _room_polygons(str(ctx["id"]), str(ctx["wall_viewport_id"]), str(ctx.get("viewport_id")))
    created: list[dict[str, Any]] = []

    # Calculate candidate->host assignment against all model segments before DB insertion.
    opening_by_segment: dict[str, list[Any]] = {s["source_key"]: [] for s in segments}
    max_opening_distance = max(12.0, 300.0 / mmpp)
    for opening in geometry.opening_candidates:
        nearest: tuple[float, dict[str, Any]] | None = None
        for segment in segments:
            d = _distance_point_segment(opening.center.x, opening.center.y, segment["start"], segment["end"])
            if nearest is None or d < nearest[0]:
                nearest = (d, segment)
        if nearest and nearest[0] <= max_opening_distance:
            opening_by_segment[nearest[1]["source_key"]].append(opening)

    with transaction() as conn:
        conn.execute("DELETE FROM wall_review_item WHERE project_id=%s AND floor_id=%s", (project_id, str(ctx["id"])))
        conn.execute("DELETE FROM wall_face_finish WHERE project_id=%s AND floor_id=%s", (project_id, str(ctx["id"])))
        conn.execute("DELETE FROM wall_opening_link WHERE project_id=%s AND floor_id=%s", (project_id, str(ctx["id"])))
        conn.execute("DELETE FROM wall_instance WHERE project_id=%s AND floor_id=%s AND user_confirmed=false", (project_id, str(ctx["id"])))

    for segment in segments:
        definition, thickness_mm, type_method = _resolve_wall_definition(project_id, segment, wall_defs, mmpp)
        height_mm, height_source = _height_for(segment, definition, ctx, vertical)
        length_m = math.hypot(segment["end"]["x"] - segment["start"]["x"], segment["end"]["y"] - segment["start"]["y"]) * mmpp / 1000.0
        gross = length_m * height_mm / 1000.0 if height_mm else None
        opening_records: list[tuple[Any, float | None, float | None, float, str]] = []
        deduction = 0.0
        for candidate in opening_by_segment.get(segment["source_key"], []):
            width_mm, opening_height_mm, basis = _opening_dimensions(candidate, catalog, mmpp)
            area = (width_mm * opening_height_mm / 1_000_000.0) if width_mm and opening_height_mm else 0.0
            # Preserve the project's current wall convention: only openings >0.5m² are deducted.
            deducted = area if area > 0.5 else 0.0
            deduction += deducted
            opening_records.append((candidate, width_mm, opening_height_mm, deducted, basis))
        net = max(0.0, gross - deduction) if gross is not None else None
        (room_a_id, room_a), (room_b_id, room_b) = _adjacent_rooms(segment, thickness_mm, mmpp, rooms)
        classification = str(segment.get("classification") or "unknown")
        classification_source = "model"
        if classification == "unknown" and rooms:
            if room_a and room_b:
                classification, classification_source = "internal", "floor_space_adjacency"
            elif bool(room_a) != bool(room_b):
                classification, classification_source = "external", "floor_space_adjacency"
        external_a = classification == "external" and not room_a
        external_b = classification == "external" and not room_b
        finishes_a = _resolve_finishes(room_a, external_a, catalog, finish_defs)
        finishes_b = _resolve_finishes(room_b, external_b, catalog, finish_defs)
        primary_a, primary_method_a, _primary_conf_a = finishes_a[0]
        primary_b, primary_method_b, _primary_conf_b = finishes_b[0]
        unresolved = (
            type_method in {"unassigned", "detected_thickness_review"}
            or thickness_mm is None
            or height_mm is None
            or classification == "unknown"
            or any(opening_height is None for _candidate, _width, opening_height, _deducted, _basis in opening_records)
            or any(method != "finish_rule" or str(finish.get("coverage_mode") or "full_height") in {"unknown", "splashback"} for finish, method, _confidence in [*finishes_a, *finishes_b])
        )
        status = "needs_review" if unresolved or float(segment.get("confidence") or 0) < 0.80 else "ready"
        evidence = list(segment.get("evidence") or []) + [{"kind": "resolution", "text": f"type={type_method}; height={height_source}; classification={classification_source}"}]
        with transaction() as conn:
            wall = conn.execute(
                """INSERT INTO wall_instance(project_id,floor_id,source_viewport_id,source_key,definition_id,
                       generated_centerline,centerline,wall_kind,classification,thickness_mm,height_mm,height_source,length_m,
                       gross_area_m2,opening_deduction_m2,net_area_m2,adjacent_space_a,adjacent_space_b,side_a_finish_id,
                       side_b_finish_id,side_a_room_id,side_b_room_id,status,user_confirmed,confidence,source_evidence,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,false,%s,%s,now())
                   ON CONFLICT(floor_id,source_viewport_id,source_key) DO UPDATE SET
                     definition_id=excluded.definition_id,generated_centerline=excluded.generated_centerline,
                     centerline=excluded.centerline,wall_kind=excluded.wall_kind,classification=excluded.classification,
                     thickness_mm=excluded.thickness_mm,height_mm=excluded.height_mm,height_source=excluded.height_source,
                     length_m=excluded.length_m,gross_area_m2=excluded.gross_area_m2,
                     opening_deduction_m2=excluded.opening_deduction_m2,net_area_m2=excluded.net_area_m2,
                     adjacent_space_a=excluded.adjacent_space_a,adjacent_space_b=excluded.adjacent_space_b,
                     side_a_finish_id=excluded.side_a_finish_id,side_b_finish_id=excluded.side_b_finish_id,
                     side_a_room_id=excluded.side_a_room_id,side_b_room_id=excluded.side_b_room_id,
                     status=excluded.status,confidence=excluded.confidence,source_evidence=excluded.source_evidence,updated_at=now()
                   WHERE wall_instance.user_confirmed=false RETURNING *""",
                (project_id, str(ctx["id"]), str(ctx["wall_viewport_id"]), segment["source_key"], str(definition["id"]),
                 Jsonb([segment["start"], segment["end"]]), Jsonb([segment["start"], segment["end"]]),
                 segment.get("wall_kind") or "unknown", classification, thickness_mm, height_mm,
                 height_source, round(length_m, 4), round(gross, 4) if gross is not None else None, round(deduction, 4),
                 round(net, 4) if net is not None else None, room_a, room_b, str(primary_a["id"]), str(primary_b["id"]),
                 room_a_id, room_b_id, status, float(segment.get("confidence") or 0), Jsonb(evidence)),
            ).fetchone()
            if not wall:  # protected confirmed row on conflict
                continue
            wall_id = str(wall["id"])
            for candidate, width_mm, opening_height_mm, deducted, basis in opening_records:
                gross_open = (width_mm * opening_height_mm / 1_000_000.0) if width_mm and opening_height_mm else None
                ostatus = "ready" if gross_open is not None else "needs_review"
                conn.execute(
                    """INSERT INTO wall_opening_link(project_id,floor_id,wall_id,source_key,opening_tag,opening_type,center,
                           width_mm,height_mm,gross_area_m2,deduction_area_m2,source,confidence,status,source_evidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                       ON CONFLICT(wall_id,source_key) DO UPDATE SET opening_tag=excluded.opening_tag,opening_type=excluded.opening_type,
                         center=excluded.center,width_mm=excluded.width_mm,height_mm=excluded.height_mm,gross_area_m2=excluded.gross_area_m2,
                         deduction_area_m2=excluded.deduction_area_m2,source=excluded.source,confidence=excluded.confidence,
                         status=excluded.status,source_evidence=excluded.source_evidence,updated_at=now()""",
                    (project_id, str(ctx["id"]), wall_id, candidate.opening_id, candidate.tag, candidate.opening_type,
                     Jsonb({"x": candidate.center.x, "y": candidate.center.y}), width_mm, opening_height_mm, gross_open,
                     deducted, basis, candidate.confidence, ostatus, Jsonb([x.model_dump() for x in candidate.evidence])),
                )
                if gross_open is None:
                    conn.execute(
                        "INSERT INTO wall_review_item(project_id,floor_id,wall_id,severity,code,message) VALUES (%s,%s,%s,'warning','opening_size_unresolved',%s)",
                        (project_id, str(ctx["id"]), wall_id, f"Opening {candidate.tag or candidate.opening_id} has no confirmed width+height; wall deduction was not guessed."),
                    )
            for side, finish_set, room_id in (("A", finishes_a, room_a_id), ("B", finishes_b, room_b_id)):
                for finish, method, confidence in finish_set:
                    coverage_mode = str(finish.get("coverage_mode") or "full_height")
                    coverage_height = finish.get("coverage_height_mm") if coverage_mode != "full_height" else height_mm
                    face_height = min(float(height_mm), float(coverage_height)) if height_mm and coverage_height else height_mm
                    # Splashbacks are normally local lengths, and an unknown coverage mode has no defensible extent.
                    # Keep those quantities unresolved until the user supplies/edits the extent instead of applying them to the full wall.
                    face_gross = None if coverage_mode in {"splashback", "unknown"} else (length_m * face_height / 1000.0 if face_height else None)
                    if coverage_mode == "full_height":
                        face_deduction = min(deduction, face_gross or 0.0) if face_gross is not None else 0.0
                    else:
                        face_deduction = 0.0
                        for candidate, width_mm, opening_height_mm, _deducted, _basis in opening_records:
                            if candidate.opening_type == "door" and width_mm and opening_height_mm and face_height:
                                face_deduction += width_mm * min(opening_height_mm, float(face_height)) / 1_000_000.0
                        face_deduction = min(face_deduction, face_gross or 0.0) if face_gross is not None else 0.0
                    face_net = max(0.0, face_gross - face_deduction) if face_gross is not None else None
                    conn.execute(
                        """INSERT INTO wall_face_finish(project_id,floor_id,wall_id,side,finish_id,room_id,coverage_mode,coverage_height_mm,
                               gross_area_m2,opening_deduction_m2,net_area_m2,assignment_method,confidence,status,user_confirmed,source_evidence)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,false,%s)
                           ON CONFLICT(wall_id,side,finish_id) DO UPDATE SET room_id=excluded.room_id,coverage_mode=excluded.coverage_mode,
                             coverage_height_mm=excluded.coverage_height_mm,gross_area_m2=excluded.gross_area_m2,
                             opening_deduction_m2=excluded.opening_deduction_m2,net_area_m2=excluded.net_area_m2,
                             assignment_method=excluded.assignment_method,confidence=excluded.confidence,status=excluded.status,updated_at=now()""",
                        (project_id, str(ctx["id"]), wall_id, side, str(finish["id"]), room_id, finish.get("coverage_mode") or "full_height",
                         finish.get("coverage_height_mm"), face_gross, face_deduction, face_net, method, confidence,
                         "needs_review" if method != "finish_rule" or coverage_mode in {"splashback", "unknown"} else "ready", Jsonb([])),
                    )
            if any(finish.get("coverage_mode") != "full_height" for finish, _method, _conf in [*finishes_a, *finishes_b]) and any(c.opening_type in {"window", "opening", "unknown"} for c, *_rest in opening_records):
                conn.execute(
                    "INSERT INTO wall_review_item(project_id,floor_id,wall_id,severity,code,message) VALUES (%s,%s,%s,'warning','partial_finish_opening_overlap',%s)",
                    (project_id, str(ctx["id"]), wall_id, "A partial-height wall finish intersects a wall with non-door openings. Window/opening vertical overlap is not known from plan evidence, so no unsupported finish deduction was guessed."),
                )
            review_finish_messages: list[str] = []
            for side_name, finish_set in (("A", finishes_a), ("B", finishes_b)):
                for finish, method, _conf in finish_set:
                    mode = str(finish.get("coverage_mode") or "full_height")
                    if method == "finish_rule_exception_review":
                        review_finish_messages.append(f"Side {side_name} finish {finish.get('code')} has specification exceptions that require spatial/user review.")
                    if mode in {"splashback", "unknown"}:
                        review_finish_messages.append(f"Side {side_name} finish {finish.get('code')} has {mode} coverage; its local length/extent was not guessed.")
            for message in dict.fromkeys(review_finish_messages):
                conn.execute(
                    "INSERT INTO wall_review_item(project_id,floor_id,wall_id,severity,code,message) VALUES (%s,%s,%s,'warning','wall_finish_extent_review',%s)",
                    (project_id, str(ctx["id"]), wall_id, message),
                )
            if classification == "unknown":
                conn.execute(
                    "INSERT INTO wall_review_item(project_id,floor_id,wall_id,severity,code,message) VALUES (%s,%s,%s,'warning','wall_classification_unresolved',%s)",
                    (project_id, str(ctx["id"]), wall_id, "Wall internal/external classification is not supported by plan context or confirmed FloorSpace adjacency."),
                )
            if height_mm is None:
                conn.execute(
                    "INSERT INTO wall_review_item(project_id,floor_id,wall_id,severity,code,message) VALUES (%s,%s,%s,'warning','height_unresolved',%s)",
                    (project_id, str(ctx["id"]), wall_id, "Wall height is not supported by plan, schedule, vertical evidence or an eligible confirmed storey-height rule; area remains unresolved."),
                )
            if type_method in {"unassigned", "detected_thickness_review"}:
                conn.execute(
                    "INSERT INTO wall_review_item(project_id,floor_id,wall_id,severity,code,message) VALUES (%s,%s,%s,'warning','wall_type_unresolved',%s)",
                    (project_id, str(ctx["id"]), wall_id, "Wall construction/type requires review; unsupported material information was not invented."),
                )
            if thickness_mm is None:
                conn.execute(
                    "INSERT INTO wall_review_item(project_id,floor_id,wall_id,severity,code,message) VALUES (%s,%s,%s,'warning','wall_thickness_unresolved',%s)",
                    (project_id, str(ctx["id"]), wall_id, "Wall thickness is unresolved. The centreline is retained for review, but thickness-dependent construction quantities are not invented."),
                )
        created.append({"id": wall_id, "status": status})
    return {"walls": len(created), "needs_review": sum(1 for x in created if x["status"] == "needs_review")}


def _supporting_vertical_outputs(project_id: str, project: dict[str, Any], quality: str, model_client: HarnessModelClient) -> list[Any]:
    from .scope.engine import get_scope

    scope = get_scope(project_id, "walls", auto_run=True)
    ids: list[str] = []
    for item in scope.get("selected_viewports") or []:
        if item.get("role") in {"supporting_vertical", "supporting_detail"}:
            vid = str(item.get("viewport_id") or "")
            if vid and vid not in ids:
                ids.append(vid)
    observations: list[Any] = []
    storeys = fetch_all("SELECT name,level_index,height_mm FROM storey WHERE project_id=%s ORDER BY level_index", (project_id,))
    storey_text = "\n".join(f"{x.get('level_index')}: {x.get('name')} ({x.get('height_mm') or 'height unresolved'} mm)" for x in storeys)
    for viewport_id in ids:
        source_hash, crop_path, _ = _vertical_source_hash(project, viewport_id)
        output = _load_vertical_cache(project_id, viewport_id, source_hash)
        if output is None:
            words = extract_viewport_text(viewport_id)
            output = model_client.parse_image(
                crop_path,
                WALL_VERTICAL_PROMPT.format(storeys=storey_text, context="\n".join(f"{x['text']} @ {x['bbox']}" for x in words)),
                WallVerticalOutput,
                system=WALL_VERTICAL_SYSTEM,
                quality=quality,
            )
            _save_vertical_cache(project_id, viewport_id, source_hash, quality, output)
        observations.extend(output.observations)
    return observations


def _catalog(project_id: str, project: dict[str, Any], quality: str, model_client: HarnessModelClient) -> WallCatalogOutput:
    text = project_text_evidence(project_id)
    if not text.strip():
        return WallCatalogOutput()
    catalog_hash = content_hash({
        "cache_version": WALL_CACHE_VERSION,
        "prompt_version": WALL_PROMPT_VERSION,
        "frame_version": project.get("frame_version"),
        "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
    })
    cached = _load_catalog_cache(project_id, catalog_hash)
    if cached is not None:
        return cached
    output = model_client.parse_text(
        WALL_CATALOG_PROMPT.format(spec_text=text),
        WallCatalogOutput,
        system=WALL_CATALOG_SYSTEM,
        quality=quality,
    )
    _save_catalog_cache(project_id, catalog_hash, quality, output)
    return output


def _start_run(project_id: str, floor_id: str | None, request_hash: str) -> str:
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO takeoff_analysis_run(project_id,floor_id,module,task_type,provider,model_id,prompt_version,
                   status,progress,message,request_hash)
               VALUES (%s,%s,'walls','wall_geometry',%s,%s,%s,'running',5,'Starting wall analysis',%s) RETURNING id""",
            (project_id, floor_id, WALL_PROVIDER, WALL_MODEL_LABEL, WALL_PROMPT_VERSION, request_hash),
        ).fetchone()
    return str(row["id"])


def _finish_run(run_id: str, *, status: str, message: str, result: Any = None, error: str | None = None) -> None:
    with transaction() as conn:
        conn.execute(
            """UPDATE takeoff_analysis_run SET status=%s,progress=100,message=%s,result_json=%s,error_message=%s,updated_at=now() WHERE id=%s""",
            (status, message, Jsonb(result) if result is not None else None, error, run_id),
        )


def analyze_wall_floor(project_id: UUID | str, floor_id: UUID | str, quality: str = "medium", *, force: bool = False) -> dict[str, Any]:
    pid, fid = str(project_id), str(floor_id)
    project = require_frozen_project(pid)
    ctx = next((x for x in _wall_contexts(pid) if str(x["id"]) == fid), None)
    if not ctx:
        raise ValueError("Wall floor context not found")
    if not ctx.get("scale_verified") or not ctx.get("mm_per_pixel"):
        raise RuntimeError("Confirm the controlling Wall plan scale in Pre before Wall analysis.")
    source_hash = _wall_source_hash(project, ctx)
    existing = fetch_one("SELECT count(*) AS n FROM wall_instance WHERE project_id=%s AND floor_id=%s", (pid, fid))
    if existing and int(existing["n"]) > 0 and not force:
        return {"walls": int(existing["n"]), "skipped": True, "cached": True, "reason": "saved wall geometry", "source_hash": source_hash}
    if force:
        confirmed = fetch_one("SELECT count(*) AS n FROM wall_instance WHERE project_id=%s AND floor_id=%s AND user_confirmed=true", (pid, fid))
        if confirmed and int(confirmed["n"]) > 0:
            raise RuntimeError("This floor contains user-confirmed Walls. Clear/replace them explicitly before rerunning detection so confirmed work is never overwritten.")

    auth = codex_account_status()
    if not auth.get("available"):
        raise RuntimeError(auth.get("error") or "Wall account detection is not installed")
    if not auth.get("authenticated"):
        raise RuntimeError("Connect a ChatGPT account in the Walls workspace before running detection.")
    model_client = HarnessModelClient("walls", pid)
    catalog = _catalog(pid, project, quality, model_client)
    vertical = _supporting_vertical_outputs(pid, project, quality, model_client)
    cached = None if force else _load_geometry_cache(pid, fid, source_hash)
    run_id = _start_run(pid, fid, source_hash)
    try:
        if cached is not None:
            geometry = cached
        else:
            words = extract_viewport_text(ctx["wall_viewport_id"])
            geometry = model_client.parse_image(
                ctx["crop_path"],
                WALL_GEOMETRY_PROMPT.format(
                    width=ctx["drawing_width"], height=ctx["drawing_height"], floor_name=ctx["name"],
                    mm_per_pixel=round(float(ctx["mm_per_pixel"]), 6),
                    context="\n".join(f"{x['text']} @ {x['bbox']}" for x in words),
                ),
                WallGeometryOutput,
                system=WALL_SYSTEM,
                quality=quality,
            )
            if geometry.source_width_px != int(ctx["drawing_width"]) or geometry.source_height_px != int(ctx["drawing_height"]):
                raise RuntimeError(
                    f"AI coordinate space mismatch: returned {geometry.source_width_px}x{geometry.source_height_px}, "
                    f"expected {ctx['drawing_width']}x{ctx['drawing_height']}. The result was rejected rather than silently rescaled."
                )
            _validate_geometry(geometry)
            # Save the expensive model result BEFORE PostgreSQL projection.
            _save_geometry_cache(pid, fid, source_hash, quality, geometry)
        result = _insert_geometry(pid, ctx, geometry, catalog, vertical)
        # If the production Doors & Windows module has already been run, make its resolved opening instances
        # canonical for wall deductions after Wall geometry is created. This is intentionally a no-op before migration 009.
        opening_table = fetch_one("SELECT to_regclass('public.opening_instance') AS table_name")
        if opening_table and opening_table.get("table_name"):
            from .doors_windows import sync_openings_to_walls
            sync_openings_to_walls(pid, fid)
        result.update({"cached": cached is not None, "source_hash": source_hash, "warnings": geometry.warnings + catalog.warnings, "questions": geometry.questions})
        _finish_run(run_id, status="completed", message="Wall analysis complete", result=result)
        return result
    except Exception as exc:
        _finish_run(run_id, status="failed", message="Wall analysis failed", error=str(exc))
        raise


def analyze_project_walls(project_id: UUID | str, quality: str = "medium", *, force: bool = False, progress_callback: Any | None = None) -> dict[str, Any]:
    pid = str(project_id)
    contexts = _wall_contexts(pid)
    if not contexts:
        raise RuntimeError("No Wall measurement plans are available from Wall Scope.")
    results = []
    for index, ctx in enumerate(contexts, start=1):
        if progress_callback:
            progress_callback(index, len(contexts), ctx)
        results.append({"floor_id": str(ctx["id"]), **analyze_wall_floor(pid, ctx["id"], quality, force=force)})
    return {"floors": results}


def _run_analysis(project_id: str, quality: str, force: bool, *, lock_acquired: bool = False) -> None:
    lock = _lock(project_id)
    if not lock_acquired and not lock.acquire(blocking=False):
        return
    try:
        _set_status(project_id, "running", 3, "Preparing wall drawings")
        def progress(index: int, total: int, ctx: dict[str, Any]) -> None:
            pct = 8 + int(((index - 1) / max(total, 1)) * 84)
            _set_status(project_id, "running", pct, f"Detecting walls · {ctx.get('name') or f'floor {index}'}", current=index, total=total, floor_id=str(ctx.get("id") or ""))
        result, _harness_report = run_element_harness(
            project_id, "walls", quality, force,
            lambda: analyze_project_walls(project_id, quality, force=force, progress_callback=progress),
            evaluate_element, publish_element_facts,
        )
        _set_status(
            project_id, "completed", 100, "Wall analysis complete", result=result,
            harness_status=_harness_report.status,
            harness_issues=[
                {"code": issue.code, "message": issue.message, "severity": issue.severity, "entity_refs": list(issue.entity_refs)}
                for issue in _harness_report.issues
            ],
            harness_stats=_harness_report.stats,
        )
    except Exception as exc:  # noqa: BLE001
        _set_status(project_id, "failed", 100, "Wall analysis failed", error_message=str(exc)[:1000], traceback=traceback.format_exc(limit=6))
    finally:
        lock.release()


def start_wall_analysis(project_id: UUID | str, quality: str = "medium", *, force: bool = False) -> dict[str, Any]:
    pid = str(project_id)
    require_frozen_project(pid)
    auth = codex_account_status()
    if not auth.get("available"):
        raise RuntimeError(auth.get("error") or "Wall account detection is not installed")
    if not auth.get("authenticated"):
        raise RuntimeError("Connect a ChatGPT account in the Walls workspace before running detection.")
    if force:
        confirmed = fetch_one("SELECT count(*) AS n FROM wall_instance WHERE project_id=%s AND user_confirmed=true", (pid,))
        if confirmed and int(confirmed["n"]) > 0:
            raise RuntimeError("This project contains user-confirmed Walls. Clear/replace them explicitly before rerunning detection so confirmed work is never overwritten.")
    lock = _lock(pid)
    if not lock.acquire(blocking=False):
        return _read_json(_status_path(pid), {"status": "running", "progress": 1, "message": "Preparing wall drawings"})
    status = _set_status(pid, "running", 1, "Preparing wall drawings")
    thread = threading.Thread(target=_run_analysis, kwargs={"project_id": pid, "quality": quality, "force": force, "lock_acquired": True}, daemon=True, name=f"walls-{pid[:8]}")
    try:
        thread.start()
    except Exception:
        lock.release()
        raise
    return status


def wall_analysis_status(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    status = _read_json(_status_path(pid), {})
    if status:
        if status.get("status") == "running" and not _lock(pid).locked():
            return _set_status(pid, "failed", int(status.get("progress") or 0), "Previous Walls run was interrupted. Retry will reuse saved/cached evidence.", error_message="interrupted", recoverable=True)
        return status
    run = fetch_one("SELECT status,progress,message,error_message FROM takeoff_analysis_run WHERE project_id=%s AND module='walls' ORDER BY created_at DESC LIMIT 1", (pid,))
    return run or {"status": "not_started", "progress": 0, "message": None, "error_message": None}


def _wall_demo_context(project_id: str) -> dict[str, Any]:
    contexts = _wall_contexts(project_id)
    sheets, viewports, storeys = [], [], []
    seen_vp: set[str] = set()
    for ctx in contexts:
        vp = str(ctx["wall_viewport_id"])
        sid = f"wall-sheet-{ctx['id']}"
        if vp not in seen_vp:
            sheets.append({"id": sid, "sheetNo": str(ctx.get("level_index") or ""), "title": ctx["name"], "revision": "", "image": f"/api/v1/viewports/{vp}/crop", "page": 100 + int(ctx.get("level_index") or 0), "included": True, "width": ctx["drawing_width"], "height": ctx["drawing_height"]})
            viewports.append({"id": vp, "name": ctx["name"], "category": "plan", "sheetId": sid, "bbox": [0, 0, ctx["drawing_width"], ctx["drawing_height"]], "status": "confirmed", "scaleMPerPx": float(ctx["mm_per_pixel"]) / 1000.0 if ctx.get("mm_per_pixel") else None})
            seen_vp.add(vp)
        height = fetch_one("SELECT height_mm FROM storey WHERE id=%s", (str(ctx.get("storey_id")),)) if ctx.get("storey_id") else None
        storeys.append({"id": str(ctx["id"]), "name": ctx["name"], "levelIndex": int(ctx.get("level_index") or 0), "factor": int(ctx.get("typical_factor") or 1), "heightM": float(height["height_mm"]) / 1000.0 if height and height.get("height_mm") else 0.0, "status": "confirmed" if height and height.get("height_mm") else "ready"})
    return {"sheets": sheets, "viewports": viewports, "storeys": storeys}


def wall_demo_state(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    context = _wall_demo_context(pid)
    _ensure_fallback_definitions(pid)
    families = [{
        "id": str(r["id"]), "mark": r["code"], "description": r.get("description") or r["name"],
        "thicknessMm": float(r.get("thickness_mm") or 0),
        "classification": {"external": "External", "internal": "Internal", "both": "Both"}.get(str(r.get("classification") or "").lower(), "Unknown"),
        "material": r.get("material") or r.get("construction") or "", "color": r.get("display_colour") or "#64748b",
        "wallKind": r.get("wall_kind") or "unknown", "structuralRole": r.get("structural_role") or "unknown",
    } for r in fetch_all("SELECT * FROM wall_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code", (pid,))]
    finish_families = [{
        "id": str(r["id"]), "mark": r["code"], "description": r.get("description") or r["name"],
        "material": r.get("material") or "", "thicknessMm": float(r.get("thickness_mm") or 0),
        "source": ((r.get("source_evidence") or [{}])[0].get("text") if r.get("source_evidence") else "Project specification / user"),
        "color": r.get("display_colour") or "#64748b", "coverageMode": r.get("coverage_mode") or "full_height",
        "coverageHeightMm": r.get("coverage_height_mm"),
    } for r in fetch_all("SELECT * FROM wall_finish_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code", (pid,))]
    rows = fetch_all("SELECT * FROM wall_instance WHERE project_id=%s ORDER BY floor_id,created_at", (pid,))
    face_rows = fetch_all("SELECT wall_id,side,finish_id,net_area_m2,status,user_confirmed FROM wall_face_finish WHERE project_id=%s", (pid,))
    face_area = {(str(x["wall_id"]), str(x["side"]), str(x["finish_id"])): x.get("net_area_m2") for x in face_rows}
    faces_by_wall: dict[str, list[dict[str, Any]]] = {}
    for x in face_rows:
        faces_by_wall.setdefault(str(x["wall_id"]), []).append({"side": str(x["side"]), "finishId": str(x["finish_id"]), "areaM2": x.get("net_area_m2"), "status": "confirmed" if x.get("user_confirmed") else x.get("status")})
    walls = []
    for r in rows:
        line = r.get("centerline") or []
        if len(line) < 2 or not r.get("definition_id"):
            continue
        walls.append({
            "id": str(r["id"]), "familyId": str(r["definition_id"]), "floorId": str(r["floor_id"]),
            "viewportId": str(r.get("source_viewport_id") or ""), "start": line[0], "end": line[-1],
            "heightM": float(r.get("height_mm") or 0) / 1000.0, "side1Finish": str(r.get("side_a_finish_id") or ""),
            "side2Finish": str(r.get("side_b_finish_id") or ""), "status": "confirmed" if r.get("user_confirmed") else ("needs_review" if r.get("status") == "needs_review" else "ready"),
            "lengthM": r.get("length_m"), "grossAreaM2": r.get("gross_area_m2"), "openingDeductionM2": r.get("opening_deduction_m2"),
            "netAreaM2": r.get("net_area_m2"), "heightSource": r.get("height_source"), "confidence": r.get("confidence"),
            "wallKind": r.get("wall_kind"), "classification": r.get("classification"),
            "side1FinishAreaM2": face_area.get((str(r["id"]), "A", str(r.get("side_a_finish_id") or ""))), "side2FinishAreaM2": face_area.get((str(r["id"]), "B", str(r.get("side_b_finish_id") or ""))),
            "finishFaces": faces_by_wall.get(str(r["id"]), []),
        })
    ui = fetch_one("SELECT state_json FROM takeoff_ui_state WHERE project_id=%s AND module='walls'", (pid,))
    return {**context, "families": families, "finishFamilies": finish_families, "walls": walls, "uiState": (ui or {}).get("state_json") or {}, "analysis": wall_analysis_status(pid), "provider": WALL_PROVIDER, "auth": codex_account_status()}


def _face_metrics_for_saved_wall(conn: Any, wall_id: str, finish_row: dict[str, Any], length_m: float | None, height_m: float, wall_deduction_m2: float) -> tuple[float | None, float, float | None]:
    """Recalculate one saved face finish without inventing unknown vertical opening overlap."""
    mode = str(finish_row.get("coverage_mode") or "full_height")
    coverage_mm = finish_row.get("coverage_height_mm") if mode != "full_height" else (height_m * 1000.0 if height_m else None)
    face_height_m = min(height_m, float(coverage_mm) / 1000.0) if height_m and coverage_mm else height_m
    gross = None if mode in {"splashback", "unknown"} else (length_m * face_height_m if length_m is not None and face_height_m > 0 else None)
    if mode == "full_height":
        deduct = min(wall_deduction_m2, gross or 0.0) if gross is not None else 0.0
    else:
        deduct = 0.0
        if coverage_mm and gross is not None:
            openings = conn.execute(
                "SELECT opening_type,width_mm,height_mm FROM wall_opening_link WHERE wall_id=%s",
                (wall_id,),
            ).fetchall()
            # A door starts at the floor, so its overlap with a dado/partial finish is determinable.
            # Window/opening sill/head positions are not stored here and therefore are not guessed.
            for opening in openings:
                if str(opening.get("opening_type") or "").lower() != "door":
                    continue
                if opening.get("width_mm") and opening.get("height_mm"):
                    deduct += float(opening["width_mm"]) * min(float(opening["height_mm"]), float(coverage_mm)) / 1_000_000.0
            deduct = min(deduct, gross)
    net = max(0.0, gross - deduct) if gross is not None else None
    return gross, deduct, net


def _sync_saved_face_side(
    conn: Any,
    *,
    project_id: str,
    floor_id: str,
    wall_id: str,
    side: str,
    selected_finish_id: str | None,
    replace_side: bool,
    length_m: float | None,
    height_m: float,
    wall_deduction_m2: float,
    confirmed: bool,
) -> None:
    """Preserve AI/spec multi-layer finishes unless the user explicitly changes that face's primary finish."""
    if replace_side:
        conn.execute("DELETE FROM wall_face_finish WHERE wall_id=%s AND side=%s", (wall_id, side))
        current: list[Any] = []
        if selected_finish_id:
            frow = conn.execute(
                "SELECT * FROM wall_finish_definition WHERE id=%s AND project_id=%s",
                (selected_finish_id, project_id),
            ).fetchone()
            if frow:
                gross, deduct, net = _face_metrics_for_saved_wall(conn, wall_id, dict(frow), length_m, height_m, wall_deduction_m2)
                conn.execute(
                    """INSERT INTO wall_face_finish(project_id,floor_id,wall_id,side,finish_id,coverage_mode,coverage_height_mm,
                           gross_area_m2,opening_deduction_m2,net_area_m2,assignment_method,confidence,status,user_confirmed,source_evidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'user',1,%s,%s,%s)
                       ON CONFLICT(wall_id,side,finish_id) DO UPDATE SET coverage_mode=excluded.coverage_mode,
                         coverage_height_mm=excluded.coverage_height_mm,gross_area_m2=excluded.gross_area_m2,
                         opening_deduction_m2=excluded.opening_deduction_m2,net_area_m2=excluded.net_area_m2,
                         assignment_method='user',confidence=1,status=excluded.status,user_confirmed=excluded.user_confirmed,
                         source_evidence=excluded.source_evidence,updated_at=now()""",
                    (project_id, floor_id, wall_id, side, selected_finish_id, frow.get("coverage_mode") or "full_height",
                     frow.get("coverage_height_mm"), gross, deduct, net, "confirmed" if confirmed else "ready", confirmed,
                     Jsonb([{"kind": "user", "text": "Wall face finish edited in Quanto"}])),
                )
        return

    current = conn.execute(
        """SELECT wff.id AS face_id,wff.finish_id,wff.status AS face_status,wff.assignment_method AS face_assignment_method,
                  wff.user_confirmed AS face_user_confirmed,wfd.* FROM wall_face_finish wff
           JOIN wall_finish_definition wfd ON wfd.id=wff.finish_id
           WHERE wff.wall_id=%s AND wff.side=%s""",
        (wall_id, side),
    ).fetchall()
    # Older/manual rows may not have a face row yet. Seed only the selected display finish in that case.
    if not current and selected_finish_id:
        _sync_saved_face_side(
            conn, project_id=project_id, floor_id=floor_id, wall_id=wall_id, side=side,
            selected_finish_id=selected_finish_id, replace_side=True, length_m=length_m, height_m=height_m,
            wall_deduction_m2=wall_deduction_m2, confirmed=confirmed,
        )
        return
    for row in current:
        data = dict(row)
        gross, deduct, net = _face_metrics_for_saved_wall(conn, wall_id, data, length_m, height_m, wall_deduction_m2)
        conn.execute(
            """UPDATE wall_face_finish SET gross_area_m2=%s,opening_deduction_m2=%s,net_area_m2=%s,
                   status=%s,user_confirmed=%s,updated_at=now() WHERE id=%s""",
            (gross, deduct, net, "confirmed" if confirmed else data.get("face_status") or "ready", confirmed, str(data["face_id"])),
        )


def save_wall_demo_state(project_id: UUID | str, payload: dict[str, Any]) -> dict[str, Any]:
    pid = str(project_id)
    contexts = _wall_contexts(pid)
    ctx_by_floor = {str(x["id"]): x for x in contexts}
    families = payload.get("families") or []
    finishes = payload.get("finishFamilies") or []
    walls = payload.get("walls") or []
    family_map: dict[str, str] = {}
    finish_map: dict[str, str] = {}
    with transaction() as conn:
        for index, family in enumerate(families):
            client_id = str(family.get("id") or "")
            existing = conn.execute("SELECT * FROM wall_definition WHERE id=%s AND project_id=%s", (_safe_uuid(client_id), pid)).fetchone() if _safe_uuid(client_id) else None
            code = str(family.get("mark") or f"W-{index+1:02d}").strip()
            classification = str(family.get("classification") or "Unknown").lower()
            wall_kind = str(family.get("wallKind") or (existing.get("wall_kind") if existing else "unknown") or "unknown")
            structural_role = str(family.get("structuralRole") or (existing.get("structural_role") if existing else "unknown") or "unknown")
            if existing:
                dbid = str(existing["id"])
                display_description = str(existing.get("description") or existing.get("name") or "")
                description_changed = display_description != str(family.get("description") or "")
                changed = any([
                    str(existing.get("code") or "") != code,
                    description_changed,
                    float(existing.get("thickness_mm") or 0) != float(family.get("thicknessMm") or 0),
                    str(existing.get("classification") or "unknown") != classification,
                    str(existing.get("material") or "") != str(family.get("material") or ""),
                    str(existing.get("wall_kind") or "unknown") != wall_kind,
                    str(existing.get("structural_role") or "unknown") != structural_role,
                    str(existing.get("display_colour") or "") != str(family.get("color") or PALETTE[index % len(PALETTE)]),
                ])
                stored_description = family.get("description") if description_changed else existing.get("description")
                conn.execute(
                    """UPDATE wall_definition SET code=%s,name=%s,description=%s,thickness_mm=%s,classification=%s,material=%s,
                           wall_kind=%s,structural_role=%s,display_colour=%s,user_confirmed=(user_confirmed OR %s),updated_at=now() WHERE id=%s""",
                    (code, existing.get("name") or family.get("description") or code, stored_description, family.get("thicknessMm"), classification,
                     family.get("material"), wall_kind, structural_role, family.get("color") or PALETTE[index % len(PALETTE)], changed, dbid),
                )
            else:
                row = conn.execute(
                    """INSERT INTO wall_definition(project_id,code,name,description,wall_kind,classification,material,thickness_mm,
                           structural_role,display_colour,user_confirmed,status,confidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true,'active',1)
                       ON CONFLICT(project_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,
                         wall_kind=excluded.wall_kind,classification=excluded.classification,material=excluded.material,
                         thickness_mm=excluded.thickness_mm,structural_role=excluded.structural_role,
                         display_colour=excluded.display_colour,user_confirmed=true,updated_at=now() RETURNING id""",
                    (pid, code, family.get("description") or code, family.get("description"), wall_kind, classification,
                     family.get("material"), family.get("thicknessMm"), structural_role, family.get("color") or PALETTE[index % len(PALETTE)]),
                ).fetchone()
                dbid = str(row["id"])
            family_map[client_id] = dbid

        for index, finish in enumerate(finishes):
            client_id = str(finish.get("id") or "")
            existing = conn.execute("SELECT * FROM wall_finish_definition WHERE id=%s AND project_id=%s", (_safe_uuid(client_id), pid)).fetchone() if _safe_uuid(client_id) else None
            code = str(finish.get("mark") or f"WF-{index+1:02d}").strip()
            coverage_mode = str(finish.get("coverageMode") or "full_height")
            colour = finish.get("color") or PALETTE[(index+6) % len(PALETTE)]
            if existing:
                dbid = str(existing["id"])
                display_description = str(existing.get("description") or existing.get("name") or "")
                description_changed = display_description != str(finish.get("description") or "")
                changed = any([
                    str(existing.get("code") or "") != code,
                    description_changed,
                    str(existing.get("material") or "") != str(finish.get("material") or ""),
                    float(existing.get("thickness_mm") or 0) != float(finish.get("thicknessMm") or 0),
                    str(existing.get("coverage_mode") or "full_height") != coverage_mode,
                    (existing.get("coverage_height_mm") or None) != (finish.get("coverageHeightMm") or None),
                    str(existing.get("display_colour") or "") != str(colour),
                ])
                stored_description = finish.get("description") if description_changed else existing.get("description")
                conn.execute(
                    """UPDATE wall_finish_definition SET code=%s,name=%s,description=%s,material=%s,thickness_mm=%s,
                           coverage_mode=%s,coverage_height_mm=%s,display_colour=%s,user_confirmed=(user_confirmed OR %s),updated_at=now() WHERE id=%s""",
                    (code, existing.get("name") or finish.get("description") or code, stored_description, finish.get("material"), finish.get("thicknessMm"),
                     coverage_mode, finish.get("coverageHeightMm"), colour, changed, dbid),
                )
            else:
                row = conn.execute(
                    """INSERT INTO wall_finish_definition(project_id,code,name,description,material,thickness_mm,coverage_mode,
                           coverage_height_mm,display_colour,user_confirmed,status,confidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,true,'active',1)
                       ON CONFLICT(project_id,code) DO UPDATE SET name=excluded.name,description=excluded.description,
                         material=excluded.material,thickness_mm=excluded.thickness_mm,coverage_mode=excluded.coverage_mode,
                         coverage_height_mm=excluded.coverage_height_mm,display_colour=excluded.display_colour,
                         user_confirmed=true,updated_at=now() RETURNING id""",
                    (pid, code, finish.get("description") or code, finish.get("description"), finish.get("material"),
                     finish.get("thicknessMm"), coverage_mode, finish.get("coverageHeightMm"), colour),
                ).fetchone()
                dbid = str(row["id"])
            finish_map[client_id] = dbid

        keep: set[str] = set()
        for index, wall in enumerate(walls):
            floor_id = str(wall.get("floorId") or "")
            ctx = ctx_by_floor.get(floor_id)
            if not ctx:
                continue
            start, end = wall.get("start") or {}, wall.get("end") or {}
            if not all(k in start and k in end for k in ("x", "y")):
                continue
            family_id = family_map.get(str(wall.get("familyId"))) or _safe_uuid(wall.get("familyId"))
            if not family_id:
                continue
            side_a = finish_map.get(str(wall.get("side1Finish"))) or _safe_uuid(wall.get("side1Finish"))
            side_b = finish_map.get(str(wall.get("side2Finish"))) or _safe_uuid(wall.get("side2Finish"))
            mmpp = float(ctx.get("mm_per_pixel") or 0)
            length_m = math.hypot(float(end["x"]) - float(start["x"]), float(end["y"]) - float(start["y"])) * mmpp / 1000.0 if mmpp else None
            height_m = float(wall.get("heightM") or 0)
            gross = length_m * height_m if length_m is not None and height_m > 0 else None
            deduction_present = "openingDeductionM2" in wall and wall.get("openingDeductionM2") is not None
            deduction = float(wall.get("openingDeductionM2") or 0)
            net = max(0.0, gross - deduction) if gross is not None else None
            wall_uuid = _safe_uuid(wall.get("id"))
            existing = conn.execute("SELECT * FROM wall_instance WHERE id=%s AND project_id=%s", (wall_uuid, pid)).fetchone() if wall_uuid else None
            status = str(wall.get("status") or "ready")
            confirmed = status == "confirmed"
            if existing:
                wid = str(existing["id"])
                old_side_a = str(existing.get("side_a_finish_id") or "") or None
                old_side_b = str(existing.get("side_b_finish_id") or "") or None
                old_height_m = float(existing.get("height_mm") or 0) / 1000.0
                height_changed = abs(old_height_m - height_m) > 1e-6
                height_source = "user" if height_changed else str(wall.get("heightSource") or existing.get("height_source") or "unknown")
                # When the editor moves a wall it deliberately clears its cached opening deduction. Invalidate stale host links too.
                if not deduction_present and float(existing.get("opening_deduction_m2") or 0) > 0:
                    conn.execute("DELETE FROM wall_opening_link WHERE wall_id=%s", (wid,))
                conn.execute(
                    """UPDATE wall_instance SET definition_id=%s,centerline=%s,source_viewport_id=%s,height_mm=%s,height_source=%s,
                           length_m=%s,gross_area_m2=%s,opening_deduction_m2=%s,net_area_m2=%s,side_a_finish_id=%s,
                           side_b_finish_id=%s,status=%s,user_confirmed=%s,updated_at=now() WHERE id=%s""",
                    (family_id, Jsonb([start,end]), str(wall.get("viewportId") or ctx["wall_viewport_id"]),
                     height_m*1000 if height_m else None, height_source, length_m, gross, deduction, net, side_a, side_b,
                     "confirmed" if confirmed else status, confirmed, wid),
                )
                replace_a = old_side_a != (str(side_a) if side_a else None)
                replace_b = old_side_b != (str(side_b) if side_b else None)
            else:
                row = conn.execute(
                    """INSERT INTO wall_instance(project_id,floor_id,source_viewport_id,source_key,definition_id,generated_centerline,
                           centerline,wall_kind,classification,height_mm,height_source,length_m,gross_area_m2,opening_deduction_m2,
                           net_area_m2,side_a_finish_id,side_b_finish_id,status,user_confirmed,confidence,source_evidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'user',%s,%s,%s,%s,%s,%s,%s,%s,1,%s) RETURNING id""",
                    (pid, floor_id, str(wall.get("viewportId") or ctx["wall_viewport_id"]),
                     f"user:{index}:{hashlib.sha1(json.dumps([start,end],sort_keys=True).encode()).hexdigest()[:10]}",
                     family_id, Jsonb([start,end]), Jsonb([start,end]), wall.get("wallKind") or "unknown",
                     str(wall.get("classification") or "unknown").lower(), height_m*1000 if height_m else None,
                     length_m, gross, deduction, net, side_a, side_b, "confirmed" if confirmed else status, confirmed,
                     Jsonb([{"kind":"user","text":"Edited/drawn in Quanto"}])),
                ).fetchone()
                wid = str(row["id"])
                replace_a = replace_b = True
            keep.add(wid)
            _sync_saved_face_side(
                conn, project_id=pid, floor_id=floor_id, wall_id=wid, side="A", selected_finish_id=str(side_a) if side_a else None,
                replace_side=replace_a, length_m=length_m, height_m=height_m, wall_deduction_m2=deduction, confirmed=confirmed,
            )
            _sync_saved_face_side(
                conn, project_id=pid, floor_id=floor_id, wall_id=wid, side="B", selected_finish_id=str(side_b) if side_b else None,
                replace_side=replace_b, length_m=length_m, height_m=height_m, wall_deduction_m2=deduction, confirmed=confirmed,
            )
        if keep:
            conn.execute("DELETE FROM wall_instance WHERE project_id=%s AND user_confirmed=false AND NOT (id = ANY(%s::uuid[]))", (pid, list(keep)))
        elif walls == []:
            conn.execute("DELETE FROM wall_instance WHERE project_id=%s AND user_confirmed=false", (pid,))
        conn.execute(
            """INSERT INTO takeoff_ui_state(project_id,module,state_json,updated_at) VALUES (%s,'walls',%s,now())
               ON CONFLICT(project_id,module) DO UPDATE SET state_json=excluded.state_json,updated_at=now()""",
            (pid, Jsonb(payload.get("uiState") or {})),
        )
    return wall_demo_state(pid)


def _is_in_situ_concrete_definition(row: dict[str, Any]) -> bool:
    kind = str(row.get("wall_kind") or "unknown").lower()
    if kind == "masonry":
        return False
    if kind == "concrete":
        return True
    text = " ".join(str(row.get(key) or "") for key in ("material", "construction", "name", "description")).lower()
    return bool(re.search(r"\breinforced\s+concrete\b|\bin[ -]?situ\s+concrete\b|(?:^|[^a-z])r\.?c\.?(?:[^a-z]|$)", text))


def wall_quantities(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    construction = fetch_all("""SELECT wd.id AS family_id,wd.code AS mark,wd.name,wd.description,wd.material,wd.wall_kind,wd.structural_role,
             wd.thickness_mm,COALESCE(wd.nrm_work_section,'Wall construction') AS work_section,
             SUM(COALESCE(wi.net_area_m2,0)*COALESCE(tf.typical_factor,1)) AS quantity,
             bool_and(wi.user_confirmed) AS confirmed
      FROM wall_instance wi JOIN wall_definition wd ON wd.id=wi.definition_id JOIN takeoff_floor tf ON tf.id=wi.floor_id
      WHERE wi.project_id=%s AND wi.include_in_boq=true GROUP BY wd.id,wd.code,wd.name,wd.description,wd.material,wd.wall_kind,
             wd.structural_role,wd.thickness_mm,wd.nrm_work_section ORDER BY wd.code""", (pid,))
    finishes = fetch_all("""SELECT wfd.id AS family_id,wfd.code AS mark,wfd.name,wfd.material,wfd.coverage_mode,
             SUM(COALESCE(wff.net_area_m2,0)*COALESCE(tf.typical_factor,1)) AS quantity,
             bool_and(wff.user_confirmed) AS confirmed
      FROM wall_face_finish wff JOIN wall_finish_definition wfd ON wfd.id=wff.finish_id JOIN takeoff_floor tf ON tf.id=wff.floor_id
      WHERE wff.project_id=%s GROUP BY wfd.id,wfd.code,wfd.name,wfd.material,wfd.coverage_mode ORDER BY wfd.code""", (pid,))

    # Related work for in-situ/reinforced concrete walls is deterministic where the wall
    # type and thickness are supported. Reinforcement is deliberately not guessed.
    detail_rows = fetch_all("""SELECT wi.id AS wall_id,wi.definition_id,wi.net_area_m2,wi.user_confirmed,tf.typical_factor,
              wd.code,wd.name,wd.description,wd.material,wd.construction,wd.wall_kind,wd.thickness_mm
       FROM wall_instance wi JOIN wall_definition wd ON wd.id=wi.definition_id JOIN takeoff_floor tf ON tf.id=wi.floor_id
       WHERE wi.project_id=%s AND wi.include_in_boq=true""", (pid,))
    opening_rows = fetch_all("SELECT wall_id,opening_type,width_mm,height_mm FROM wall_opening_link WHERE project_id=%s", (pid,))
    openings_by_wall: dict[str, list[dict[str, Any]]] = {}
    for opening in opening_rows:
        openings_by_wall.setdefault(str(opening["wall_id"]), []).append(opening)
    concrete_by_family: dict[str, dict[str, Any]] = {}
    for wall in detail_rows:
        if not _is_in_situ_concrete_definition(wall) or not wall.get("thickness_mm") or wall.get("net_area_m2") is None:
            continue
        family_id = str(wall["definition_id"])
        target = concrete_by_family.setdefault(family_id, {
            "family_id": family_id,
            "mark": wall.get("code"),
            "name": wall.get("name"),
            "thickness_mm": float(wall["thickness_mm"]),
            "concrete_volume_m3": 0.0,
            "main_face_formwork_m2": 0.0,
            "opening_reveal_formwork_m2": 0.0,
            "reinforcement_quantity": None,
            "reinforcement_status": "information_required",
            "confirmed": True,
            "note": "Concrete and main-face formwork are calculated from confirmed wall geometry. Reinforcement is not guessed without a supported reinforcement schedule/rate. Free-end/top formwork is not invented where termination evidence is unavailable.",
        })
        factor = float(wall.get("typical_factor") or 1)
        net_area = float(wall.get("net_area_m2") or 0)
        thickness_m = float(wall["thickness_mm"]) / 1000.0
        target["concrete_volume_m3"] += net_area * thickness_m * factor
        target["main_face_formwork_m2"] += 2.0 * net_area * factor
        target["confirmed"] = bool(target["confirmed"] and wall.get("user_confirmed"))
        for opening in openings_by_wall.get(str(wall["wall_id"]), []):
            if not opening.get("width_mm") or not opening.get("height_mm"):
                continue
            w_m, h_m = float(opening["width_mm"]) / 1000.0, float(opening["height_mm"]) / 1000.0
            perimeter_m = (2.0 * h_m + w_m) if str(opening.get("opening_type") or "").lower() == "door" else (2.0 * h_m + 2.0 * w_m)
            target["opening_reveal_formwork_m2"] += thickness_m * perimeter_m * factor
    concrete_wall_work = []
    for item in concrete_by_family.values():
        for key in ("concrete_volume_m3", "main_face_formwork_m2", "opening_reveal_formwork_m2"):
            item[key] = round(float(item[key]), 4)
        concrete_wall_work.append(item)
    concrete_wall_work.sort(key=lambda x: str(x.get("mark") or ""))

    unresolved = fetch_one("SELECT count(*) AS n FROM wall_review_item WHERE project_id=%s AND resolved=false", (pid,))
    return {
        "wall_construction": construction,
        "wall_finishes": finishes,
        "concrete_wall_work": concrete_wall_work,
        "unresolved_review_items": int(unresolved["n"]) if unresolved else 0,
    }

