from __future__ import annotations

from pathlib import Path
from uuid import UUID

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
                  COALESCE(array_agg(v.view_kind) FILTER (WHERE v.id IS NOT NULL), '{}') AS kinds
           FROM page p JOIN document d ON d.id=p.document_id
           JOIN page_render pr ON pr.page_id=p.id AND pr.dpi=150
           JOIN sheet s ON s.page_id=p.id AND s.included=true
           LEFT JOIN viewport v ON v.sheet_id=s.id AND v.relevant=true
           WHERE d.project_id=%s
           GROUP BY p.id,p.page_number,p.document_id,d.storage_key,pr.width_px,pr.height_px,pr.page_from_image,pr.storage_key
           ORDER BY p.page_number""",
        (str(project_id),),
    )
    settings = get_settings()
    selected: list[dict] = []
    for row in pages:
        kinds = set(row["kinds"] or [])
        if kinds.intersection({"schedule", "notes", "legend"}):
            selected.append(row)
            continue
        # Deterministic PDF-text heuristic catches text-only specification sheets.
        try:
            doc = pymupdf.open(resolve_key(row["document_storage_key"]))
            text_len = len(doc[row["page_number"] - 1].get_text("text"))
            doc.close()
            if text_len >= 500:
                selected.append(row)
        except Exception:
            pass
    return selected


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
    model = get_model_client()
    pages = _text_heavy_pages(project_id)
    harvested: list[dict] = []
    with transaction() as conn:
        conn.execute("DELETE FROM spec_item WHERE project_id=%s", (str(project_id),))

    for page in pages:
        image_path = resolve_key(page["render_storage_key"])
        if settings.ai_provider.lower().strip() in {"local", "manual"}:
            reading = specs_from_pdf(resolve_key(page["document_storage_key"]), page["page_number"])
        else:
            reading = model.parse_image(Path(image_path), SPEC_PROMPT, SpecReading, system=SYSTEM)
        for item in reading.model_dump(mode="json")["items"]:
            box_px = norm_box_to_px(item["box"], page["width_px"], page["height_px"])
            bbox_mpt = px_box_to_page_mpt(box_px, page["page_from_image"])
            vp_id = _find_parent_viewport(project_id, page["id"], bbox_mpt)
            row = {**item, "bbox_mpt": bbox_mpt, "viewport_id": vp_id, "page_id": str(page["id"])}
            harvested.append(row)
            with transaction() as conn:
                conn.execute(
                    """INSERT INTO spec_item(project_id,viewport_id,page_id,kind,name,topic,raw_text,table_json,bbox_mpt,found,status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,true,'proposed')""",
                    (
                        str(project_id), vp_id, str(page["id"]), item["kind"], item["name"], item["topic"],
                        item["raw_text"], Jsonb(item["table"]) if item["table"] is not None else None, bbox_mpt,
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
