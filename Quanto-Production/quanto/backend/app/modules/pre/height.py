from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from uuid import UUID

from ...database.json_value import Jsonb

from ...database.connection import fetch_all, fetch_one, transaction
from .schemas import HeightReading
from ...services.pdf.geometry import distance_pt
from ...services.pdf.media import ensure_viewport_crop, norm_crop_point_to_page_pt
from ...services.ai.model_client import get_model_client
from .prompts import HEIGHT_PROMPT, SYSTEM
from .scale import parse_length_mm
from .confirmations import is_confirmed
from .levels import is_storey_label, rebuild_storey_stack


def _round_10mm(value: Decimal) -> int:
    return int((value / Decimal(10)).quantize(Decimal(1), rounding=ROUND_HALF_UP) * 10)


def confirmed_scale(viewport_id: UUID | str) -> dict | None:
    row = fetch_one(
        """SELECT sf.*, v.crop_version AS viewport_crop_version
           FROM scale_fit sf JOIN viewport v ON v.id=sf.viewport_id
           WHERE sf.viewport_id=%s AND sf.status='confirmed'
           ORDER BY sf.created_at DESC LIMIT 1""",
        (str(viewport_id),),
    )
    if not row or row["crop_version"] != row["viewport_crop_version"]:
        return None
    return row


def eligible_sources(project_id: UUID | str) -> list[dict]:
    rows = fetch_all(
        """SELECT v.id, v.name, v.view_kind, v.crop_version, s.sheet_no, s.title, p.page_number
           FROM viewport v JOIN sheet s ON s.id=v.sheet_id JOIN page p ON p.id=s.page_id
           JOIN document d ON d.id=p.document_id
           WHERE d.project_id=%s AND s.included=true AND v.relevant=true
             AND v.view_kind IN ('section','elevation')
           ORDER BY CASE WHEN v.view_kind='section' THEN 0 ELSE 1 END, p.page_number, v.display_order""",
        (str(project_id),),
    )
    result = []
    for row in rows:
        scale = confirmed_scale(row["id"])
        item = {**row, "scale_confirmed": False, "scale_factor": None, "crop_span_mm": None}
        if scale and is_confirmed("scale", scale["id"]):
            checks = scale.get("checks") or {}
            factor_value = checks.get("confirmed_factor") or scale.get("factor_y") or scale.get("factor_x")
            crop_span_mm = None
            if factor_value is not None:
                _, ctx = ensure_viewport_crop(row["id"])
                top = norm_crop_point_to_page_pt(ctx, 500, 0)
                bottom = norm_crop_point_to_page_pt(ctx, 500, 1000)
                crop_span_mm = distance_pt(top, bottom) * 25.4 / 72 * float(factor_value)
            item.update({
                "scale_confirmed": True,
                "scale_factor": float(factor_value) if factor_value is not None else None,
                "crop_span_mm": crop_span_mm,
            })
        # Printed dimensions can be read without a drawing scale.  A confirmed
        # scale is only needed for the measurement fallback/verification.
        result.append(item)
    return result


def _factor_y(scale: dict) -> Decimal:
    checks = scale.get("checks") or {}
    if checks.get("confirmed_factor") is not None:
        return Decimal(str(checks["confirmed_factor"]))
    if scale.get("factor_y") is not None:
        return Decimal(str(scale["factor_y"]))
    if scale.get("factor_x") is not None:
        return Decimal(str(scale["factor_x"]))
    raise ValueError("Confirmed scale has no usable factor")


def _measure_reading(viewport_id: UUID | str, storeys: list[dict]) -> tuple[list[dict], dict]:
    scale = confirmed_scale(viewport_id)
    scale = scale if scale and is_confirmed("scale", scale["id"]) else None
    factor = _factor_y(scale) if scale else None
    crop_path, ctx = ensure_viewport_crop(viewport_id)
    vp = fetch_one("SELECT name, view_kind FROM viewport WHERE id=%s", (str(viewport_id),))
    stack_text = "\n".join(f"{i+1}. {s['name']}" for i, s in enumerate(storeys)) or "(no storeys)"
    prompt = HEIGHT_PROMPT.format(source_kind=vp["view_kind"], storey_stack=stack_text)
    reading = get_model_client("pre").parse_image(Path(crop_path), prompt, HeightReading, system=SYSTEM)
    measured: list[dict] = []
    for band in reading.model_dump(mode="json")["bands"]:
        top = norm_crop_point_to_page_pt(ctx, 500, band["y_top"])
        bottom = norm_crop_point_to_page_pt(ctx, 500, band["y_bottom"])
        paper_pt = Decimal(str(abs(bottom[1] - top[1])))
        measured_mm = paper_pt * Decimal("25.4") / Decimal(72) * factor if factor is not None else None
        printed_mm = parse_length_mm(band["height_text"])
        measured_rounded = _round_10mm(measured_mm) if measured_mm is not None else None
        printed_rounded = _round_10mm(printed_mm) if printed_mm is not None else None
        agreement = None
        if printed_mm and printed_mm > 0 and measured_mm is not None:
            agreement = float(abs(measured_mm - printed_mm) / printed_mm)
        if printed_mm is not None:
            basis = "printed_and_measured" if agreement is not None and agreement <= 0.02 else "printed_dimension"
        else:
            basis = "measured" if measured_mm is not None else "unresolved"
        measured.append({
            **band,
            "measured_mm": measured_rounded,
            "printed_mm": printed_rounded,
            "agreement": agreement,
            "basis": basis,
            "flagged": agreement is not None and agreement > 0.02,
        })
    return measured, {"viewport_id": str(viewport_id), "scale_fit_id": str(scale["id"]) if scale else None, "factor": float(factor) if factor is not None else None}



def height_from_band(project_id: UUID | str, viewport_id: UUID | str, y_top: int, y_bottom: int) -> tuple[int, dict]:
    eligible = {str(row["id"]) for row in eligible_sources(project_id)}
    if str(viewport_id) not in eligible:
        raise ValueError("Height line source is not an eligible confirmed section/elevation for this project")
    scale = confirmed_scale(viewport_id)
    if not scale or not is_confirmed("scale", scale["id"]):
        raise ValueError("Height line source needs a current explicitly confirmed scale")
    _, ctx = ensure_viewport_crop(viewport_id)
    top = norm_crop_point_to_page_pt(ctx, 500, y_top)
    bottom = norm_crop_point_to_page_pt(ctx, 500, y_bottom)
    paper_pt = Decimal(str(distance_pt(top, bottom)))
    factor = _factor_y(scale)
    measured_mm = paper_pt * Decimal("25.4") / Decimal(72) * factor
    return _round_10mm(measured_mm), {
        "source_viewport_id": str(viewport_id),
        "scale_fit_id": str(scale["id"]),
        "factor": float(factor),
        "y_top": y_top,
        "y_bottom": y_bottom,
    }

def _normal_label(label: str | None) -> str:
    return " ".join((label or "").lower().replace("floor", "").split())


def _match(storeys: list[dict], bands_top_to_bottom: list[dict]) -> dict[str, dict]:
    bands = list(reversed(bands_top_to_bottom))
    result: dict[str, dict] = {}
    unused = list(range(len(bands)))
    # First use labels where both sides have a usable label.
    for s in storeys:
        sn = _normal_label(s["name"])
        exact = [i for i in unused if _normal_label(bands[i].get("label")) and _normal_label(bands[i].get("label")) in sn]
        if len(exact) == 1:
            idx = exact[0]
            result[str(s["id"])] = bands[idx]
            unused.remove(idx)
    # Position fallback is safe only when remaining counts match.
    remaining_storeys = [s for s in storeys if str(s["id"]) not in result]
    if len(remaining_storeys) == len(unused):
        for s, idx in zip(remaining_storeys, unused):
            result[str(s["id"])] = bands[idx]
    return result


def suggest_heights(project_id: UUID | str, primary_viewport_id: UUID, supporting_viewport_id: UUID | None = None) -> dict:
    eligible = {str(row["id"]) for row in eligible_sources(project_id)}
    if str(primary_viewport_id) not in eligible:
        raise ValueError("Primary height source is not an eligible confirmed section/elevation for this project")
    if supporting_viewport_id and str(supporting_viewport_id) not in eligible:
        raise ValueError("Supporting height source is not an eligible confirmed section/elevation for this project")
    storeys = fetch_all("SELECT * FROM storey WHERE project_id=%s ORDER BY level_index", (str(project_id),))
    # Early, unconfirmed projects created by older detection could contain
    # datums/ranges as storeys. Repair that proposal before height matching.
    if storeys and not any(s.get("status") == "confirmed" for s in storeys) and any(not is_storey_label(s["name"]) for s in storeys):
        storeys = rebuild_storey_stack(project_id, preserve_existing=False)
    if not storeys:
        raise ValueError("Storey stack is empty")
    primary, primary_meta = _measure_reading(primary_viewport_id, storeys)
    primary_match = _match(storeys, primary)

    supporting_match: dict[str, dict] = {}
    supporting_meta = None
    if supporting_viewport_id:
        supporting, supporting_meta = _measure_reading(supporting_viewport_id, storeys)
        supporting_match = _match(storeys, supporting)

    unresolved: list[str] = []
    with transaction() as conn:
        for s in storeys:
            sid = str(s["id"])
            band = primary_match.get(sid)
            if not band:
                unresolved.append(sid)
                continue
            # Printed floor-to-floor dimensions are primary evidence. A scale
            # measurement is a fallback and an independent check only.
            height_mm = band["printed_mm"] or band["measured_mm"]
            if not height_mm:
                unresolved.append(sid)
                continue
            support = supporting_match.get(sid)
            support_delta = None
            support_flag = False
            if support:
                support_height = support["printed_mm"] or support["measured_mm"]
                if height_mm and support_height:
                    support_delta = abs(support_height - height_mm) / height_mm
                    support_flag = support_delta > 0.01
            evidence = {
                "primary": band,
                "primary_meta": primary_meta,
                "supporting": support,
                "supporting_meta": supporting_meta,
                "supporting_delta": support_delta,
                "supporting_flagged": support_flag,
            }
            conn.execute(
                """UPDATE storey SET height_mm=%s,height_source_viewport_id=%s,height_y_top=%s,height_y_bottom=%s,
                   height_basis=%s,height_evidence=%s,status='saved_not_confirmed' WHERE id=%s""",
                (height_mm, str(primary_viewport_id), band["y_top"], band["y_bottom"], band["basis"], Jsonb(evidence), sid),
            )
    return {
        "storeys": fetch_all("SELECT * FROM storey WHERE project_id=%s ORDER BY level_index", (str(project_id),)),
        "unresolved_storey_ids": unresolved,
    }
