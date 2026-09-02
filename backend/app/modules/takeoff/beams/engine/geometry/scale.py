"""S2 — unit detection and scale calibration.

Scale may be in the title block (e.g. "SCALE 1:50") *or* next to a viewport
(e.g. 'Scale: 1/8" = 1'-0"'). A mixed sheet can have a different scale per
drawing. Stated scale is verified against a labeled dimension.
"""
from __future__ import annotations

import math
import re

PT_TO_MM = 25.4 / 72.0
METRIC_SCALE_RE = re.compile(
    r"(?:SCALE|SC)?\s*:?\s*1\s*[:=]\s*(\d+(?:\.\d+)?)", re.IGNORECASE)
# 1/8" = 1'-0"  |  1/2" = 1' 0"  |  2" = 1'-0"  |  Scale: 1/8" = 1'-0"
IMPERIAL_SCALE_RE = re.compile(
    r"(?:SCALE\s*:?\s*)?"
    r"(?P<paper>\d+\s*/\s*\d+|\d+(?:\.\d+)?)\s*(?:\"|”|in)\s*"
    r"=\s*"
    r"(?P<feet>\d+)\s*(?:'|’|ft)?"
    r"(?:\s*-?\s*(?P<inches>\d+)\s*(?:\"|”)?)?",
    re.IGNORECASE,
)
DIM_MM_RE = re.compile(r"^(\d{3,6})$")            # bare mm dimension like 6000
DIM_IN_RE = re.compile(r'^(\d+)\s*(?:"|in\b)', re.IGNORECASE)
MISMATCH_TOL = 0.05                                # 5%
# keep the old name so existing imports of SCALE_RE still see metric labels
SCALE_RE = METRIC_SCALE_RE


def detect_units(texts: list[dict]) -> str:
    """imperial if inch-style dimensions dominate, else metric."""
    imperial = sum(1 for t in texts if DIM_IN_RE.match(t["text"]))
    metric = sum(1 for t in texts if DIM_MM_RE.match(t["text"]))
    return "imperial" if imperial > metric else "metric"


def _paper_inches(raw: str) -> float:
    s = raw.replace(" ", "")
    if "/" in s:
        a, b = s.split("/", 1)
        return float(a) / float(b)
    return float(s)


def parse_scale_label(text: str) -> float | None:
    """Return representative scale denominator, or None.

    Metric `1:50` → 50. Imperial `1/8" = 1'-0"` → 96 (paper inch : real inch).
    """
    if not text:
        return None
    m = METRIC_SCALE_RE.search(text)
    if m:
        return float(m.group(1))
    m = IMPERIAL_SCALE_RE.search(text)
    if not m:
        return None
    paper = _paper_inches(m.group("paper"))
    if paper <= 0:
        return None
    feet = float(m.group("feet"))
    inches = float(m.group("inches") or 0)
    real_inches = feet * 12.0 + inches
    return round(real_inches / paper, 6)


def join_text_lines(texts: list[dict], y_bin: float = 8.0) -> list[dict]:
    """Glue spans that sit on the same baseline so 'Scale:' + '1/8"' + '= 1\\'-0\"' parse."""
    buckets: dict[int, list[dict]] = {}
    for t in texts:
        key = int(((t["y0"] + t["y1"]) / 2) / y_bin)
        buckets.setdefault(key, []).append(t)
    lines = []
    for spans in buckets.values():
        spans = sorted(spans, key=lambda s: s["x0"])
        lines.append({
            "text": " ".join(s["text"] for s in spans),
            "x0": min(s["x0"] for s in spans),
            "y0": min(s["y0"] for s in spans),
            "x1": max(s["x1"] for s in spans),
            "y1": max(s["y1"] for s in spans),
        })
    return lines


def find_scales(texts: list[dict]) -> list[dict]:
    """All scale labels on a page: {denom, scale_text, x0,y0,x1,y1}."""
    found: list[dict] = []
    seen: set[tuple] = set()
    for t in list(texts) + join_text_lines(texts):
        denom = parse_scale_label(t["text"])
        if denom is None:
            continue
        key = (round(denom, 3), round(t["x0"], 1), round(t["y0"], 1))
        if key in seen:
            continue
        seen.add(key)
        found.append({
            "denom": denom,
            "scale_text": t["text"],
            "x0": t["x0"], "y0": t["y0"], "x1": t["x1"], "y1": t["y1"],
            "dim_text": t,
        })
    return found


def _center(item: dict) -> tuple[float, float]:
    return ((item["x0"] + item["x1"]) / 2, (item["y0"] + item["y1"]) / 2)


def in_bbox(item: dict, bbox: tuple[float, float, float, float] | None,
            pad: float = 0.0) -> bool:
    if bbox is None:
        return True
    x, y = _center(item)
    return bbox[0] - pad <= x <= bbox[2] + pad and bbox[1] - pad <= y <= bbox[3] + pad


def scale_for_region(texts: list[dict],
                     bbox: tuple[float, float, float, float] | None = None) -> dict | None:
    """Pick the scale label belonging to a viewport.

    Prefer labels inside/near the viewport (typical 'Scale: …' under a section
    title). Fall back to any scale on the page (title block) if none sit in the
    viewport. Never assume the title-block scale is the only one.
    """
    found = find_scales(texts)
    if not found:
        return None
    if bbox is None:
        return found[0]
    pad_x = 0.08 * max(1.0, bbox[2] - bbox[0])
    pad_y = 0.12 * max(1.0, bbox[3] - bbox[1])
    inside = [s for s in found if in_bbox(s, bbox, pad=max(pad_x, pad_y, 24))]
    if inside:
        return inside[0]
    cx, cy = (bbox[0] + bbox[2]) / 2, bbox[3]  # just below the drawing
    return min(found, key=lambda s: math.hypot(_center(s)[0] - cx, _center(s)[1] - cy))


def stated_scale(texts: list[dict]) -> float | None:
    hit = scale_for_region(texts, bbox=None)
    return hit["denom"] if hit else None


def mm_per_point(scale_denom: float) -> float:
    return PT_TO_MM * scale_denom


def _point_seg_distance(px: float, py: float, p: dict) -> float:
    x0, y0, x1, y1 = p["x0"], p["y0"], p["x1"], p["y1"]
    dx, dy = x1 - x0, y1 - y0
    n2 = dx * dx + dy * dy
    if n2 == 0:
        return math.hypot(px - x0, py - y0)
    t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / n2))
    return math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))


def verify_scale(texts: list[dict], solid_paths: list[dict], scale_denom: float,
                 unit_system: str = "metric") -> dict:
    """Find a labeled dimension near a solid line; compare label vs line-length × scale.

    Returns {verified: bool, label_mm, measured_mm, dim_text, line} or
    {verified: None} when no calibration pair was found (caller raises a question).
    """
    for t in texts:
        m = DIM_MM_RE.match(t["text"]) if unit_system == "metric" else DIM_IN_RE.match(t["text"])
        if not m:
            continue
        label_mm = float(m.group(1)) * (25.4 if unit_system == "imperial" else 1.0)
        tx, ty = (t["x0"] + t["x1"]) / 2, (t["y0"] + t["y1"]) / 2
        best, best_d = None, math.inf
        for p in solid_paths:
            d = _point_seg_distance(tx, ty, p)
            if d < best_d and p["length"] > 20:
                best, best_d = p, d
        if best is None or best_d > 40:
            continue
        measured_mm = best["length"] * mm_per_point(scale_denom)
        ok = abs(measured_mm - label_mm) / label_mm <= MISMATCH_TOL
        return {"verified": ok, "label_mm": label_mm, "measured_mm": round(measured_mm, 1),
                "dim_text": t, "line": best}
    return {"verified": None}
