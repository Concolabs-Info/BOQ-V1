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
from .harness.derived import recalculate_skirting_opening_deductions
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
from .model_schemas import OpeningCatalogOutput, OpeningDetailOutput, OpeningGeometryOutput
from .prompts import (
    OPENING_CATALOG_PROMPT,
    OPENING_CATALOG_SYSTEM,
    OPENING_DETAIL_PROMPT,
    OPENING_DETAIL_SYSTEM,
    OPENING_GEOMETRY_PROMPT,
    OPENING_SYSTEM,
)

OPENING_PROVIDER = "codex-account"
OPENING_MODEL_LABEL = "ChatGPT/Codex account"
OPENING_CACHE_VERSION = "quanto-doors-windows-account-cache-v1"
OPENING_PROMPT_VERSION = "doors-windows-account-v1"
_LOCKS: dict[str, threading.Lock] = {}
_LOCK_GUARD = threading.Lock()


def _runtime_dir(project_id: UUID | str) -> Path:
    path = project_root(project_id) / "doors-windows"
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


def _detail_path(project_id: UUID | str, viewport_id: UUID | str) -> Path:
    path = _runtime_dir(project_id) / "details"
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
                project_id, storey_id, viewport_id, storey["name"], storey["level_index"],
                _typical_factor(storey.get("typical_group")), ctx["crop_width_px"], ctx["crop_height_px"],
                mmpp, verified, ctx["crop_version"],
            ),
        ).fetchone()
    return dict(created)


def _scope(project_id: str) -> dict[str, Any]:
    from .scope.engine import get_scope
    return get_scope(project_id, "doors-windows", auto_run=True)


def _contexts(project_id: UUID | str) -> list[dict[str, Any]]:
    pid = str(project_id)
    ensure_takeoff_floors(pid)
    scope = _scope(pid)
    if scope.get("status") == "blocked":
        message = next(
            (x.get("message") for x in scope.get("coverage_gaps", []) if x.get("severity") == "blocked"),
            "Doors & Windows Scope is blocked",
        )
        raise RuntimeError(f"Doors & Windows Scope is not ready: {message}")
    contexts: list[dict[str, Any]] = []
    for level in scope.get("level_scopes") or []:
        storey_id = str(level.get("level_ref") or "")
        for viewport_value in level.get("primary_viewport_ids") or []:
            viewport_id = str(viewport_value)
            floor = _ensure_floor_identity(pid, storey_id, viewport_id)
            if not floor:
                continue
            crop_path, vp_ctx = ensure_viewport_crop(viewport_id)
            mmpp, verified = source_mm_per_pixel(viewport_id)
            contexts.append({
                **floor,
                "opening_viewport_id": viewport_id,
                "crop_path": Path(crop_path),
                "drawing_width": int(vp_ctx["crop_width_px"]),
                "drawing_height": int(vp_ctx["crop_height_px"]),
                "opening_crop_version": int(vp_ctx["crop_version"]),
                "mm_per_pixel": mmpp,
                "scale_verified": verified,
                "scope_ref": str(level.get("scope_ref") or storey_id),
            })
    return contexts


def _supporting_viewport_ids(project_id: str) -> list[str]:
    scope = _scope(project_id)
    ids: list[str] = []
    for item in scope.get("selected_viewports") or []:
        if item.get("role") in {"supporting_schedule", "supporting_detail", "supporting_vertical"}:
            value = str(item.get("viewport_id") or "")
            if value and value not in ids:
                ids.append(value)
    return ids


def _source_hash(project: dict[str, Any], ctx: dict[str, Any]) -> str:
    return content_hash({
        "cache_version": OPENING_CACHE_VERSION,
        "prompt_version": OPENING_PROMPT_VERSION,
        "frame_version": project.get("frame_version"),
        "viewport_id": str(ctx["opening_viewport_id"]),
        "crop_version": int(ctx.get("opening_crop_version") or 0),
        "drawing_width": int(ctx["drawing_width"]),
        "drawing_height": int(ctx["drawing_height"]),
        "mm_per_pixel": float(ctx["mm_per_pixel"]) if ctx.get("mm_per_pixel") else None,
        "crop_sha256": _file_sha256(Path(ctx["crop_path"])),
    })


def _load_geometry_cache(project_id: str, floor_id: str, viewport_id: str, source_hash: str) -> OpeningGeometryOutput | None:
    candidates = [_result_path(project_id, floor_id, viewport_id)]
    result_dir = _runtime_dir(project_id) / "results"
    if result_dir.exists():
        candidates.extend(path for path in result_dir.glob("*.json") if path not in candidates)
    for path in candidates:
        payload = _read_json(path, {})
        if payload.get("schema_version") != OPENING_CACHE_VERSION or payload.get("source_hash") != source_hash:
            continue
        try:
            return OpeningGeometryOutput.model_validate(payload.get("geometry") or {})
        except Exception:
            continue
    return None


def _save_geometry_cache(project_id: str, floor_id: str, viewport_id: str, source_hash: str, quality: str, output: OpeningGeometryOutput) -> None:
    _write_json(_result_path(project_id, floor_id, viewport_id), {
        "schema_version": OPENING_CACHE_VERSION,
        "provider": OPENING_PROVIDER,
        "source_hash": source_hash,
        "quality": quality,
        "geometry": output.model_dump(mode="json"),
    })


def _catalog_hash(project: dict[str, Any], text: str) -> str:
    return content_hash({
        "cache_version": OPENING_CACHE_VERSION,
        "prompt_version": OPENING_PROMPT_VERSION,
        "frame_version": project.get("frame_version"),
        "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
    })


def _load_catalog_cache(project_id: str, value_hash: str) -> OpeningCatalogOutput | None:
    payload = _read_json(_catalog_path(project_id), {})
    if payload.get("schema_version") != OPENING_CACHE_VERSION or payload.get("catalog_hash") != value_hash:
        return None
    try:
        return OpeningCatalogOutput.model_validate(payload.get("catalog") or {})
    except Exception:
        return None


def _save_catalog_cache(project_id: str, value_hash: str, quality: str, output: OpeningCatalogOutput) -> None:
    _write_json(_catalog_path(project_id), {
        "schema_version": OPENING_CACHE_VERSION,
        "provider": OPENING_PROVIDER,
        "catalog_hash": value_hash,
        "quality": quality,
        "catalog": output.model_dump(mode="json"),
    })


def _detail_hash(project: dict[str, Any], viewport_id: str) -> tuple[str, Path]:
    crop_path, ctx = ensure_viewport_crop(viewport_id)
    return content_hash({
        "cache_version": OPENING_CACHE_VERSION,
        "prompt_version": OPENING_PROMPT_VERSION,
        "frame_version": project.get("frame_version"),
        "viewport_id": viewport_id,
        "crop_version": int(ctx.get("crop_version") or 0),
        "crop_sha256": _file_sha256(Path(crop_path)),
    }), Path(crop_path)


def _load_detail_cache(project_id: str, viewport_id: str, source_hash: str) -> OpeningDetailOutput | None:
    payload = _read_json(_detail_path(project_id, viewport_id), {})
    if payload.get("schema_version") != OPENING_CACHE_VERSION or payload.get("source_hash") != source_hash:
        return None
    try:
        return OpeningDetailOutput.model_validate(payload.get("output") or {})
    except Exception:
        return None


def _save_detail_cache(project_id: str, viewport_id: str, source_hash: str, quality: str, output: OpeningDetailOutput) -> None:
    _write_json(_detail_path(project_id, viewport_id), {
        "schema_version": OPENING_CACHE_VERSION,
        "provider": OPENING_PROVIDER,
        "source_hash": source_hash,
        "quality": quality,
        "output": output.model_dump(mode="json"),
    })


def _catalog(project_id: str, project: dict[str, Any], quality: str, client: HarnessModelClient) -> OpeningCatalogOutput:
    text = project_text_evidence(project_id)
    if not text.strip():
        return OpeningCatalogOutput()
    value_hash = _catalog_hash(project, text)
    cached = _load_catalog_cache(project_id, value_hash)
    if cached is not None:
        return cached
    output = client.parse_text(
        OPENING_CATALOG_PROMPT.format(spec_text=text),
        OpeningCatalogOutput,
        system=OPENING_CATALOG_SYSTEM,
        quality=quality,
    )
    _save_catalog_cache(project_id, value_hash, quality, output)
    return output


def _detail_outputs(project_id: str, project: dict[str, Any], quality: str, client: HarnessModelClient, catalog: OpeningCatalogOutput) -> list[OpeningDetailOutput]:
    known_codes = ", ".join(sorted({x.code for x in catalog.definitions})) or "none"
    outputs: list[OpeningDetailOutput] = []
    for viewport_id in _supporting_viewport_ids(project_id):
        source_hash, crop_path = _detail_hash(project, viewport_id)
        cached = _load_detail_cache(project_id, viewport_id, source_hash)
        if cached is not None:
            outputs.append(cached)
            continue
        words = extract_viewport_text(viewport_id)
        output = client.parse_image(
            crop_path,
            OPENING_DETAIL_PROMPT.format(
                known_codes=known_codes,
                context="\n".join(f"{x['text']} @ {x['bbox']}" for x in words),
            ),
            OpeningDetailOutput,
            system=OPENING_DETAIL_SYSTEM,
            quality=quality,
        )
        _save_detail_cache(project_id, viewport_id, source_hash, quality, output)
        outputs.append(output)
    return outputs


def _definition_payloads(catalog: OpeningCatalogOutput, details: list[OpeningDetailOutput]) -> list[dict[str, Any]]:
    values = [x.model_dump(mode="json") for x in catalog.definitions]
    by_code = {_norm(x.get("code")): x for x in values}
    fields = (
        "width_mm", "height_mm", "thickness_mm", "sill_height_mm", "head_height_mm",
        "frame_material", "leaf_material", "glazing", "operation", "fire_rating", "acoustic_rating",
        "ironmongery_set", "finish",
    )
    for detail in details:
        for obs in detail.observations:
            code = _norm(obs.code)
            target = by_code.get(code) if code else None
            if not target:
                continue
            raw = obs.model_dump(mode="json")
            for field in fields:
                if target.get(field) in (None, "") and raw.get(field) not in (None, ""):
                    target[field] = raw[field]
            target.setdefault("detail_evidence", []).extend(raw.get("evidence") or [])
            target["confidence"] = max(float(target.get("confidence") or 0), float(raw.get("confidence") or 0))
    return values


def _ensure_fallback_definitions(project_id: str) -> dict[str, str]:
    result: dict[str, str] = {}
    with transaction() as conn:
        for index, (code, kind, label, colour) in enumerate((
            ("UNASSIGNED-D", "door", "Unassigned door", "#64748b"),
            ("UNASSIGNED-W", "window", "Unassigned window", "#64748b"),
        )):
            row = conn.execute(
                """INSERT INTO opening_definition(project_id,code,kind,name,description,display_colour,status,confidence,source_evidence)
                   VALUES (%s,%s,%s,%s,%s,%s,'active',0,%s)
                   ON CONFLICT(project_id,code) DO UPDATE SET status='active',updated_at=now() RETURNING id""",
                (project_id, code, kind, label, "Type requires schedule/detail assignment", colour,
                 Jsonb([{"kind": "system", "text": "Fallback definition; not a measured specification"}])),
            ).fetchone()
            result[kind] = str(row["id"])
    return result


def _upsert_definitions(project_id: str, definitions: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    with transaction() as conn:
        for index, item in enumerate(definitions):
            code = str(item.get("code") or "").strip()
            kind = str(item.get("kind") or "")
            if not code or kind not in {"door", "window"}:
                continue
            existing = conn.execute("SELECT * FROM opening_definition WHERE project_id=%s AND lower(code)=lower(%s)", (project_id, code)).fetchone()
            # A user-confirmed type is authoritative. Model refreshes may add new types, but must never silently overwrite it.
            if existing and existing.get("user_confirmed"):
                continue
            evidence = [{"kind": "schedule_spec", "text": item.get("source_text"), "confidence": item.get("confidence")}] + list(item.get("detail_evidence") or [])
            values = (
                kind, item.get("name") or code, item.get("description"), item.get("width_mm"), item.get("height_mm"),
                item.get("thickness_mm"), item.get("material"), item.get("frame_material"), item.get("leaf_material"),
                item.get("glazing"), item.get("operation"), item.get("leaf_count"), item.get("fire_rating"),
                item.get("acoustic_rating"), item.get("smoke_rating"), item.get("security_rating"), item.get("finish"),
                item.get("ironmongery_set"), item.get("sill_height_mm"), item.get("head_height_mm"), item.get("nrm_work_section"),
                item.get("scheduled_quantity"), item.get("location_text"), Jsonb(evidence), item.get("confidence"),
            )
            if existing:
                conn.execute(
                    """UPDATE opening_definition SET kind=%s,name=%s,description=%s,width_mm=%s,height_mm=%s,thickness_mm=%s,
                       material=%s,frame_material=%s,leaf_material=%s,glazing=%s,operation=%s,leaf_count=%s,fire_rating=%s,
                       acoustic_rating=%s,smoke_rating=%s,security_rating=%s,finish=%s,ironmongery_set=%s,sill_height_mm=%s,
                       head_height_mm=%s,nrm_work_section=%s,scheduled_quantity=%s,location_text=%s,source_evidence=%s,
                       confidence=%s,updated_at=now() WHERE id=%s""",
                    (*values, str(existing["id"])),
                )
            else:
                conn.execute(
                    """INSERT INTO opening_definition(project_id,code,kind,name,description,width_mm,height_mm,thickness_mm,
                       material,frame_material,leaf_material,glazing,operation,leaf_count,fire_rating,acoustic_rating,smoke_rating,
                       security_rating,finish,ironmongery_set,sill_height_mm,head_height_mm,nrm_work_section,scheduled_quantity,
                       location_text,display_colour,source_evidence,confidence,status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active')""",
                    (project_id, code, *values[:23], PALETTE[index % len(PALETTE)], values[23], values[24]),
                )
    rows = fetch_all("SELECT * FROM opening_definition WHERE project_id=%s AND status<>'deleted'", (project_id,))
    return {_norm(row["code"]): row for row in rows}


def _validate_geometry(output: OpeningGeometryOutput) -> None:
    width, height = output.source_width_px, output.source_height_px
    seen: set[str] = set()
    for opening in output.openings:
        if opening.opening_id in seen:
            raise RuntimeError(f"Duplicate opening_id {opening.opening_id}")
        seen.add(opening.opening_id)
        x, y, w, h = opening.bbox
        if x < 0 or y < 0 or x + w > width or y + h > height:
            raise RuntimeError(f"Opening {opening.opening_id} bbox is outside source image")
        if opening.center.x < 0 or opening.center.y < 0 or opening.center.x > width or opening.center.y > height:
            raise RuntimeError(f"Opening {opening.opening_id} center is outside source image")


def _point_segment_distance(px: float, py: float, a: dict[str, Any], b: dict[str, Any]) -> float:
    ax, ay, bx, by = float(a["x"]), float(a["y"]), float(b["x"]), float(b["y"])
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _nearest_wall(project_id: str, floor_id: str, viewport_id: str, center: dict[str, Any], mmpp: float | None) -> str | None:
    rows = fetch_all(
        "SELECT id,centerline,thickness_mm FROM wall_instance WHERE project_id=%s AND floor_id=%s AND source_viewport_id=%s AND status<>'deleted'",
        (project_id, floor_id, viewport_id),
    )
    best: tuple[float, str] | None = None
    for row in rows:
        line = row.get("centerline") or []
        if len(line) < 2:
            continue
        distance = min(_point_segment_distance(float(center["x"]), float(center["y"]), line[i], line[i + 1]) for i in range(len(line) - 1))
        tolerance = 35.0
        if mmpp and row.get("thickness_mm"):
            tolerance = max(tolerance, float(row["thickness_mm"]) / float(mmpp) / 2.0 + 18.0)
        if distance <= tolerance and (best is None or distance < best[0]):
            best = (distance, str(row["id"]))
    return best[1] if best else None


def _opening_metrics(width_mm: float | None, height_mm: float | None, kind: str) -> tuple[float | None, float | None]:
    if not width_mm or not height_mm:
        return None, None
    area = float(width_mm) * float(height_mm) / 1_000_000.0
    perimeter = (float(width_mm) + 2.0 * float(height_mm)) / 1000.0 if kind == "door" else (2.0 * float(width_mm) + 2.0 * float(height_mm)) / 1000.0
    return round(area, 4), round(perimeter, 4)


def _sync_wall_face_metrics(conn: Any, wall_id: str, wall_deduction: float) -> None:
    wall = conn.execute("SELECT length_m,height_mm,gross_area_m2 FROM wall_instance WHERE id=%s", (wall_id,)).fetchone()
    if not wall:
        return
    gross_wall = float(wall.get("gross_area_m2") or 0)
    conn.execute("UPDATE wall_instance SET opening_deduction_m2=%s,net_area_m2=%s,updated_at=now() WHERE id=%s", (wall_deduction, max(0.0, gross_wall - wall_deduction), wall_id))
    links = conn.execute(
        "SELECT opening_type,width_mm,height_mm,deduction_area_m2 FROM wall_opening_link WHERE wall_id=%s",
        (wall_id,),
    ).fetchall()
    faces = conn.execute(
        """SELECT wff.id,wff.coverage_mode,wff.coverage_height_mm,wff.gross_area_m2,wfd.coverage_mode AS def_mode,wfd.coverage_height_mm AS def_height
           FROM wall_face_finish wff JOIN wall_finish_definition wfd ON wfd.id=wff.finish_id WHERE wff.wall_id=%s""",
        (wall_id,),
    ).fetchall()
    has_non_door = any(str(link.get("opening_type") or "") != "door" for link in links)
    has_partial_finish = False
    for face in faces:
        mode = str(face.get("coverage_mode") or face.get("def_mode") or "full_height")
        gross = face.get("gross_area_m2")
        if gross is None:
            continue
        if mode == "full_height":
            deduct = min(wall_deduction, float(gross))
        else:
            has_partial_finish = True
            coverage_height = face.get("coverage_height_mm") or face.get("def_height")
            deduct = 0.0
            if coverage_height:
                for link in links:
                    if str(link.get("opening_type") or "") != "door":
                        continue
                    width_mm, height_mm = link.get("width_mm"), link.get("height_mm")
                    if width_mm and height_mm:
                        deduct += float(width_mm) * min(float(height_mm), float(coverage_height)) / 1_000_000.0
            deduct = min(deduct, float(gross))
        conn.execute("UPDATE wall_face_finish SET opening_deduction_m2=%s,net_area_m2=%s,updated_at=now() WHERE id=%s", (deduct, max(0.0, float(gross) - deduct), str(face["id"])))
    # Window/unknown vertical overlap with a partial-height finish cannot be inferred from a plan alone.
    conn.execute("DELETE FROM wall_review_item WHERE wall_id=%s AND code='doors_windows_partial_finish_opening_overlap' AND resolved=false", (wall_id,))
    if has_partial_finish and has_non_door:
        conn.execute(
            """INSERT INTO wall_review_item(project_id,floor_id,wall_id,severity,code,message)
               SELECT project_id,floor_id,id,'warning','doors_windows_partial_finish_opening_overlap',
                      'A partial-height wall finish intersects a production window/opening. Vertical overlap is not known from plan evidence, so no unsupported finish deduction was guessed.'
               FROM wall_instance WHERE id=%s""",
            (wall_id,),
        )



def _refresh_opening_review_state(conn: Any, opening_id: str) -> None:
    row = conn.execute(
        """SELECT oi.*,od.code AS definition_code,COALESCE(oi.clear_width_mm,od.width_mm) AS resolved_width_mm,
                  COALESCE(oi.clear_height_mm,od.height_mm) AS resolved_height_mm
           FROM opening_instance oi LEFT JOIN opening_definition od ON od.id=oi.definition_id WHERE oi.id=%s""",
        (opening_id,),
    ).fetchone()
    if not row:
        return
    codes = ("type_unresolved", "size_unresolved", "host_wall_unresolved", "low_confidence")
    conn.execute(
        "DELETE FROM opening_review_item WHERE opening_id=%s AND resolved=false AND code = ANY(%s::text[])",
        (opening_id, list(codes)),
    )
    label = row.get("opening_tag") or row.get("source_key") or opening_id
    unresolved: list[tuple[str, str]] = []
    if not row.get("definition_id") or str(row.get("definition_code") or "").startswith("UNASSIGNED-"):
        unresolved.append(("type_unresolved", f"Opening {label} has no reliably matched door/window schedule type."))
    if not row.get("resolved_width_mm") or not row.get("resolved_height_mm"):
        unresolved.append(("size_unresolved", f"Opening {label} does not have both supported width and height; wall deduction/size description remains incomplete."))
    if not row.get("host_wall_id"):
        unresolved.append(("host_wall_unresolved", f"Opening {label} is not yet linked to a production Wall on the same plan. It will be re-matched automatically after Wall geometry is available, or can be assigned manually."))
    if float(row.get("confidence") or 0) < 0.70 and not row.get("user_confirmed"):
        unresolved.append(("low_confidence", f"Opening {label} has low plan-detection confidence and needs visual review."))
    for code, message in unresolved:
        conn.execute(
            "INSERT INTO opening_review_item(project_id,floor_id,opening_id,severity,code,message) VALUES (%s,%s,%s,'warning',%s,%s)",
            (str(row["project_id"]), str(row["floor_id"]), opening_id, code, message),
        )
    if not row.get("user_confirmed"):
        conn.execute(
            "UPDATE opening_instance SET status=%s,updated_at=now() WHERE id=%s",
            ("needs_review" if unresolved else "ready", opening_id),
        )

def sync_openings_to_walls(project_id: UUID | str, floor_id: UUID | str, *, authoritative: bool | None = None) -> None:
    """Make Doors & Windows canonical for wall deductions and re-host saved openings after Walls exist.

    ``authoritative=None`` is safe for calls from Walls: an empty Doors/Windows table does not erase Wall-engine
    opening candidates unless a completed Doors/Windows fact proves that the empty result is intentional.
    """
    pid, fid = str(project_id), str(floor_id)
    openings = fetch_all(
        """SELECT oi.*,od.width_mm AS family_width_mm,od.height_mm AS family_height_mm
           FROM opening_instance oi LEFT JOIN opening_definition od ON od.id=oi.definition_id
           WHERE oi.project_id=%s AND oi.floor_id=%s AND oi.status<>'deleted'""",
        (pid, fid),
    )
    walls = fetch_all("SELECT id FROM wall_instance WHERE project_id=%s AND floor_id=%s", (pid, fid))
    wall_ids = [str(x["id"]) for x in walls]
    floor = fetch_one("SELECT mm_per_pixel,storey_id FROM takeoff_floor WHERE id=%s", (fid,)) or {}
    mmpp = float(floor["mm_per_pixel"]) if floor.get("mm_per_pixel") else None
    if authoritative is None:
        authoritative = bool(openings)
        if not authoritative and floor.get("storey_id"):
            project = fetch_one("SELECT frame_version FROM project WHERE id=%s", (pid,)) or {}
            fact = fetch_one(
                """SELECT 1 AS yes FROM takeoff_fact_set WHERE project_id=%s AND publisher_element='doors-windows'
                   AND fact_type='opening_area' AND scope_ref=%s AND frame_version=%s AND status IN ('complete','complete_empty') LIMIT 1""",
                (pid, str(floor["storey_id"]), int(project.get("frame_version") or 0)),
            )
            authoritative = bool(fact)
    if not authoritative:
        return

    # Doors/Windows can be analyzed before Walls. Resolve missing hosts lazily once compatible wall geometry exists.
    if wall_ids:
        for item in openings:
            if item.get("host_wall_id") or not item.get("source_viewport_id") or not item.get("center"):
                continue
            host = _nearest_wall(pid, fid, str(item["source_viewport_id"]), item.get("center") or {}, mmpp)
            if host:
                item["host_wall_id"] = host

    with transaction() as conn:
        for item in openings:
            if item.get("host_wall_id"):
                conn.execute("UPDATE opening_instance SET host_wall_id=%s,updated_at=now() WHERE id=%s", (str(item["host_wall_id"]), str(item["id"])))

        if wall_ids:
            conn.execute("DELETE FROM wall_opening_link WHERE floor_id=%s AND opening_type IN ('door','window')", (fid,))
            for item in openings:
                host = item.get("host_wall_id")
                if not host:
                    continue
                width = item.get("clear_width_mm") or item.get("family_width_mm")
                height = item.get("clear_height_mm") or item.get("family_height_mm")
                area, _ = _opening_metrics(width, height, str(item.get("kind") or "door"))
                deduction = area if area is not None and area > 0.5 else 0.0
                link_status = "ready" if width and height and (float(item.get("confidence") or 0) >= 0.70 or item.get("user_confirmed")) else "needs_review"
                conn.execute(
                    """INSERT INTO wall_opening_link(project_id,floor_id,wall_id,source_key,opening_tag,opening_type,center,width_mm,height_mm,
                           gross_area_m2,deduction_area_m2,source,confidence,status,source_evidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'doors_windows_module',%s,%s,%s)
                       ON CONFLICT(wall_id,source_key) DO UPDATE SET opening_tag=excluded.opening_tag,opening_type=excluded.opening_type,
                         center=excluded.center,width_mm=excluded.width_mm,height_mm=excluded.height_mm,gross_area_m2=excluded.gross_area_m2,
                         deduction_area_m2=excluded.deduction_area_m2,source='doors_windows_module',confidence=excluded.confidence,
                         status=excluded.status,source_evidence=excluded.source_evidence,updated_at=now()""",
                    (pid, fid, str(host), f"doors-windows:{item['id']}", item.get("opening_tag"), item.get("kind"),
                     Jsonb(item.get("center") or {}), width, height, area, deduction, item.get("confidence"), link_status,
                     Jsonb(item.get("source_evidence") or [])),
                )
            for wall_id in wall_ids:
                row = conn.execute("SELECT COALESCE(SUM(deduction_area_m2),0) AS d FROM wall_opening_link WHERE wall_id=%s", (wall_id,)).fetchone()
                _sync_wall_face_metrics(conn, wall_id, float(row["d"] or 0))

        for item in openings:
            _refresh_opening_review_state(conn, str(item["id"]))


def _publish_opening_facts(project_id: str, floor_ids: list[str]) -> None:
    project = fetch_one("SELECT frame_version FROM project WHERE id=%s", (project_id,)) or {}
    version = int(project.get("frame_version") or 0)
    with transaction() as conn:
        for floor_id in floor_ids:
            floor = conn.execute("SELECT storey_id FROM takeoff_floor WHERE id=%s", (floor_id,)).fetchone()
            if not floor:
                continue
            rows = conn.execute(
                """SELECT oi.kind,oi.opening_tag,COALESCE(oi.clear_width_mm,od.width_mm) AS width_mm,
                          COALESCE(oi.clear_height_mm,od.height_mm) AS height_mm
                   FROM opening_instance oi LEFT JOIN opening_definition od ON od.id=oi.definition_id
                   WHERE oi.project_id=%s AND oi.floor_id=%s AND oi.status<>'deleted'""",
                (project_id, floor_id),
            ).fetchall()
            payload_items = []
            total_area = 0.0
            for row in rows:
                area, _ = _opening_metrics(row.get("width_mm"), row.get("height_mm"), str(row.get("kind") or "door"))
                if area is not None:
                    total_area += area
                payload_items.append({"kind": row.get("kind"), "tag": row.get("opening_tag"), "width_mm": row.get("width_mm"), "height_mm": row.get("height_mm"), "area_m2": area})
            status = "complete" if rows else "complete_empty"
            conn.execute(
                """INSERT INTO takeoff_fact_set(project_id,publisher_element,fact_type,scope_ref,frame_version,status,payload_json,fact_version,updated_at)
                   VALUES (%s,'doors-windows','opening_area',%s,%s,%s,%s,1,now())
                   ON CONFLICT(project_id,publisher_element,fact_type,scope_ref,frame_version)
                   DO UPDATE SET status=excluded.status,payload_json=excluded.payload_json,fact_version=takeoff_fact_set.fact_version+1,updated_at=now()""",
                (project_id, str(floor["storey_id"]), version, status, Jsonb({"count": len(rows), "gross_opening_area_m2": round(total_area, 4), "openings": payload_items})),
            )


def _insert_geometry(project_id: str, ctx: dict[str, Any], geometry: OpeningGeometryOutput, definitions: dict[str, dict[str, Any]]) -> dict[str, Any]:
    fid, viewport_id = str(ctx["id"]), str(ctx["opening_viewport_id"])
    fallback = _ensure_fallback_definitions(project_id)
    with transaction() as conn:
        conn.execute("DELETE FROM opening_review_item WHERE project_id=%s AND floor_id=%s AND resolved=false", (project_id, fid))
        conn.execute("DELETE FROM opening_instance WHERE project_id=%s AND floor_id=%s AND source_viewport_id=%s AND user_confirmed=false", (project_id, fid, viewport_id))
        inserted = 0
        for item in geometry.openings:
            tag_key = _norm(item.tag)
            definition = definitions.get(tag_key) if tag_key else None
            family_id = str(definition["id"]) if definition else fallback[item.kind]
            width_mm = float(definition["width_mm"]) if definition and definition.get("width_mm") else (float(item.visible_width_px) * float(ctx["mm_per_pixel"]) if item.visible_width_px and ctx.get("mm_per_pixel") else None)
            height_mm = float(definition["height_mm"]) if definition and definition.get("height_mm") else None
            area, perimeter = _opening_metrics(width_mm, height_mm, item.kind)
            center = item.center.model_dump(mode="json")
            host = _nearest_wall(project_id, fid, viewport_id, center, ctx.get("mm_per_pixel"))
            needs_review = not definition or not width_mm or not height_mm or float(item.confidence) < 0.70
            evidence = [x.model_dump(mode="json") for x in item.evidence]
            row = conn.execute(
                """INSERT INTO opening_instance(project_id,floor_id,source_viewport_id,source_key,definition_id,host_wall_id,kind,opening_tag,
                       generated_bbox,bbox,center,orientation_degrees,visible_width_px,clear_width_mm,clear_height_mm,gross_opening_area_m2,
                       frame_perimeter_m,sill_height_mm,head_height_mm,operation_hint,status,user_confirmed,confidence,source_evidence)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,false,%s,%s)
                   ON CONFLICT(floor_id,source_viewport_id,source_key) DO UPDATE SET definition_id=excluded.definition_id,
                     host_wall_id=excluded.host_wall_id,kind=excluded.kind,opening_tag=excluded.opening_tag,generated_bbox=excluded.generated_bbox,
                     bbox=excluded.bbox,center=excluded.center,orientation_degrees=excluded.orientation_degrees,visible_width_px=excluded.visible_width_px,
                     clear_width_mm=excluded.clear_width_mm,clear_height_mm=excluded.clear_height_mm,gross_opening_area_m2=excluded.gross_opening_area_m2,
                     frame_perimeter_m=excluded.frame_perimeter_m,sill_height_mm=excluded.sill_height_mm,head_height_mm=excluded.head_height_mm,
                     operation_hint=excluded.operation_hint,status=excluded.status,confidence=excluded.confidence,source_evidence=excluded.source_evidence,
                     updated_at=now() RETURNING id""",
                (project_id, fid, viewport_id, item.opening_id, family_id, host, item.kind, item.tag,
                 Jsonb({"x": item.bbox[0], "y": item.bbox[1], "width": item.bbox[2], "height": item.bbox[3]}),
                 Jsonb({"x": item.bbox[0], "y": item.bbox[1], "width": item.bbox[2], "height": item.bbox[3]}), Jsonb(center),
                 item.orientation_degrees, item.visible_width_px, width_mm, height_mm, area, perimeter,
                 definition.get("sill_height_mm") if definition else None, definition.get("head_height_mm") if definition else None,
                 item.operation_hint or (definition.get("operation") if definition else None), "needs_review" if needs_review else "ready",
                 item.confidence, Jsonb(evidence)),
            ).fetchone()
            oid = str(row["id"])
            inserted += 1
            if not definition:
                conn.execute("INSERT INTO opening_review_item(project_id,floor_id,opening_id,code,message) VALUES (%s,%s,%s,'type_unresolved',%s)", (project_id, fid, oid, f"Opening {item.tag or item.opening_id} has no reliably matched door/window schedule type."))
            if not width_mm or not height_mm:
                conn.execute("INSERT INTO opening_review_item(project_id,floor_id,opening_id,code,message) VALUES (%s,%s,%s,'size_unresolved',%s)", (project_id, fid, oid, f"Opening {item.tag or item.opening_id} does not have both supported width and height; wall deduction/size description remains incomplete."))
            if not host:
                conn.execute("INSERT INTO opening_review_item(project_id,floor_id,opening_id,code,message) VALUES (%s,%s,%s,'host_wall_unresolved',%s)", (project_id, fid, oid, f"Opening {item.tag or item.opening_id} could not be linked safely to a production Wall on the same plan."))
            if float(item.confidence) < 0.70:
                conn.execute("INSERT INTO opening_review_item(project_id,floor_id,opening_id,code,message) VALUES (%s,%s,%s,'low_confidence',%s)", (project_id, fid, oid, f"Opening {item.tag or item.opening_id} has low plan-detection confidence and needs visual review."))
    sync_openings_to_walls(project_id, fid, authoritative=True)
    # Door widths are a downstream deduction from Floor skirting, not a second floor detection.
    recalculate_skirting_opening_deductions(project_id, fid)
    return {"openings": inserted}


def _schedule_reconciliation(project_id: str) -> None:
    with transaction() as conn:
        conn.execute("DELETE FROM opening_review_item WHERE project_id=%s AND code='schedule_count_mismatch' AND resolved=false", (project_id,))
        rows = conn.execute(
            """SELECT od.id,od.code,od.kind,od.scheduled_quantity,
                      COALESCE(SUM(CASE WHEN oi.include_in_boq THEN tf.typical_factor ELSE 0 END),0) AS detected_quantity
               FROM opening_definition od LEFT JOIN opening_instance oi ON oi.definition_id=od.id AND oi.status<>'deleted'
               LEFT JOIN takeoff_floor tf ON tf.id=oi.floor_id
               WHERE od.project_id=%s AND od.scheduled_quantity IS NOT NULL AND od.code NOT LIKE 'UNASSIGNED-%%'
               GROUP BY od.id,od.code,od.kind,od.scheduled_quantity""",
            (project_id,),
        ).fetchall()
        for row in rows:
            scheduled, detected = float(row["scheduled_quantity"]), float(row["detected_quantity"] or 0)
            if abs(scheduled - detected) > 0.001:
                conn.execute(
                    """INSERT INTO opening_review_item(project_id,severity,code,message)
                       VALUES (%s,'warning','schedule_count_mismatch',%s)""",
                    (project_id, f"{row['code']} schedule quantity is {scheduled:g}, while detected plan quantity after storey repetition is {detected:g}. Reconcile the schedule and plans before final BOQ confirmation."),
                )


def _start_run(project_id: str, floor_id: str | None, request_hash: str) -> str:
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO takeoff_analysis_run(project_id,floor_id,module,task_type,provider,model_id,prompt_version,status,progress,message,request_hash)
               VALUES (%s,%s,'doors-windows','opening_geometry',%s,%s,%s,'running',5,'Starting Doors & Windows analysis',%s) RETURNING id""",
            (project_id, floor_id, OPENING_PROVIDER, OPENING_MODEL_LABEL, OPENING_PROMPT_VERSION, request_hash),
        ).fetchone()
    return str(row["id"])


def _finish_run(run_id: str, *, status: str, message: str, result: Any = None, error: str | None = None) -> None:
    with transaction() as conn:
        conn.execute(
            "UPDATE takeoff_analysis_run SET status=%s,progress=100,message=%s,result_json=%s,error_message=%s,updated_at=now() WHERE id=%s",
            (status, message, Jsonb(result) if result is not None else None, error, run_id),
        )


def analyze_opening_context(project_id: UUID | str, floor_id: UUID | str, viewport_id: UUID | str, quality: str = "medium", *, force: bool = False) -> dict[str, Any]:
    pid, fid, vid = str(project_id), str(floor_id), str(viewport_id)
    project = require_frozen_project(pid)
    ctx = next((x for x in _contexts(pid) if str(x["id"]) == fid and str(x["opening_viewport_id"]) == vid), None)
    if not ctx:
        raise ValueError("Doors & Windows floor/viewport context not found")
    if not ctx.get("scale_verified") or not ctx.get("mm_per_pixel"):
        raise RuntimeError("Confirm the controlling Doors & Windows plan scale in Pre before opening analysis.")
    source_hash = _source_hash(project, ctx)
    existing = fetch_one("SELECT count(*) AS n FROM opening_instance WHERE project_id=%s AND floor_id=%s AND source_viewport_id=%s", (pid, fid, vid))
    if existing and int(existing["n"]) > 0 and not force:
        return {"openings": int(existing["n"]), "skipped": True, "cached": True, "reason": "saved opening geometry", "source_hash": source_hash}
    if force:
        confirmed = fetch_one("SELECT count(*) AS n FROM opening_instance WHERE project_id=%s AND floor_id=%s AND source_viewport_id=%s AND user_confirmed=true", (pid, fid, vid))
        if confirmed and int(confirmed["n"]) > 0:
            raise RuntimeError("This drawing contains user-confirmed Doors/Windows. Clear or replace them explicitly before rerunning detection so confirmed work is never overwritten.")
    auth = codex_account_status()
    if not auth.get("available"):
        raise RuntimeError(auth.get("error") or "Doors & Windows account detection is not installed")
    if not auth.get("authenticated"):
        raise RuntimeError("Connect a ChatGPT account in the Doors & Windows workspace before running detection.")
    client = HarnessModelClient("doors-windows", pid)
    catalog = _catalog(pid, project, quality, client)
    details = _detail_outputs(pid, project, quality, client, catalog)
    definitions = _upsert_definitions(pid, _definition_payloads(catalog, details))
    cached = None if force else _load_geometry_cache(pid, fid, vid, source_hash)
    run_id = _start_run(pid, fid, source_hash)
    try:
        if cached is not None:
            geometry = cached
        else:
            words = extract_viewport_text(vid)
            geometry = client.parse_image(
                ctx["crop_path"],
                OPENING_GEOMETRY_PROMPT.format(
                    width=ctx["drawing_width"], height=ctx["drawing_height"], floor_name=ctx["name"],
                    mm_per_pixel=round(float(ctx["mm_per_pixel"]), 6),
                    context="\n".join(f"{x['text']} @ {x['bbox']}" for x in words),
                ),
                OpeningGeometryOutput,
                system=OPENING_SYSTEM,
                quality=quality,
            )
            if geometry.source_width_px != int(ctx["drawing_width"]) or geometry.source_height_px != int(ctx["drawing_height"]):
                raise RuntimeError(
                    f"AI coordinate space mismatch: returned {geometry.source_width_px}x{geometry.source_height_px}, expected {ctx['drawing_width']}x{ctx['drawing_height']}. The result was rejected rather than silently rescaled."
                )
            _validate_geometry(geometry)
            _save_geometry_cache(pid, fid, vid, source_hash, quality, geometry)
        result = _insert_geometry(pid, ctx, geometry, definitions)
        result.update({"cached": cached is not None, "source_hash": source_hash, "warnings": geometry.warnings + catalog.warnings, "questions": geometry.questions})
        _finish_run(run_id, status="completed", message="Doors & Windows analysis complete", result=result)
        return result
    except Exception as exc:
        _finish_run(run_id, status="failed", message="Doors & Windows analysis failed", error=str(exc))
        raise


def analyze_project_openings(project_id: UUID | str, quality: str = "medium", *, force: bool = False, progress_callback: Any | None = None) -> dict[str, Any]:
    pid = str(project_id)
    contexts = _contexts(pid)
    if not contexts:
        raise RuntimeError("No Doors & Windows measurement plans are available from Scope.")
    results = []
    floor_ids: list[str] = []
    for index, ctx in enumerate(contexts, start=1):
        if progress_callback:
            progress_callback(index, len(contexts), ctx)
        floor_ids.append(str(ctx["id"]))
        results.append({"floor_id": str(ctx["id"]), "viewport_id": str(ctx["opening_viewport_id"]), **analyze_opening_context(pid, ctx["id"], ctx["opening_viewport_id"], quality, force=force)})
    _schedule_reconciliation(pid)
    _publish_opening_facts(pid, sorted(set(floor_ids)))
    return {"drawings": results}


def _run_analysis(project_id: str, quality: str, force: bool, *, lock_acquired: bool = False) -> None:
    lock = _lock(project_id)
    if not lock_acquired and not lock.acquire(blocking=False):
        return
    try:
        _set_status(project_id, "running", 3, "Preparing Doors & Windows drawings")
        def progress(index: int, total: int, ctx: dict[str, Any]) -> None:
            pct = 8 + int(((index - 1) / max(total, 1)) * 84)
            _set_status(project_id, "running", pct, f"Detecting doors & windows · {ctx.get('name') or f'floor {index}'}", current=index, total=total, floor_id=str(ctx.get("id") or ""))
        result, _harness_report = run_element_harness(
            project_id, "doors-windows", quality, force,
            lambda: analyze_project_openings(project_id, quality, force=force, progress_callback=progress),
            evaluate_element, publish_element_facts,
        )
        _set_status(
            project_id, "completed", 100, "Doors & Windows analysis complete", result=result,
            harness_status=_harness_report.status,
            harness_issues=[
                {"code": issue.code, "message": issue.message, "severity": issue.severity, "entity_refs": list(issue.entity_refs)}
                for issue in _harness_report.issues
            ],
            harness_stats=_harness_report.stats,
        )
    except Exception as exc:  # noqa: BLE001
        _set_status(project_id, "failed", 100, "Doors & Windows analysis failed", error_message=str(exc)[:1000], traceback=traceback.format_exc(limit=6))
    finally:
        lock.release()


def start_opening_analysis(project_id: UUID | str, quality: str = "medium", *, force: bool = False) -> dict[str, Any]:
    pid = str(project_id)
    require_frozen_project(pid)
    auth = codex_account_status()
    if not auth.get("available"):
        raise RuntimeError(auth.get("error") or "Doors & Windows account detection is not installed")
    if not auth.get("authenticated"):
        raise RuntimeError("Connect a ChatGPT account in the Doors & Windows workspace before running detection.")
    if force:
        confirmed = fetch_one("SELECT count(*) AS n FROM opening_instance WHERE project_id=%s AND user_confirmed=true", (pid,))
        if confirmed and int(confirmed["n"]) > 0:
            raise RuntimeError("This project contains user-confirmed Doors/Windows. Clear or replace them explicitly before rerunning detection so confirmed work is never overwritten.")
    lock = _lock(pid)
    if not lock.acquire(blocking=False):
        return _read_json(_status_path(pid), {"status": "running", "progress": 1, "message": "Preparing Doors & Windows drawings"})
    status = _set_status(pid, "running", 1, "Preparing Doors & Windows drawings")
    thread = threading.Thread(target=_run_analysis, kwargs={"project_id": pid, "quality": quality, "force": force, "lock_acquired": True}, daemon=True, name=f"doors-windows-{pid[:8]}")
    try:
        thread.start()
    except Exception:
        lock.release()
        raise
    return status


def opening_analysis_status(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    status = _read_json(_status_path(pid), {})
    if status:
        if status.get("status") == "running" and not _lock(pid).locked():
            return _set_status(pid, "failed", int(status.get("progress") or 0), "Previous Doors & Windows run was interrupted. Retry will reuse saved/cached evidence.", error_message="interrupted", recoverable=True)
        return status
    run = fetch_one("SELECT status,progress,message,error_message FROM takeoff_analysis_run WHERE project_id=%s AND module='doors-windows' ORDER BY created_at DESC LIMIT 1", (pid,))
    return run or {"status": "not_started", "progress": 0, "message": None, "error_message": None}


def _demo_context(project_id: str) -> dict[str, Any]:
    contexts = _contexts(project_id)
    scope = _scope(project_id)
    sheets: list[dict[str, Any]] = []
    viewports: list[dict[str, Any]] = []
    storeys: list[dict[str, Any]] = []
    seen_vp: set[str] = set()
    ctx_by_vp = {str(x["opening_viewport_id"]): x for x in contexts}
    selected = scope.get("selected_viewports") or []
    for item in selected:
        viewport_id = str(item.get("viewport_id") or "")
        if not viewport_id or viewport_id in seen_vp:
            continue
        try:
            crop_path, vp_ctx = ensure_viewport_crop(viewport_id)
            del crop_path
        except Exception:
            continue
        source = fetch_one("SELECT name,view_kind,level_label FROM viewport WHERE id=%s", (viewport_id,)) or {}
        ctx = ctx_by_vp.get(viewport_id)
        sid = f"opening-sheet-{viewport_id}"
        category = str(source.get("view_kind") or "detail")
        if category not in {"plan", "section", "elevation", "detail", "schedule"}:
            category = "detail"
        sheets.append({"id": sid, "sheetNo": "", "title": source.get("name") or "Doors & Windows evidence", "revision": "", "image": f"/api/v1/viewports/{viewport_id}/crop", "page": len(sheets) + 1, "included": True, "width": int(vp_ctx["crop_width_px"]), "height": int(vp_ctx["crop_height_px"])})
        viewports.append({"id": viewport_id, "name": source.get("name") or source.get("level_label") or "Doors & Windows evidence", "category": category, "sheetId": sid, "bbox": [0, 0, int(vp_ctx["crop_width_px"]), int(vp_ctx["crop_height_px"])], "status": "confirmed", "scaleMPerPx": float(ctx["mm_per_pixel"]) / 1000.0 if ctx and ctx.get("mm_per_pixel") else None, "scopeRole": item.get("role")})
        seen_vp.add(viewport_id)
    for ctx in contexts:
        if str(ctx["opening_viewport_id"]) not in seen_vp:
            viewport_id = str(ctx["opening_viewport_id"])
            sid = f"opening-sheet-{viewport_id}"
            sheets.append({"id": sid, "sheetNo": str(ctx.get("level_index") or ""), "title": ctx["name"], "revision": "", "image": f"/api/v1/viewports/{viewport_id}/crop", "page": len(sheets) + 1, "included": True, "width": ctx["drawing_width"], "height": ctx["drawing_height"]})
            viewports.append({"id": viewport_id, "name": ctx["name"], "category": "plan", "sheetId": sid, "bbox": [0, 0, ctx["drawing_width"], ctx["drawing_height"]], "status": "confirmed", "scaleMPerPx": float(ctx["mm_per_pixel"]) / 1000.0 if ctx.get("mm_per_pixel") else None, "scopeRole": "primary_measurement"})
            seen_vp.add(viewport_id)
        storeys.append({"id": str(ctx["id"]), "name": ctx["name"], "levelIndex": int(ctx.get("level_index") or 0), "factor": int(ctx.get("typical_factor") or 1), "heightM": 0.0, "status": "confirmed"})
    unique_storeys = {x["id"]: x for x in storeys}
    return {"sheets": sheets, "viewports": viewports, "storeys": list(unique_storeys.values())}


def _production_walls(project_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    families = [{
        "id": str(r["id"]), "mark": r["code"], "description": r.get("description") or r["name"],
        "thicknessMm": float(r.get("thickness_mm") or 0),
        "classification": {"external": "External", "internal": "Internal", "both": "Both"}.get(str(r.get("classification") or "").lower(), "Unknown"),
        "material": r.get("material") or r.get("construction") or "", "color": r.get("display_colour") or "#64748b",
        "wallKind": r.get("wall_kind") or "unknown", "structuralRole": r.get("structural_role") or "unknown",
    } for r in fetch_all("SELECT * FROM wall_definition WHERE project_id=%s AND status<>'deleted' ORDER BY code", (project_id,))]
    walls = []
    for r in fetch_all("SELECT * FROM wall_instance WHERE project_id=%s AND status<>'deleted' ORDER BY floor_id,created_at", (project_id,)):
        line = r.get("centerline") or []
        if len(line) < 2 or not r.get("definition_id"):
            continue
        walls.append({"id": str(r["id"]), "familyId": str(r["definition_id"]), "floorId": str(r["floor_id"]), "viewportId": str(r.get("source_viewport_id") or ""), "start": line[0], "end": line[-1], "heightM": float(r.get("height_mm") or 0) / 1000.0, "side1Finish": str(r.get("side_a_finish_id") or ""), "side2Finish": str(r.get("side_b_finish_id") or ""), "status": "confirmed" if r.get("user_confirmed") else ("needs_review" if r.get("status") == "needs_review" else "ready"), "lengthM": r.get("length_m"), "grossAreaM2": r.get("gross_area_m2"), "openingDeductionM2": r.get("opening_deduction_m2"), "netAreaM2": r.get("net_area_m2")})
    return families, walls


def opening_demo_state(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    context = _demo_context(pid)
    _ensure_fallback_definitions(pid)
    families = []
    for r in fetch_all("SELECT * FROM opening_definition WHERE project_id=%s AND status<>'deleted' ORDER BY kind,code", (pid,)):
        source = ((r.get("source_evidence") or [{}])[0].get("text") if r.get("source_evidence") else "Project schedule / user")
        families.append({
            "id": str(r["id"]), "parent": r["kind"], "mark": r["code"], "description": r.get("description") or r["name"],
            "widthMm": float(r.get("width_mm") or 0), "heightMm": float(r.get("height_mm") or 0), "thicknessMm": float(r.get("thickness_mm") or 0),
            "material": r.get("material") or "", "fittings": r.get("ironmongery_set") or "", "source": source or "Project schedule / user",
            "color": r.get("display_colour") or "#2563eb", "frameMaterial": r.get("frame_material"), "leafMaterial": r.get("leaf_material"),
            "glazing": r.get("glazing"), "operation": r.get("operation"), "fireRating": r.get("fire_rating"), "acousticRating": r.get("acoustic_rating"),
            "finish": r.get("finish"), "sillHeightMm": r.get("sill_height_mm"), "headHeightMm": r.get("head_height_mm"),
            "scheduledQuantity": r.get("scheduled_quantity"), "locationText": r.get("location_text"),
        })
    openings = []
    for r in fetch_all("SELECT * FROM opening_instance WHERE project_id=%s AND status<>'deleted' ORDER BY floor_id,created_at", (pid,)):
        if not r.get("definition_id"):
            continue
        openings.append({
            "id": str(r["id"]), "familyId": str(r["definition_id"]), "kind": r["kind"], "floorId": str(r["floor_id"]),
            "viewportId": str(r.get("source_viewport_id") or ""), "bbox": r.get("bbox") or {"x": 0, "y": 0, "width": 20, "height": 20},
            "hostWallId": str(r["host_wall_id"]) if r.get("host_wall_id") else None,
            "status": "confirmed" if r.get("user_confirmed") else ("needs_review" if r.get("status") == "needs_review" else "ready"),
            "confidence": r.get("confidence"), "openingTag": r.get("opening_tag"), "grossOpeningAreaM2": r.get("gross_opening_area_m2"),
        })
    wall_families, walls = _production_walls(pid)
    ui = fetch_one("SELECT state_json FROM takeoff_ui_state WHERE project_id=%s AND module='doors-windows'", (pid,))
    return {**context, "families": families, "openings": openings, "wallFamilies": wall_families, "walls": walls, "uiState": (ui or {}).get("state_json") or {}, "analysis": opening_analysis_status(pid), "provider": OPENING_PROVIDER, "auth": codex_account_status()}


def save_opening_demo_state(project_id: UUID | str, payload: dict[str, Any]) -> dict[str, Any]:
    pid = str(project_id)
    contexts = _contexts(pid)
    ctx_by_floor = {str(x["id"]): x for x in contexts}
    families = payload.get("families") or []
    openings = payload.get("openings") or []
    family_map: dict[str, str] = {}
    touched_floors: set[str] = set()
    previous_floors = {str(row["floor_id"]) for row in fetch_all("SELECT DISTINCT floor_id FROM opening_instance WHERE project_id=%s", (pid,))}
    with transaction() as conn:
        for index, family in enumerate(families):
            client_id = str(family.get("id") or "")
            existing = conn.execute("SELECT * FROM opening_definition WHERE id=%s AND project_id=%s", (_safe_uuid(client_id), pid)).fetchone() if _safe_uuid(client_id) else None
            code = str(family.get("mark") or f"O-{index + 1:02d}").strip()
            kind = str(family.get("parent") or "door")
            if kind not in {"door", "window"}:
                continue
            if existing:
                changed = any([
                    str(existing.get("code") or "") != code,
                    str(existing.get("description") or existing.get("name") or "") != str(family.get("description") or ""),
                    float(existing.get("width_mm") or 0) != float(family.get("widthMm") or 0),
                    float(existing.get("height_mm") or 0) != float(family.get("heightMm") or 0),
                    float(existing.get("thickness_mm") or 0) != float(family.get("thicknessMm") or 0),
                    str(existing.get("material") or "") != str(family.get("material") or ""),
                    str(existing.get("frame_material") or "") != str(family.get("frameMaterial") or ""),
                    str(existing.get("leaf_material") or "") != str(family.get("leafMaterial") or ""),
                    str(existing.get("glazing") or "") != str(family.get("glazing") or ""),
                    str(existing.get("operation") or "") != str(family.get("operation") or ""),
                    str(existing.get("fire_rating") or "") != str(family.get("fireRating") or ""),
                    str(existing.get("acoustic_rating") or "") != str(family.get("acousticRating") or ""),
                    str(existing.get("finish") or "") != str(family.get("finish") or ""),
                    str(existing.get("ironmongery_set") or "") != str(family.get("fittings") or ""),
                    float(existing.get("sill_height_mm") or 0) != float(family.get("sillHeightMm") or 0),
                    float(existing.get("head_height_mm") or 0) != float(family.get("headHeightMm") or 0),
                    (float(existing.get("scheduled_quantity")) if existing.get("scheduled_quantity") is not None else None) != (float(family.get("scheduledQuantity")) if family.get("scheduledQuantity") not in (None, "") else None),
                    str(existing.get("location_text") or "") != str(family.get("locationText") or ""),
                    str(existing.get("display_colour") or "") != str(family.get("color") or ""),
                ])
                dbid = str(existing["id"])
                conn.execute(
                    """UPDATE opening_definition SET code=%s,kind=%s,name=%s,description=%s,width_mm=%s,height_mm=%s,thickness_mm=%s,
                       material=%s,frame_material=%s,leaf_material=%s,glazing=%s,operation=%s,fire_rating=%s,acoustic_rating=%s,finish=%s,
                       ironmongery_set=%s,sill_height_mm=%s,head_height_mm=%s,scheduled_quantity=%s,location_text=%s,display_colour=%s,
                       user_confirmed=(user_confirmed OR %s),updated_at=now() WHERE id=%s""",
                    (code, kind, existing.get("name") or family.get("description") or code, family.get("description"), family.get("widthMm") or None,
                     family.get("heightMm") or None, family.get("thicknessMm") or None, family.get("material"), family.get("frameMaterial") or None,
                     family.get("leafMaterial") or None, family.get("glazing") or None, family.get("operation") or None, family.get("fireRating") or None,
                     family.get("acousticRating") or None, family.get("finish") or None, family.get("fittings") or None, family.get("sillHeightMm") or None,
                     family.get("headHeightMm") or None, family.get("scheduledQuantity") if family.get("scheduledQuantity") not in (None, "") else None,
                     family.get("locationText") or None, family.get("color") or PALETTE[index % len(PALETTE)], changed, dbid),
                )
            else:
                row = conn.execute(
                    """INSERT INTO opening_definition(project_id,code,kind,name,description,width_mm,height_mm,thickness_mm,material,
                           frame_material,leaf_material,glazing,operation,fire_rating,acoustic_rating,finish,ironmongery_set,sill_height_mm,
                           head_height_mm,scheduled_quantity,location_text,display_colour,user_confirmed,status,confidence,source_evidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true,'active',1,%s)
                       ON CONFLICT(project_id,code) DO UPDATE SET kind=excluded.kind,name=excluded.name,description=excluded.description,
                         width_mm=excluded.width_mm,height_mm=excluded.height_mm,thickness_mm=excluded.thickness_mm,material=excluded.material,
                         frame_material=excluded.frame_material,leaf_material=excluded.leaf_material,glazing=excluded.glazing,operation=excluded.operation,
                         fire_rating=excluded.fire_rating,acoustic_rating=excluded.acoustic_rating,finish=excluded.finish,ironmongery_set=excluded.ironmongery_set,
                         sill_height_mm=excluded.sill_height_mm,head_height_mm=excluded.head_height_mm,scheduled_quantity=excluded.scheduled_quantity,
                         location_text=excluded.location_text,display_colour=excluded.display_colour,user_confirmed=true,updated_at=now() RETURNING id""",
                    (pid, code, kind, family.get("description") or code, family.get("description"), family.get("widthMm") or None,
                     family.get("heightMm") or None, family.get("thicknessMm") or None, family.get("material"), family.get("frameMaterial") or None,
                     family.get("leafMaterial") or None, family.get("glazing") or None, family.get("operation") or None, family.get("fireRating") or None,
                     family.get("acousticRating") or None, family.get("finish") or None, family.get("fittings") or None, family.get("sillHeightMm") or None,
                     family.get("headHeightMm") or None, family.get("scheduledQuantity") if family.get("scheduledQuantity") not in (None, "") else None,
                     family.get("locationText") or None, family.get("color") or PALETTE[index % len(PALETTE)],
                     Jsonb([{"kind": "user", "text": "Opening family created in Quanto"}])),
                ).fetchone()
                dbid = str(row["id"])
            family_map[client_id] = dbid
        keep: set[str] = set()
        for index, item in enumerate(openings):
            floor_id = str(item.get("floorId") or "")
            ctx = ctx_by_floor.get(floor_id)
            if not ctx:
                continue
            touched_floors.add(floor_id)
            family_id = family_map.get(str(item.get("familyId") or ""), _safe_uuid(item.get("familyId")))
            if not family_id:
                continue
            definition = conn.execute("SELECT * FROM opening_definition WHERE id=%s", (family_id,)).fetchone()
            if not definition:
                continue
            bbox = item.get("bbox") or {}
            center = {"x": float(bbox.get("x") or 0) + float(bbox.get("width") or 0) / 2.0, "y": float(bbox.get("y") or 0) + float(bbox.get("height") or 0) / 2.0}
            width_mm, height_mm = definition.get("width_mm"), definition.get("height_mm")
            area, perimeter = _opening_metrics(width_mm, height_mm, str(item.get("kind") or definition.get("kind") or "door"))
            opening_uuid = _safe_uuid(item.get("id"))
            existing = conn.execute("SELECT * FROM opening_instance WHERE id=%s AND project_id=%s", (opening_uuid, pid)).fetchone() if opening_uuid else None
            status = str(item.get("status") or "ready")
            confirmed = status == "confirmed"
            host = _safe_uuid(item.get("hostWallId"))
            viewport_id = str(item.get("viewportId") or ctx["opening_viewport_id"])
            if existing:
                changed = any([
                    str(existing.get("definition_id") or "") != str(family_id),
                    json.dumps(existing.get("bbox") or {}, sort_keys=True) != json.dumps(bbox, sort_keys=True),
                    str(existing.get("host_wall_id") or "") != str(host or ""),
                    str(existing.get("source_viewport_id") or "") != viewport_id,
                ])
                oid = str(existing["id"])
                conn.execute(
                    """UPDATE opening_instance SET definition_id=%s,host_wall_id=%s,kind=%s,source_viewport_id=%s,bbox=%s,center=%s,
                       clear_width_mm=%s,clear_height_mm=%s,gross_opening_area_m2=%s,frame_perimeter_m=%s,
                       geometry_user_modified=(geometry_user_modified OR %s),status=%s,user_confirmed=%s,updated_at=now() WHERE id=%s""",
                    (family_id, host, item.get("kind") or definition.get("kind"), viewport_id, Jsonb(bbox), Jsonb(center), width_mm, height_mm,
                     area, perimeter, changed, "confirmed" if confirmed else status, confirmed, oid),
                )
            else:
                row = conn.execute(
                    """INSERT INTO opening_instance(project_id,floor_id,source_viewport_id,source_key,definition_id,host_wall_id,kind,opening_tag,
                           generated_bbox,bbox,center,clear_width_mm,clear_height_mm,gross_opening_area_m2,frame_perimeter_m,
                           geometry_user_modified,status,user_confirmed,confidence,source_evidence)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,true,%s,%s,1,%s) RETURNING id""",
                    (pid, floor_id, viewport_id, f"user:{index}:{hashlib.sha1(json.dumps(bbox, sort_keys=True).encode()).hexdigest()[:10]}", family_id,
                     host, item.get("kind") or definition.get("kind"), item.get("openingTag") or definition.get("code"), Jsonb(bbox), Jsonb(bbox),
                     Jsonb(center), width_mm, height_mm, area, perimeter, "confirmed" if confirmed else status, confirmed,
                     Jsonb([{"kind": "user", "text": "Opening edited/drawn in Quanto"}])),
                ).fetchone()
                oid = str(row["id"])
            keep.add(oid)
        submitted_ids = {value for item in openings if (value := _safe_uuid(item.get("id")))}
        preserve_ids = submitted_ids | keep
        if preserve_ids:
            # The demo-state payload is the user's complete current opening set. Missing persisted IDs therefore represent an explicit UI delete.
            conn.execute("DELETE FROM opening_instance WHERE project_id=%s AND NOT (id = ANY(%s::uuid[]))", (pid, list(preserve_ids)))
        elif openings == []:
            conn.execute("DELETE FROM opening_instance WHERE project_id=%s", (pid,))
        conn.execute(
            """INSERT INTO takeoff_ui_state(project_id,module,state_json,updated_at) VALUES (%s,'doors-windows',%s,now())
               ON CONFLICT(project_id,module) DO UPDATE SET state_json=excluded.state_json,updated_at=now()""",
            (pid, Jsonb(payload.get("uiState") or {})),
        )
    touched_floors.update(previous_floors)
    for fid in touched_floors:
        sync_openings_to_walls(pid, fid, authoritative=True)
        recalculate_skirting_opening_deductions(pid, fid)
    if touched_floors:
        _publish_opening_facts(pid, sorted(touched_floors))
    _schedule_reconciliation(pid)
    return opening_demo_state(pid)


def opening_quantities(project_id: UUID | str) -> dict[str, Any]:
    pid = str(project_id)
    rows = fetch_all(
        """SELECT od.id AS family_id,od.code AS mark,od.kind,od.name,od.description,od.width_mm,od.height_mm,od.material,
                  od.frame_material,od.glazing,od.operation,od.fire_rating,od.acoustic_rating,od.finish,od.ironmongery_set,
                  od.scheduled_quantity,od.nrm_work_section,
                  COALESCE(SUM(CASE WHEN oi.include_in_boq THEN tf.typical_factor ELSE 0 END),0) AS quantity,
                  COALESCE(SUM(CASE WHEN oi.include_in_boq THEN COALESCE(oi.gross_opening_area_m2,0)*tf.typical_factor ELSE 0 END),0) AS gross_opening_area_m2,
                  bool_and(CASE WHEN oi.id IS NULL THEN true ELSE oi.user_confirmed END) AS confirmed
           FROM opening_definition od LEFT JOIN opening_instance oi ON oi.definition_id=od.id AND oi.status<>'deleted'
           LEFT JOIN takeoff_floor tf ON tf.id=oi.floor_id
           WHERE od.project_id=%s AND od.status<>'deleted' AND od.code NOT LIKE 'UNASSIGNED-%%'
           GROUP BY od.id,od.code,od.kind,od.name,od.description,od.width_mm,od.height_mm,od.material,od.frame_material,od.glazing,
                    od.operation,od.fire_rating,od.acoustic_rating,od.finish,od.ironmongery_set,od.scheduled_quantity,od.nrm_work_section
           HAVING COALESCE(SUM(CASE WHEN oi.include_in_boq THEN tf.typical_factor ELSE 0 END),0)>0 OR od.scheduled_quantity IS NOT NULL
           ORDER BY od.kind,od.code""",
        (pid,),
    )
    ironmongery: dict[str, float] = {}
    for row in rows:
        set_name = str(row.get("ironmongery_set") or "").strip()
        if row.get("kind") == "door" and set_name and float(row.get("quantity") or 0) > 0:
            ironmongery[set_name] = ironmongery.get(set_name, 0.0) + float(row["quantity"])
        row["schedule_variance"] = (float(row.get("quantity") or 0) - float(row["scheduled_quantity"])) if row.get("scheduled_quantity") is not None else None
        row["unit"] = "nr"
        row["work_section"] = row.get("nrm_work_section") or ("Doors" if row.get("kind") == "door" else "Windows")
    unresolved = fetch_one("SELECT count(*) AS n FROM opening_review_item WHERE project_id=%s AND resolved=false", (pid,))
    return {
        "openings": rows,
        "ironmongery_sets": [{"set": key, "quantity": value, "unit": "set", "basis": "one explicit set per detected door instance"} for key, value in sorted(ironmongery.items())],
        "unresolved_review_items": int(unresolved["n"]) if unresolved else 0,
    }
