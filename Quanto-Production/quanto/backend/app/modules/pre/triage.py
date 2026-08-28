from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import UUID

from ...database.json_value import Jsonb

from ...core.config import get_settings
from ...database.connection import fetch_all, fetch_one, transaction
from .schemas import TriageOutput
from ...services.pdf.geometry import norm_box_to_px, px_box_to_page_mpt
from ...services.ai.model_client import LocalReviewModelClient, get_model_client
from ...services.ai.local_evidence import triage_from_pdf
from ...services.storage.paths import resolve_key
from .prompts import SYSTEM, TRIAGE_PROMPT


def _box_iou(a: dict, b: dict) -> float:
    ix = max(0, min(a["x2"], b["x2"]) - max(a["x1"], b["x1"]))
    iy = max(0, min(a["y2"], b["y2"]) - max(a["y1"], b["y1"]))
    intersection = ix * iy
    if not intersection:
        return 0.0
    area_a = (a["x2"] - a["x1"]) * (a["y2"] - a["y1"])
    area_b = (b["x2"] - b["x1"]) * (b["y2"] - b["y1"])
    return intersection / max(1, area_a + area_b - intersection)


def _deduplicate_viewports(viewports: list[dict]) -> list[dict]:
    """Drop only obvious same-sheet duplicates; repeated titles on different sheets remain distinct."""
    result: list[dict] = []
    for viewport in viewports:
        name = " ".join((viewport.get("name") or "").lower().split())
        duplicate = next((
            existing for existing in result
            if " ".join((existing.get("name") or "").lower().split()) == name
            and existing.get("view_kind") == viewport.get("view_kind")
            and _box_iou(existing["box"], viewport["box"]) >= 0.75
        ), None)
        if duplicate is None:
            result.append(viewport)
    return result


def _analyze_page(page: dict, settings) -> tuple[TriageOutput, str | None]:
    if settings.pre_ai_provider.lower().strip() in {"local", "manual"}:
        return (
            triage_from_pdf(
                resolve_key(page["document_storage_key"]),
                page["page_number"],
                page["filename"],
            ),
            None,
        )

    try:
        output = get_model_client("pre").parse_image(
            Path(resolve_key(page["render_storage_key"])),
            TRIAGE_PROMPT.format(page_number=page["page_number"], filename=page["filename"]),
            TriageOutput,
            system=SYSTEM,
        )
        return output, None
    except Exception as exc:
        # A page that still fails after the bounded schema retries remains visible and editable.
        # Never crash the whole drawing set or silently drop the page.
        fallback = LocalReviewModelClient().parse_image(
            Path(resolve_key(page["render_storage_key"])),
            "manual review",
            TriageOutput,
            system=SYSTEM,
        )
        return fallback, str(exc)


def triage_project(project_id: UUID | str) -> None:
    pages = fetch_all(
        """SELECT p.*, d.filename, d.project_id, pr.id AS render_id, pr.width_px, pr.height_px,
                  pr.page_from_image, pr.storage_key AS render_storage_key, d.storage_key AS document_storage_key
           FROM page p
           JOIN document d ON d.id=p.document_id
           JOIN page_render pr ON pr.page_id=p.id AND pr.dpi=150
           WHERE d.project_id=%s AND d.status='ready'
           ORDER BY d.created_at, p.page_number""",
        (str(project_id),),
    )
    if not pages:
        raise ValueError("No ready pages to triage")

    settings = get_settings()
    if settings.pre_ai_provider.lower().strip() in {"local", "manual"}:
        analyses = [_analyze_page(page, settings) for page in pages]
    else:
        worker_count = max(1, min(settings.model_concurrency, 4, len(pages)))
        with ThreadPoolExecutor(max_workers=worker_count, thread_name_prefix="quanto-triage") as executor:
            analyses = list(executor.map(lambda page: _analyze_page(page, settings), pages))

    for page, (output, analysis_error) in zip(pages, analyses):
        payload = output.model_dump(mode="json")
        title = payload["title_block"]
        disciplines = [d.value if hasattr(d, "value") else str(d) for d in output.sheet_disciplines]
        sheet_status = "needs_review" if analysis_error else "proposed"

        with transaction() as conn:
            existing = conn.execute("SELECT id FROM sheet WHERE page_id=%s", (str(page["id"]),)).fetchone()
            if existing:
                sheet_id = existing["id"]
                conn.execute("DELETE FROM viewport WHERE sheet_id=%s", (str(sheet_id),))
                conn.execute(
                    """UPDATE sheet SET sheet_no=%s,title=%s,revision=%s,discipline=%s,issue_date=%s,
                       title_block_scale=%s,disciplines=%s,discipline_evidence=%s,status=%s
                       WHERE id=%s""",
                    (
                        title["sheet_no"], title["title"], title["revision"], title["discipline"],
                        title["issue_date"], Jsonb(title["scale"]) if title["scale"] is not None else None, disciplines,
                        Jsonb(payload["sheet_discipline_evidence"]), sheet_status, str(sheet_id),
                    ),
                )
            else:
                r = conn.execute(
                    """INSERT INTO sheet(page_id,sheet_no,title,revision,discipline,issue_date,title_block_scale,
                       disciplines,discipline_evidence,status)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (
                        str(page["id"]), title["sheet_no"], title["title"], title["revision"],
                        title["discipline"], title["issue_date"], Jsonb(title["scale"]) if title["scale"] is not None else None, disciplines,
                        Jsonb(payload["sheet_discipline_evidence"]), sheet_status,
                    ),
                ).fetchone()
                sheet_id = r["id"]

            for idx, vp in enumerate(_deduplicate_viewports(payload["viewports"])):
                box_px = norm_box_to_px(vp["box"], page["width_px"], page["height_px"])
                bbox_mpt = px_box_to_page_mpt(box_px, page["page_from_image"])
                reason = vp["why"]
                if analysis_error:
                    reason = f"{reason}; automatic reading needs manual review"
                conn.execute(
                    """INSERT INTO viewport(sheet_id,name,discipline,view_kind,subjects,bbox_mpt,level_label,
                       stated_scale,display_order,relevant,why,status,crop_version)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,1)""",
                    (
                        str(sheet_id), vp["name"], vp["discipline"], vp["view_kind"], vp["subjects"],
                        bbox_mpt, vp["level_label"], Jsonb(vp["stated_scale"]) if vp["stated_scale"] is not None else None,
                        idx, vp["relevant"], reason, sheet_status,
                    ),
                )

    # The source structure may have changed. Existing specification evidence can no
    # longer be proven to refer to the current page/viewport set.
    with transaction() as conn:
        conn.execute("DELETE FROM spec_item WHERE project_id=%s", (str(project_id),))

    build_initial_storeys(project_id)

def build_initial_storeys(project_id: UUID | str) -> None:
    # Imported here to keep triage and deterministic storey ordering separate.
    from .levels import rebuild_storey_stack

    rebuild_storey_stack(project_id, preserve_existing=True)
