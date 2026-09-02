from __future__ import annotations

from decimal import Decimal, InvalidOperation
from math import hypot
from pathlib import Path
import re
from uuid import UUID

import pymupdf
from ...database.json_value import Jsonb

from ...core.config import get_settings
from ...database.connection import fetch_one, transaction
from .schemas import ScaleKind, ScaleReading
from ...services.pdf.media import ensure_viewport_crop, norm_crop_point_to_page_pt
from ...services.ai.model_client import get_model_client
from ...services.storage.paths import resolve_key


def is_scale_eligible(viewport: dict) -> bool:
    """Return whether the viewport can be calibrated in the Scale workspace."""
    kind = viewport.get("view_kind")
    if kind in {"elevation", "section"}:
        return True
    if kind != "plan":
        return False
    return not re.search(r"\b(site|location|key)\s+plan\b", viewport.get("name") or "", re.I)


def requires_primary_scale(viewport: dict) -> bool:
    """Return whether Takeoff directly measures geometry from this viewport.

    Sections/elevations remain optional height/reference sources and details are
    calibrated only when a downstream workflow explicitly selects them.  Main
    architectural and structural measurement plans are part of the required set.
    """
    if viewport.get("view_kind") != "plan":
        return False
    name = viewport.get("name") or ""
    if re.search(r"\b(site|location|key)\s+plan\b", name, re.I):
        return False
    discipline = (viewport.get("discipline") or "").lower()
    if discipline in {"architectural", "mixed"}:
        return True
    subjects = {str(subject).lower() for subject in (viewport.get("subjects") or [])}
    structural_subjects = {
        "foundation", "footing", "raft", "pile", "pile_cap", "ground_beam",
        "retaining_wall", "column", "beam", "slab", "structural_wall",
        "stair", "ramp", "roof_structure",
    }
    if discipline == "structural":
        return bool(subjects & structural_subjects) or bool(
            re.search(r"\b(general arrangement|foundation|footing|column|beam|slab|structural|framing)\b", name, re.I)
        )
    return bool(re.search(r"\b(floor|roof|roof terrace|reflected ceiling|ceiling plan|rcp)\b", name, re.I)) and discipline != "civil_site"
from .prompts import SCALE_PROMPT, SYSTEM

TOLERANCE = Decimal("0.01")

UNICODE_FRACTIONS = {
    "½": Decimal("0.5"), "⅓": Decimal(1) / Decimal(3), "⅔": Decimal(2) / Decimal(3),
    "¼": Decimal("0.25"), "¾": Decimal("0.75"), "⅕": Decimal("0.2"), "⅖": Decimal("0.4"),
    "⅗": Decimal("0.6"), "⅘": Decimal("0.8"), "⅙": Decimal(1) / Decimal(6), "⅚": Decimal(5) / Decimal(6),
    "⅛": Decimal("0.125"), "⅜": Decimal("0.375"), "⅝": Decimal("0.625"), "⅞": Decimal("0.875"),
}

WORD_NUMBERS = {
    "a": Decimal(1), "an": Decimal(1), "one": Decimal(1), "two": Decimal(2),
    "three": Decimal(3), "four": Decimal(4), "five": Decimal(5), "six": Decimal(6),
    "seven": Decimal(7), "eight": Decimal(8), "nine": Decimal(9), "ten": Decimal(10),
    "eleven": Decimal(11), "twelve": Decimal(12), "half": Decimal("0.5"),
    "quarter": Decimal("0.25"), "eighth": Decimal("0.125"),
}


def _number(text: str) -> Decimal | None:
    s = text.strip().replace(" ", "")
    for glyph, value in UNICODE_FRACTIONS.items():
        if glyph in s:
            base = s.replace(glyph, "")
            try:
                return (Decimal(base) if base else Decimal(0)) + value
            except InvalidOperation:
                return None
    if "/" in s:
        try:
            n, d = s.split("/", 1)
            return Decimal(n) / Decimal(d)
        except (InvalidOperation, ZeroDivisionError, ValueError):
            return None
    try:
        return Decimal(s)
    except InvalidOperation:
        return None


def parse_normalized_ratio(text: str | None) -> Decimal | None:
    if not text:
        return None
    m = re.fullmatch(r"\s*([0-9.]+)\s*:\s*([0-9.]+)\s*", text)
    if not m:
        return None
    try:
        drawing = Decimal(m.group(1))
        real = Decimal(m.group(2))
        if drawing <= 0 or real <= 0:
            return None
        return real / drawing
    except InvalidOperation:
        return None


def _word_number(text: str) -> Decimal | None:
    words = re.sub(r"[^a-z0-9./]+", " ", text.lower()).strip().split()
    if not words:
        return None
    if len(words) == 1 and words[0] in WORD_NUMBERS:
        return WORD_NUMBERS[words[0]]
    if len(words) == 2 and words[0] in {"one", "a", "an"} and words[1] in {"half", "quarter", "eighth"}:
        return WORD_NUMBERS[words[1]]
    return _number("".join(words))


def parse_word_scale(text: str | None) -> Decimal | None:
    """Parse common written imperial scales into a dimensionless 1:N factor."""
    if not text:
        return None
    value = re.sub(r"\bscale\b\s*:?", "", text.lower()).replace("-", " ")
    # "eight feet to an inch" / "two feet per inch"
    match = re.search(r"([a-z0-9./ ]+?)\s+(?:foot|feet)\s+(?:to|per)\s+(?:one|an?|1)\s+inch", value)
    if match:
        real_feet = _word_number(match.group(1))
        if real_feet and real_feet > 0:
            return real_feet * Decimal(12)
    # "half inch to one foot" / "one inch equals eight feet"
    match = re.search(r"([a-z0-9./ ]+?)\s+inch(?:es)?\s+(?:to|equals?|=)\s+([a-z0-9./ ]+?)\s+(?:foot|feet)", value)
    if match:
        drawing_inches = _word_number(match.group(1))
        real_feet = _word_number(match.group(2))
        if drawing_inches and real_feet and drawing_inches > 0 and real_feet > 0:
            return real_feet * Decimal(12) / drawing_inches
    return None


def parse_length_mm(text: str | None) -> Decimal | None:
    if not text:
        return None
    s = text.strip().replace("′", "'").replace("’", "'").replace("″", '"')
    # feet/inches: 13', 11'-6", 1' 7½", 7½"
    feet_match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*'\s*(?:[- ]\s*([^\"]+)\s*\")?\s*", s)
    if feet_match:
        feet = Decimal(feet_match.group(1))
        inches = _number(feet_match.group(2) or "0")
        if inches is None:
            return None
        return (feet * 12 + inches) * Decimal("25.4")
    inch_match = re.fullmatch(r"\s*([^\"]+)\s*\"\s*", s)
    if inch_match:
        inches = _number(inch_match.group(1))
        return inches * Decimal("25.4") if inches is not None else None
    unit_match = re.fullmatch(r"\s*([0-9.]+)\s*(mm|cm|m)\s*", s, re.I)
    if unit_match:
        value = Decimal(unit_match.group(1))
        unit = unit_match.group(2).lower()
        return value * {"mm": Decimal(1), "cm": Decimal(10), "m": Decimal(1000)}[unit]
    # OCR/model variants: "11 ft 6 in", "11 feet 6 inches", "3 300 mm".
    words = re.sub(r"\s+", " ", s.lower().replace(",", "")).strip()
    imperial = re.fullmatch(
        r"([0-9.]+)\s*(?:ft|foot|feet)\s*(?:[- ]\s*([0-9./]+)\s*(?:in|inch|inches))?",
        words,
    )
    if imperial:
        feet = Decimal(imperial.group(1))
        inches = _number(imperial.group(2) or "0")
        return (feet * 12 + inches) * Decimal("25.4") if inches is not None else None
    spaced_metric = re.fullmatch(r"([0-9 ]+(?:\.[0-9]+)?)\s*(mm|cm|m)", words)
    if spaced_metric:
        value = Decimal(spaced_metric.group(1).replace(" ", ""))
        return value * {"mm": Decimal(1), "cm": Decimal(10), "m": Decimal(1000)}[spaced_metric.group(2)]
    # construction dimension strings without a unit are treated as millimetres.
    if re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", s):
        return Decimal(s)
    return None


def parse_scale_note(note: dict | None) -> dict:
    if not note:
        return {"kind": "unknown", "factor": None, "status": "unparseable"}
    kind = note.get("kind", "unknown")
    text = note.get("text")
    scale_text = re.sub(r"^\s*scale\s*:\s*", "", text or "", flags=re.I)
    normalized = note.get("normalized_ratio")
    factor: Decimal | None = None

    if kind == ScaleKind.RATIO.value:
        if normalized is not None:
            return {"kind": kind, "factor": None, "status": "unparseable"}
        factor = parse_normalized_ratio(text)
    elif kind == ScaleKind.PLAIN_TEXT.value:
        factor = parse_normalized_ratio(normalized) or parse_word_scale(text)
    elif kind == ScaleKind.IMPERIAL_ARCHITECTURAL.value:
        # example: 1/8" = 1'-0"
        if normalized is not None:
            return {"kind": kind, "factor": None, "status": "unparseable"}
        m = re.search(r"([^\"]+)\"\s*=\s*(\d+)\s*'\s*(?:[- ]\s*([^\"]+)\")?", scale_text)
        if m:
            drawing_inches = _number(m.group(1))
            real_inches = Decimal(m.group(2)) * 12 + (_number(m.group(3) or "0") or Decimal(0))
            if drawing_inches and drawing_inches > 0:
                factor = real_inches / drawing_inches
    elif kind == ScaleKind.IMPERIAL_ENGINEERING.value:
        if normalized is not None:
            return {"kind": kind, "factor": None, "status": "unparseable"}
        m = re.search(r"([^\"]+)\"\s*=\s*([^']+)\s*'", scale_text)
        if m:
            drawing_inches = _number(m.group(1))
            real_feet = _number(m.group(2))
            if drawing_inches and real_feet:
                factor = real_feet * 12 / drawing_inches
    elif kind in {ScaleKind.GRAPHIC.value, ScaleKind.AS_INDICATED.value, ScaleKind.NOT_TO_SCALE.value}:
        return {"kind": kind, "factor": None, "status": "non_numeric"}

    return {"kind": kind, "factor": factor, "status": "numeric" if factor is not None else "unparseable"}


def _vector_segments(ctx: dict) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    pdf_path = resolve_key(ctx["document_storage_key"])
    doc = pymupdf.open(pdf_path)
    page = doc[ctx["page_number"] - 1]
    segments: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for drawing in page.get_drawings():
        for item in drawing.get("items", []):
            if item and item[0] == "l":
                p1, p2 = item[1], item[2]
                segments.append(((float(p1.x), float(p1.y)), (float(p2.x), float(p2.y))))
    doc.close()
    return segments


def _snap_dimension_line(ctx: dict, line: dict, axis: str) -> dict | None:
    proposed1 = norm_crop_point_to_page_pt(ctx, line["x1"], line["y1"])
    proposed2 = norm_crop_point_to_page_pt(ctx, line["x2"], line["y2"])
    pmid = ((proposed1[0] + proposed2[0]) / 2, (proposed1[1] + proposed2[1]) / 2)
    plen = hypot(proposed2[0] - proposed1[0], proposed2[1] - proposed1[1])
    best = None
    best_score = float("inf")
    for p1, p2 in _vector_segments(ctx):
        dx, dy = abs(p2[0] - p1[0]), abs(p2[1] - p1[1])
        if axis == "x" and dy > max(0.8, dx * 0.03):
            continue
        if axis == "y" and dx > max(0.8, dy * 0.03):
            continue
        length = hypot(p2[0] - p1[0], p2[1] - p1[1])
        if length < 2:
            continue
        mid = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
        mid_dist = hypot(mid[0] - pmid[0], mid[1] - pmid[1])
        length_penalty = abs(length - plen) * 0.35
        score = mid_dist + length_penalty
        if score < best_score:
            best_score, best = score, (p1, p2, length)
    # Keep snapping local. If vector evidence is not near the proposal, it is not evidence.
    if not best or best_score > max(18.0, plen * 0.25):
        return None
    p1, p2, length = best
    return {
        "proposed_norm": [line["x1"], line["y1"], line["x2"], line["y2"]],
        "proposed_page_points": [proposed1, proposed2],
        "snapped_page_points": [p1, p2],
        "paper_length_pt": length,
        "snap_residual_pt": best_score,
        "text": line["text"],
    }


def _axis_factor(snap: dict | None) -> tuple[Decimal | None, dict]:
    if not snap:
        return None, {"usable": False, "reason": "No local vector snap"}
    real_mm = parse_length_mm(snap["text"])
    if real_mm is None:
        return None, {**snap, "usable": False, "reason": "Dimension text could not be parsed"}
    paper_mm = Decimal(str(snap["paper_length_pt"])) * Decimal("25.4") / Decimal(72)
    if paper_mm <= 0:
        return None, {**snap, "usable": False, "reason": "Zero paper length"}
    factor = real_mm / paper_mm
    return factor, {**snap, "usable": True, "real_length_mm": float(real_mm), "factor": float(factor)}


def _proposal_factor(ctx: dict, line: dict, printed: Decimal | None) -> tuple[Decimal | None, dict]:
    proposal = [line["x1"], line["y1"], line["x2"], line["y2"]]
    evidence = {"proposed_norm": proposal, "text": line["text"], "usable": False, "reason": "No local vector snap"}
    if printed is None:
        return None, evidence
    real_mm = parse_length_mm(line["text"])
    if real_mm is None:
        return None, {**evidence, "reason": "Dimension text could not be parsed"}
    p1 = norm_crop_point_to_page_pt(ctx, line["x1"], line["y1"])
    p2 = norm_crop_point_to_page_pt(ctx, line["x2"], line["y2"])
    paper_pt = Decimal(str(hypot(p2[0] - p1[0], p2[1] - p1[1])))
    if paper_pt <= 0:
        return None, {**evidence, "reason": "Proposed dimension line has zero length"}
    paper_mm = paper_pt * Decimal("25.4") / Decimal(72)
    factor = real_mm / paper_mm
    deviation = abs(factor - printed) / printed
    details = {
        **evidence,
        "proposed_page_points": [p1, p2],
        "paper_length_pt": float(paper_pt),
        "real_length_mm": float(real_mm),
        "factor": float(factor),
        "deviation_from_printed": float(deviation),
        "validation": "vision_endpoints_against_printed_scale",
    }
    # Vision endpoints are secondary evidence. Accept them only when the
    # independently parsed dimension and printed scale agree closely.
    if deviation <= Decimal("0.05"):
        return factor, {**details, "usable": True, "reason": "Agrees with printed scale within 5%"}
    return None, {**details, "reason": "Vision endpoints do not agree with printed scale"}


def _unique_candidates(primary: dict | None, candidates: list[dict]) -> list[dict]:
    result: list[dict] = []
    seen: set[tuple] = set()
    for line in ([primary] if primary else []) + candidates:
        key = (line["text"].strip().lower(), line["x1"], line["y1"], line["x2"], line["y2"])
        if key not in seen:
            seen.add(key)
            result.append(line)
    return result[:5]


def _select_axis_candidate(ctx: dict, candidates: list[dict], axis: str, printed: Decimal | None) -> tuple[Decimal | None, dict]:
    evaluated: list[tuple[Decimal | None, dict]] = []
    for line in candidates:
        snap = _snap_dimension_line(ctx, line, axis)
        factor, check = _axis_factor(snap)
        if snap is None:
            factor, check = _proposal_factor(ctx, line, printed)
        if factor is not None and printed is not None:
            check["deviation_from_printed"] = float(abs(factor - printed) / printed)
        evaluated.append((factor, check))
    usable = [(factor, check) for factor, check in evaluated if factor is not None and check.get("usable")]
    if usable:
        def rank(item: tuple[Decimal | None, dict]) -> tuple[float, float]:
            _, check = item
            deviation = float(check.get("deviation_from_printed", 0 if printed is None else 999))
            residual = float(check.get("snap_residual_pt", 999))
            return deviation, residual
        factor, selected = min(usable, key=rank)
    elif evaluated:
        factor, selected = evaluated[0]
    else:
        factor, selected = None, {"usable": False, "reason": "No dimension candidate detected"}
    selected = {**selected, "candidates": [check for _, check in evaluated]}
    return factor, selected


def roundness_score(factor: Decimal | float, sample_lengths_pt: list[float], unit: str) -> Decimal:
    """Supplementary drafting-precision evidence. Never used as a confirmation gate."""
    value = Decimal(str(factor))
    if value <= 0 or not sample_lengths_pt:
        return Decimal(0)
    hits = 0
    total = 0
    for length_pt in sample_lengths_pt:
        if length_pt <= 0:
            continue
        if unit == "in":
            real = Decimal(str(length_pt)) / Decimal(72) * value
            step = Decimal(1)
        else:
            real = Decimal(str(length_pt)) * Decimal("25.4") / Decimal(72) * value
            step = Decimal(10)
        if real <= 0:
            continue
        nearest = (real / step).quantize(Decimal(1)) * step
        deviation = abs(real - nearest) / max(real, step)
        total += 1
        if deviation <= Decimal("0.01"):
            hits += 1
    return Decimal(hits) / Decimal(total) if total else Decimal(0)


def _roundness_evidence(ctx: dict, candidates: dict[str, Decimal | None], scale_kind: str) -> dict:
    lengths = []
    for p1, p2 in _vector_segments(ctx):
        length = hypot(p2[0] - p1[0], p2[1] - p1[1])
        if 4 <= length <= 400:
            lengths.append(length)
        if len(lengths) >= 250:
            break
    unit = "in" if scale_kind in {ScaleKind.IMPERIAL_ARCHITECTURAL.value, ScaleKind.IMPERIAL_ENGINEERING.value} else "mm"
    return {
        "unit": unit,
        "sample_count": len(lengths),
        "scores": {name: float(roundness_score(factor, lengths, unit)) if factor is not None else None for name, factor in candidates.items()},
    }


def suggest_scale(viewport_id: UUID | str) -> dict:
    crop_path, ctx = ensure_viewport_crop(viewport_id)
    reading = get_model_client("pre").parse_image(Path(crop_path), SCALE_PROMPT, ScaleReading, system=SYSTEM)
    raw = reading.model_dump(mode="json")
    parsed = parse_scale_note(ctx.get("stated_scale") or ctx.get("title_block_scale"))
    printed = parsed["factor"]
    x_candidates = _unique_candidates(raw["x_line"], raw.get("x_candidates") or [])
    y_candidates = _unique_candidates(raw["y_line"], raw.get("y_candidates") or [])
    factor_x, check_x = _select_axis_candidate(ctx, x_candidates, "x", printed)
    factor_y, check_y = _select_axis_candidate(ctx, y_candidates, "y", printed)
    anisotropy: Decimal | None = None
    stretched = False
    if factor_x is not None and factor_y is not None:
        anisotropy = max(factor_x, factor_y) / min(factor_x, factor_y)
        stretched = anisotropy > Decimal("1.01")

    def agrees(value: Decimal | None, reference: Decimal | None) -> bool:
        return bool(value is not None and reference is not None and abs(value - reference) / reference <= TOLERANCE)

    if printed is not None and factor_x is not None and factor_y is not None and agrees(factor_x, printed) and agrees(factor_y, printed):
        recommendation = "PRINTED_AGREES"
    elif printed is None and factor_x is not None and factor_y is not None and abs(factor_x - factor_y) / factor_x <= TOLERANCE:
        recommendation = "XY_DERIVED"
    else:
        recommendation = "NEEDS_CHOICE"
    anisotropy_refused = stretched and recommendation != "PRINTED_AGREES"

    if printed is not None and printed > 0:
        if factor_x is not None:
            check_x["deviation_from_printed"] = float(abs(factor_x - printed) / printed)
        if factor_y is not None:
            check_y["deviation_from_printed"] = float(abs(factor_y - printed) / printed)
    roundness = _roundness_evidence(ctx, {"printed": printed, "x": factor_x, "y": factor_y}, parsed["kind"])
    printed_source = "viewport" if ctx.get("stated_scale") else "title_block" if ctx.get("title_block_scale") else "missing"
    auto_confirmable = recommendation == "PRINTED_AGREES" or bool(
        printed is not None and printed > 0 and printed_source == "viewport" and parsed["status"] == "numeric"
    )

    checks = {
        "recommendation": recommendation,
        "roundness": roundness,
        "printed": {"status": parsed["status"], "factor": float(printed) if printed is not None else None, "note": ctx.get("stated_scale") or ctx.get("title_block_scale"), "source": printed_source},
        "x": check_x,
        "y": check_y,
        "anisotropy_refused": anisotropy_refused,
        "requires_human_calibration": factor_x is None and factor_y is None,
        "auto_confirmable": auto_confirmable,
    }
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO scale_fit(viewport_id,method,factor_x,factor_y,anisotropy_ratio,checks,status,crop_version)
               VALUES (%s,'model_validated',%s,%s,%s,%s,'proposed',%s) RETURNING *""",
            (
                str(viewport_id), factor_x, factor_y, anisotropy, Jsonb(checks), ctx["crop_version"],
            ),
        ).fetchone()
    result = dict(row)
    result["checks"] = checks
    return result


def manual_calibration_factor(viewport_id: UUID | str, p1: list[float], p2: list[float], real_distance: str, unit: str | None) -> Decimal:
    _, ctx = ensure_viewport_crop(viewport_id)
    # UI sends 0..1 crop coordinates.
    a = norm_crop_point_to_page_pt(ctx, p1[0] * 1000, p1[1] * 1000)
    b = norm_crop_point_to_page_pt(ctx, p2[0] * 1000, p2[1] * 1000)
    paper_pt = Decimal(str(hypot(b[0] - a[0], b[1] - a[1])))
    if paper_pt <= 0:
        raise ValueError("Calibration line has zero length")
    if unit and unit not in {"ft_in", "text"} and re.fullmatch(r"[0-9.]+", real_distance.strip()):
        suffix = {"mm": "mm", "cm": "cm", "m": "m", "in": '"', "ft": "'"}.get(unit, "")
        real_distance = real_distance.strip() + suffix
    real_mm = parse_length_mm(real_distance)
    if real_mm is None:
        raise ValueError("Could not parse real calibration distance")
    paper_mm = paper_pt * Decimal("25.4") / Decimal(72)
    return real_mm / paper_mm
