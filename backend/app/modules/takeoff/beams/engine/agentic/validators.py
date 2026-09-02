"""Deterministic validators — the machine's definition of done (plan §3 layer 2).

Each validator is a pure function (draft, ctx) -> ValidationReport. `answer`
gates on it; `preview_answer` runs it advisorily. Snap-to-vector happens here:
candidates near a reconstructed vector run are snapped to its exact geometry.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from agentic.context import AgenticContext
from geometry.network import NetBeam, dedupe_beams

SNAP_ANGLE_DEG = 8.0
SNAP_DIST_PT = 14.0
COVERAGE_MIN_RUN_PT = 60.0
COVER_DIST_PT = 18.0


@dataclass
class ValidationReport:
    failures: list[str] = field(default_factory=list)
    normalized: dict = field(default_factory=dict)
    stats: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.failures


def _seg_angle(x0, y0, x1, y1) -> float:
    return math.degrees(math.atan2(y1 - y0, x1 - x0)) % 180.0


def _line_dist(px, py, x0, y0, x1, y1) -> float:
    dx, dy = x1 - x0, y1 - y0
    n2 = dx * dx + dy * dy
    if n2 == 0:
        return math.hypot(px - x0, py - y0)
    t = max(0.0, min(1.0, ((px - x0) * dx + (py - y0) * dy) / n2))
    return math.hypot(px - (x0 + t * dx), py - (y0 + t * dy))


def _snap_candidate(c: dict, ctx: AgenticContext) -> tuple[dict, bool]:
    """Snap a fraction-space candidate line to the nearest vector run. Returns
    (candidate, snapped) — snapped candidates carry vector-exact endpoints."""
    W, H = ctx.page_width, ctx.page_height
    x0, y0, x1, y1 = c["x0"] * W, c["y0"] * H, c["x1"] * W, c["y1"] * H
    ang = _seg_angle(x0, y0, x1, y1)
    mx, my = (x0 + x1) / 2, (y0 + y1) / 2
    best, best_d = None, SNAP_DIST_PT
    for r in ctx.runs:
        ra = _seg_angle(r.x0, r.y0, r.x1, r.y1)
        d = abs(ra - ang)
        if min(d, 180.0 - d) > SNAP_ANGLE_DEG:
            continue
        dist = _line_dist(mx, my, r.x0, r.y0, r.x1, r.y1)
        if dist < best_d:
            best, best_d = r, dist
    if best is None:
        return {**c, "snapped": False}, False
    return {**c, "x0": best.x0 / W, "y0": best.y0 / H,
            "x1": best.x1 / W, "y1": best.y1 / H, "snapped": True}, True


def validate_identify_beams(draft: dict, ctx: AgenticContext) -> ValidationReport:
    rep = ValidationReport()
    cands = list(draft.get("candidates") or [])
    W, H = ctx.page_width, ctx.page_height

    # bounds
    oob = [i for i, c in enumerate(cands)
           if not all(0.0 <= c[k] <= 1.0 for k in ("x0", "y0", "x1", "y1"))]
    if oob:
        rep.failures.append(f"{len(oob)} candidate(s) outside the sheet "
                            f"(indices {oob[:5]}): coordinates must be 0..1 fractions.")

    # snap-to-vector (vision proposes, the vector disposes)
    snapped_out, n_snapped = [], 0
    for c in cands:
        sc, snapped = _snap_candidate(c, ctx) if c.get("kind") == "dashed" else (dict(c), False)
        n_snapped += snapped
        snapped_out.append(sc)
    cands = snapped_out

    # duplicates (reuse the pipeline's own dedupe — one truth)
    nets = [NetBeam(str(i), c["x0"] * W, c["y0"] * H, c["x1"] * W, c["y1"] * H)
            for i, c in enumerate(cands) if c.get("kind") == "dashed"]
    _, dropped = dedupe_beams(nets)
    if dropped:
        pairs = [f"#{a}~#{b}" for a, b in dropped[:6]]
        rep.failures.append(
            f"{len(dropped)} duplicate candidate pair(s) ({', '.join(pairs)}): "
            "merge each pair into one beam line.")

    # coverage of the vector index
    unmatched_declared = draft.get("unmatched_runs") or []
    uncovered = []
    for r in [r for r in ctx.runs if r.length >= COVERAGE_MIN_RUN_PT]:
        mx, my = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
        covered = any(
            _line_dist(mx, my, c["x0"] * W, c["y0"] * H, c["x1"] * W, c["y1"] * H)
            <= COVER_DIST_PT
            for c in cands if c.get("kind") == "dashed")
        declared = any(
            math.hypot(u.get("x", -1e9) * W - mx, u.get("y", -1e9) * H - my) <= 40
            for u in unmatched_declared)
        if not covered and not declared:
            uncovered.append((round(mx / W, 3), round(my / H, 3)))
    if uncovered:
        rep.failures.append(
            f"{len(uncovered)} vector dashed run(s) not covered by any candidate and "
            f"not declared in unmatched_runs. First few midpoints (fractions): "
            f"{uncovered[:5]}. Crop those regions, then either add candidates or "
            "declare them unmatched with a reason.")

    rep.normalized = {**draft, "candidates": cands}
    rep.stats = {"candidates": len(cands), "snapped": n_snapped,
                 "vector_runs": len(ctx.runs), "uncovered": len(uncovered)}
    return rep


def validate_read_schedule(draft: dict, ctx: AgenticContext) -> ValidationReport:
    rep = ValidationReport()
    rows = list(draft.get("rows") or [])
    marks = [r.get("mark") for r in rows]
    dupes = {m for m in marks if marks.count(m) > 1}
    if dupes:
        rep.failures.append(f"duplicate marks in schedule: {sorted(dupes)}")
    bad = [r["mark"] for r in rows
           if not (50 <= (r.get("thickness_mm") or 0) <= 2000
                   and 50 <= (r.get("height_mm") or 0) <= 2000)]
    if bad:
        rep.failures.append(
            f"rows with dims outside 50–2000mm: {bad[:6]} — re-read those cells "
            "at higher magnification.")
    rep.normalized = {**draft, "rows": rows}
    rep.stats = {"rows": len(rows)}
    return rep


def validate_find_grade(draft: dict, ctx: AgenticContext) -> ValidationReport:
    rep = ValidationReport()
    snippet = draft.get("snippet")
    if draft.get("grade") and snippet:
        joined = " ".join(t["text"] for t in ctx.texts)
        if snippet not in joined:
            rep.failures.append(
                "snippet does not occur in the sheet's extracted text — quote the "
                "exact wording from the drawing.")
    rep.normalized = dict(draft)
    return rep


VALIDATORS = {
    "identify_beams": validate_identify_beams,
    "read_schedule": validate_read_schedule,
    "find_grade": validate_find_grade,
}
