from __future__ import annotations

from pathlib import Path
from uuid import UUID
from difflib import SequenceMatcher
import re

import pymupdf
from ...database.json_value import Jsonb

from ...core.config import get_settings
from ...database.connection import fetch_all, transaction
from .schemas import SpecReading
from ...services.pdf.geometry import norm_box_to_px, px_box_to_page_mpt
from ...services.ai.model_client import get_model_client
from ...services.ai.local_evidence import specs_from_pdf
from ...services.storage.paths import resolve_key
from .prompts import SPEC_PROMPT, SYSTEM

EXPECTED = {
    "door_schedule": ("schedule", "Door schedule", "doors"),
    "window_schedule": ("schedule", "Window schedule", "windows"),
    "finishes": ("schedule", "Finishes", "finishes"),
    "concrete_grades": ("note", "Concrete grades", "concrete"),
    "wall_types": ("type_key", "Wall types", "masonry"),
}


def _text_heavy_pages(project_id: UUID | str) -> list[dict]:
    pages = fetch_all(
        """SELECT p.id, p.page_number, p.document_id, d.storage_key AS document_storage_key,
                  pr.width_px, pr.height_px, pr.page_from_image, pr.storage_key AS render_storage_key,
                  s.title AS sheet_title,
                  COALESCE(array_agg(v.view_kind) FILTER (WHERE v.id IS NOT NULL), '{}') AS kinds
           FROM page p JOIN document d ON d.id=p.document_id
           JOIN page_render pr ON pr.page_id=p.id AND pr.dpi=150
           JOIN sheet s ON s.page_id=p.id AND s.included=true
           LEFT JOIN viewport v ON v.sheet_id=s.id AND v.relevant=true
           WHERE d.project_id=%s
           GROUP BY p.id,p.page_number,p.document_id,d.storage_key,pr.width_px,pr.height_px,pr.page_from_image,pr.storage_key,s.title
           ORDER BY p.page_number""",
        (str(project_id),),
    )
    settings = get_settings()
    selected: list[dict] = []
    for row in pages:
        title = (row.get("sheet_title") or "").lower()
        title_is_written_source = any(token in title for token in ("specification", "notes", "schedule", "legend", "key"))
        if title_is_written_source:
            selected.append(row)
            continue
        # A dense text-only sheet may have been classified poorly. Do not use
        # text length alone: dimension-heavy drawings also contain much text.
        try:
            doc = pymupdf.open(resolve_key(row["document_storage_key"]))
            pdf_page = doc[row["page_number"] - 1]
            text = pdf_page.get_text("text") or ""
            text_len = len(text)
            drawings = len(pdf_page.get_drawings())
            doc.close()
            heading_match = re.search(r"\b(?:SPECIFICATIONS?|GENERAL NOTES?|MEASUREMENT NOTES?|SCHEDULE OF)\b", text, re.I)
            if text_len >= 500 and heading_match and drawings < 40:
                selected.append(row)
        except Exception:
            pass
    return selected


def _norm(value: str | None) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).split())


def _iou(a: list[int], b: list[int]) -> float:
    ix1, iy1, ix2, iy2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    intersection = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if not intersection:
        return 0.0
    area_a = max(1, (a[2] - a[0]) * (a[3] - a[1]))
    area_b = max(1, (b[2] - b[0]) * (b[3] - b[1]))
    return intersection / max(1, area_a + area_b - intersection)


def _deduplicate(items: list[dict]) -> list[dict]:
    """Collapse exact and strongly-overlapping model repeats on one page."""
    result: list[dict] = []
    for item in items:
        duplicate_index = None
        for index, existing in enumerate(result):
            if item["page_id"] != existing["page_id"] or item["kind"] != existing["kind"]:
                continue
            same_name = _norm(item["name"]) == _norm(existing["name"])
            same_text = _norm(item.get("raw_text")) == _norm(existing.get("raw_text"))
            similarity = SequenceMatcher(None, _norm(item.get("raw_text")), _norm(existing.get("raw_text"))).ratio()
            if (same_name and (same_text or similarity >= .88)) or (same_name and _iou(item["bbox_mpt"], existing["bbox_mpt"]) >= .55):
                duplicate_index = index
                break
        if duplicate_index is None:
            result.append(item)
        else:
            old = result[duplicate_index]
            # Keep the richer transcription, but retain one physical source.
            if len(item.get("raw_text") or "") > len(old.get("raw_text") or ""):
                result[duplicate_index] = item
    return result


def _useful(item: dict) -> bool:
    """Remove drawing navigation labels that belong to Plans/Height, not Specs."""
    if item["kind"] in {"level_datum", "unit_area"}:
        text = f"{item.get('name') or ''} {item.get('raw_text') or ''}".lower()
        return item.get("table") is not None or any(token in text for token in ("schedule", "table", "areas", "datum schedule"))
    return len((item.get("raw_text") or "").strip()) >= 20


def _find_parent_viewport(project_id: UUID | str, page_id: UUID | str, bbox_mpt: list[int]) -> str | None:
    x1, y1, x2, y2 = bbox_mpt
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    rows = fetch_all(
        """SELECT v.id,v.bbox_mpt FROM viewport v JOIN sheet s ON s.id=v.sheet_id
           WHERE s.page_id=%s AND s.included=true AND v.relevant=true""",
        (str(page_id),),
    )
    containing = []
    for row in rows:
        a, b, c, d = row["bbox_mpt"]
        if a <= cx <= c and b <= cy <= d:
            containing.append((max(1, (c-a)*(d-b)), str(row["id"])))
    return min(containing)[1] if containing else None


def _expected_seen(items: list[dict]) -> set[str]:
    seen: set[str] = set()
    for item in items:
        hay = f"{item['name']} {item.get('topic') or ''} {item.get('raw_text') or ''}".lower()
        if "door" in hay and item["kind"] == "schedule": seen.add("door_schedule")
        if "window" in hay and item["kind"] == "schedule": seen.add("window_schedule")
        if "finish" in hay: seen.add("finishes")
        if "concrete" in hay and any(x in hay for x in ["grade", "c20", "c25", "c30", "strength"]): seen.add("concrete_grades")
        if "wall" in hay and item["kind"] == "type_key": seen.add("wall_types")
    return seen


def extract_specs(project_id: UUID | str) -> list[dict]:
    settings = get_settings()
    model = get_model_client("pre")
    pages = _text_heavy_pages(project_id)
    harvested: list[dict] = []

    for page in pages:
        image_path = resolve_key(page["render_storage_key"])
        local_reading = specs_from_pdf(resolve_key(page["document_storage_key"]), page["page_number"])
        if settings.pre_ai_provider.lower().strip() in {"local", "manual"}:
            reading = local_reading
        else:
            reading = model.parse_image(Path(image_path), SPEC_PROMPT, SpecReading, system=SYSTEM)
            # The PDF text layer is reliable evidence and prevents a vision
            # miss from silently making an entire specification page empty.
            if not reading.items:
                reading = local_reading
        for item in reading.model_dump(mode="json")["items"]:
            box_px = norm_box_to_px(item["box"], page["width_px"], page["height_px"])
            bbox_mpt = px_box_to_page_mpt(box_px, page["page_from_image"])
            vp_id = _find_parent_viewport(project_id, page["id"], bbox_mpt)
            row = {**item, "bbox_mpt": bbox_mpt, "viewport_id": vp_id, "page_id": str(page["id"])}
            if _useful(row):
                harvested.append(row)

    harvested = _deduplicate(harvested)
    with transaction() as conn:
        # Confirmed review decisions stand. Re-extraction replaces only draft
        # proposals and therefore cannot silently erase accepted information.
        conn.execute(
            """DELETE FROM spec_item si WHERE si.project_id=%s AND NOT EXISTS
               (SELECT 1 FROM confirmation c WHERE c.entity_type='spec_item' AND c.entity_id=si.id)""",
            (str(project_id),),
        )
        for item in harvested:
            conn.execute(
                    """INSERT INTO spec_item(project_id,viewport_id,page_id,kind,name,topic,raw_text,table_json,bbox_mpt,found,status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,true,'proposed')""",
                    (
                        str(project_id), item["viewport_id"], item["page_id"], item["kind"], item["name"], item["topic"],
                        item["raw_text"], Jsonb(item["table"]) if item["table"] is not None else None, item["bbox_mpt"],
                    ),
                )

    seen = _expected_seen(harvested)
    with transaction() as conn:
        for key, (kind, name, topic) in EXPECTED.items():
            if key not in seen:
                conn.execute(
                    """INSERT INTO spec_item(project_id,kind,name,topic,raw_text,found,status)
                       VALUES (%s,%s,%s,%s,'',false,'proposed')""",
                    (str(project_id), kind, name, topic),
                )
    return fetch_all("SELECT * FROM spec_item WHERE project_id=%s ORDER BY found DESC,name", (str(project_id),))
