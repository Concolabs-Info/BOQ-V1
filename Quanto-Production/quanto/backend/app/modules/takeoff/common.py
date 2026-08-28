from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any
from uuid import UUID

import pymupdf

from ...database.connection import fetch_all, fetch_one, transaction
from ...services.pdf.media import ensure_viewport_crop, viewport_context
from ...services.storage.paths import resolve_key

PALETTE = [
    "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04",
    "#65a30d", "#16a34a", "#059669", "#0891b2", "#0284c7", "#4f46e5",
    "#9333ea", "#be123c", "#0d9488", "#64748b",
]


def polygon_area_px(points: list[dict[str, float]]) -> float:
    if len(points) < 3:
        return 0.0
    return abs(sum(
        points[i]["x"] * points[(i + 1) % len(points)]["y"]
        - points[(i + 1) % len(points)]["x"] * points[i]["y"]
        for i in range(len(points))
    )) / 2.0


def polygon_perimeter_px(points: list[dict[str, float]]) -> float:
    if len(points) < 2:
        return 0.0
    return sum(math.hypot(
        points[(i + 1) % len(points)]["x"] - points[i]["x"],
        points[(i + 1) % len(points)]["y"] - points[i]["y"],
    ) for i in range(len(points)))


def area_m2(points: list[dict[str, float]], mm_per_pixel: float | None) -> float | None:
    if not mm_per_pixel:
        return None
    return round(polygon_area_px(points) * (mm_per_pixel ** 2) / 1_000_000.0, 4)


def perimeter_m(points: list[dict[str, float]], mm_per_pixel: float | None) -> float | None:
    if not mm_per_pixel:
        return None
    return round(polygon_perimeter_px(points) * mm_per_pixel / 1000.0, 4)


def source_mm_per_pixel(viewport_id: UUID | str) -> tuple[float | None, bool]:
    row = fetch_one(
        """SELECT sf.factor_x,sf.factor_y,sf.checks,sf.status,sf.crop_version,v.crop_version AS viewport_crop_version
           FROM scale_fit sf JOIN viewport v ON v.id=sf.viewport_id
           WHERE sf.viewport_id=%s AND sf.status='confirmed'
           ORDER BY sf.created_at DESC LIMIT 1""",
        (str(viewport_id),),
    )
    if not row or row["crop_version"] != row["viewport_crop_version"]:
        return None, False
    checks = row.get("checks") or {}
    factor = checks.get("confirmed_factor") or row.get("factor_x") or row.get("factor_y")
    if factor is None:
        return None, False
    # 150 dpi is the locked working render in Pre. Scale factor is real/paper.
    return float(factor) * 25.4 / 150.0, True


def ensure_takeoff_floors(project_id: UUID | str) -> list[dict[str, Any]]:
    """Build one Takeoff floor context per physical storey from confirmed Pre evidence."""
    pid = str(project_id)
    storeys = fetch_all(
        "SELECT * FROM storey WHERE project_id=%s ORDER BY level_index",
        (pid,),
    )
    if not storeys:
        return []
    # Architectural plan candidates are only a fallback when a storey has no source viewport.
    plans = fetch_all(
        """SELECT v.*,s.title,p.page_number FROM viewport v
           JOIN sheet s ON s.id=v.sheet_id JOIN page p ON p.id=s.page_id
           JOIN document d ON d.id=p.document_id
           WHERE d.project_id=%s AND s.included=true AND v.relevant=true AND v.view_kind='plan'
             AND (v.discipline='architectural' OR v.name ~* '(floor|roof|roof terrace|reflected ceiling|ceiling plan|rcp)')
             AND v.discipline NOT IN ('structural','civil_site')
           ORDER BY p.page_number,v.display_order""",
        (pid,),
    )

    def choose_viewport(storey: dict[str, Any]) -> str | None:
        source_id = str(storey.get("source_viewport_id") or "")
        if source_id and any(str(plan["id"]) == source_id for plan in plans):
            return source_id
        label = (storey.get("name") or "").lower()
        scored: list[tuple[int, dict[str, Any]]] = []
        for vp in plans:
            text = " ".join([vp.get("name") or "", vp.get("level_label") or "", vp.get("title") or ""]).lower()
            score = 0
            if label and label in text:
                score += 10
            if "floor" in text:
                score += 2
            if vp.get("discipline") == "architectural":
                score += 2
            scored.append((score, vp))
        return str(max(scored, key=lambda item: item[0])[1]["id"]) if scored else None

    result: list[dict[str, Any]] = []
    for s in storeys:
        viewport_id = choose_viewport(s)
        if not viewport_id:
            continue
        try:
            _, ctx = ensure_viewport_crop(viewport_id)
        except Exception:
            continue
        mmpp, verified = source_mm_per_pixel(viewport_id)
        # Pre may use one typical storey record per physical floor or a single grouped record.
        typical_group = (s.get("typical_group") or "").strip()
        factor = 1
        range_match = re.search(r"(\d+)\s*[-–]\s*(\d+)", typical_group)
        if range_match:
            factor = max(1, int(range_match.group(2)) - int(range_match.group(1)) + 1)
        with transaction() as conn:
            row = conn.execute(
                """INSERT INTO takeoff_floor(project_id,storey_id,viewport_id,name,level_index,typical_factor,
                       drawing_width,drawing_height,mm_per_pixel,scale_verified,crop_version,updated_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,now())
                   ON CONFLICT(project_id,storey_id) DO UPDATE SET viewport_id=excluded.viewport_id,name=excluded.name,
                       level_index=excluded.level_index,typical_factor=excluded.typical_factor,
                       drawing_width=excluded.drawing_width,drawing_height=excluded.drawing_height,
                       mm_per_pixel=excluded.mm_per_pixel,scale_verified=excluded.scale_verified,
                       crop_version=excluded.crop_version,updated_at=now()
                   RETURNING *""",
                (pid, str(s["id"]), viewport_id, s["name"], s["level_index"], factor,
                 ctx["crop_width_px"], ctx["crop_height_px"], mmpp, verified, ctx["crop_version"]),
            ).fetchone()
        result.append(dict(row))
    return result


def floor_context(floor_id: UUID | str) -> dict[str, Any]:
    row = fetch_one("SELECT * FROM takeoff_floor WHERE id=%s", (str(floor_id),))
    if not row:
        raise ValueError("Takeoff floor not found")
    if not row.get("viewport_id"):
        raise ValueError("Floor has no controlling plan viewport")
    crop_path, vp_ctx = ensure_viewport_crop(row["viewport_id"])
    return {**row, **{f"source_{k}": v for k, v in vp_ctx.items()}, "crop_path": crop_path}


def extract_viewport_text(viewport_id: UUID | str, max_items: int = 450) -> list[dict[str, Any]]:
    """Native PDF words transformed into exact crop-pixel coordinates."""
    ctx = viewport_context(viewport_id)
    crop_path, crop_ctx = ensure_viewport_crop(viewport_id)
    del crop_path
    pdf = pymupdf.open(resolve_key(ctx["document_storage_key"]))
    page = pdf[ctx["page_number"] - 1]
    words = page.get_text("words")
    # page -> rendered image mapping is inverse of stored page_from_image
    a, b, c, d, e, f = ctx["page_from_image"]
    det = a * d - b * c
    if abs(det) < 1e-12:
        pdf.close()
        return []
    ia, ib, ic, id_, ie, iff = d / det, -b / det, -c / det, a / det, 0.0, 0.0
    ie = -(ia * e + ic * f)
    iff = -(ib * e + id_ * f)
    x0, y0, x1, y1 = crop_ctx["crop_px"]
    items: list[dict[str, Any]] = []
    for word in words:
        px0 = ia * float(word[0]) + ic * float(word[1]) + ie
        py0 = ib * float(word[0]) + id_ * float(word[1]) + iff
        px1 = ia * float(word[2]) + ic * float(word[3]) + ie
        py1 = ib * float(word[2]) + id_ * float(word[3]) + iff
        if px1 < x0 or py1 < y0 or px0 > x1 or py0 > y1:
            continue
        items.append({
            "text": str(word[4]),
            "bbox": [round(px0 - x0, 1), round(py0 - y0, 1), round(px1 - x0, 1), round(py1 - y0, 1)],
        })
        if len(items) >= max_items:
            break
    pdf.close()
    return items


def project_spec_text(project_id: UUID | str, max_chars: int = 50000) -> str:
    rows = fetch_all(
        "SELECT kind,name,topic,raw_text,table_json FROM spec_item WHERE project_id=%s AND found=true ORDER BY kind,name",
        (str(project_id),),
    )
    chunks: list[str] = []
    for row in rows:
        chunk = f"[{row['kind']}] {row['name']}\n{row.get('raw_text') or ''}"
        if row.get("table_json"):
            chunk += "\nTABLE=" + json.dumps(row["table_json"], ensure_ascii=False)
        chunks.append(chunk)
        if sum(len(x) for x in chunks) >= max_chars:
            break
    return "\n\n".join(chunks)[:max_chars]


def content_hash(payload: Any) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str, ensure_ascii=False).encode("utf-8")).hexdigest()


def viewport_demo_context(project_id: UUID | str) -> dict[str, Any]:
    floors = ensure_takeoff_floors(project_id)
    sheets: list[dict[str, Any]] = []
    viewports: list[dict[str, Any]] = []
    storeys: list[dict[str, Any]] = []
    for floor in floors:
        vp = str(floor["viewport_id"])
        image = f"/api/v1/viewports/{vp}/crop"
        sid = f"takeoff-sheet-{floor['id']}"
        sheets.append({
            "id": sid, "sheetNo": str(floor["level_index"]), "title": floor["name"], "revision": "",
            "image": image, "page": 100 + int(floor["level_index"]), "included": True,
            "width": floor["drawing_width"], "height": floor["drawing_height"],
        })
        viewports.append({
            "id": vp, "name": floor["name"], "category": "plan", "sheetId": sid,
            "bbox": [0, 0, floor["drawing_width"], floor["drawing_height"]],
            "status": "confirmed", "scaleMPerPx": (float(floor["mm_per_pixel"]) / 1000.0) if floor.get("mm_per_pixel") else None,
        })
        height = fetch_one("SELECT height_mm FROM storey WHERE id=%s", (str(floor["storey_id"]),)) if floor.get("storey_id") else None
        storeys.append({
            "id": str(floor["id"]), "name": floor["name"], "levelIndex": floor["level_index"],
            "factor": floor["typical_factor"], "heightM": (float(height["height_mm"]) / 1000.0) if height and height.get("height_mm") else 0.0,
            "status": "confirmed" if height and height.get("height_mm") else "ready",
        })
    return {"sheets": sheets, "viewports": viewports, "storeys": storeys, "floors": floors}


def project_text_evidence(project_id: UUID | str, max_chars: int = 60000) -> str:
    """Return Pre-confirmed specification text, falling back to native PDF text.

    The fallback keeps Floor/Ceiling usable with real vector PDFs even when the
    Specifications step contains no structured spec rows yet. It never uses OCR
    or fabricates content; it only reads text embedded in the user's PDFs.
    """
    structured = project_spec_text(project_id, max_chars=max_chars)
    if structured.strip():
        return structured
    docs = fetch_all(
        "SELECT storage_key,filename FROM document WHERE project_id=%s ORDER BY created_at",
        (str(project_id),),
    )
    chunks: list[str] = []
    size = 0
    for doc in docs:
        try:
            pdf = pymupdf.open(resolve_key(doc["storage_key"]))
        except Exception:
            continue
        try:
            for page_no, page in enumerate(pdf, start=1):
                text = page.get_text("text").strip()
                if not text:
                    continue
                chunk = f"[PDF {doc.get('filename') or ''} page {page_no}]\n{text}"
                chunks.append(chunk)
                size += len(chunk)
                if size >= max_chars:
                    return "\n\n".join(chunks)[:max_chars]
        finally:
            pdf.close()
    return "\n\n".join(chunks)[:max_chars]


def model_for_quality(quality: str | None) -> str | None:
    """Resolve the Takeoff quality selector to the configured provider model.

    OpenAI's quality labels intentionally stay product-facing (Easy/Medium/
    Expert/Maximum). Model IDs remain server-side and can be overridden with
    OPENAI_MODEL for deployments that pin a specific model.
    """
    from ...core.config import get_settings

    settings = get_settings()
    provider = settings.takeoff_ai_provider.lower().strip()
    if provider != "openai":
        return None
    q = (quality or "medium").strip().lower()
    # If deployment pins a non-5.6 model, honour it for every quality level.
    configured = (settings.openai_model or "").strip()
    if configured and not configured.startswith("gpt-5.6"):
        return configured
    return {
        "easy": "gpt-5.6-luna",
        "medium": "gpt-5.6-terra",
        "expert": "gpt-5.6-sol",
        "maximum": "gpt-5.6-sol",
    }.get(q, configured or "gpt-5.6-terra")


def require_frozen_project(project_id: UUID | str) -> dict[str, Any]:
    project = fetch_one("SELECT id,pre_status,frame_version,frozen_at FROM project WHERE id=%s", (str(project_id),))
    if not project:
        raise ValueError("Project not found")
    if project.get("pre_status") != "frozen":
        raise RuntimeError("Complete Pre and use Start Takeoff first. Takeoff analysis reads the frozen Project Frame.")
    return project
