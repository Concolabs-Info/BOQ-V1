"""Line clustering: pair parallel dashed edge lines into beam candidates.

A drawn beam in plan is typically two parallel dashed lines (its hidden edges).
We pair them into a candidate with a centerline and an edge gap (the drawn width,
in page points) — the gap is what Method 1 compares against labeled dimensions.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

MAX_EDGE_GAP_PT = 40.0     # edges farther apart than this are not one beam
MIN_OVERLAP_FRAC = 0.6     # paired edges must overlap along their axis
ANGLE_TOL_DEG = 3.0
JOIN_GAP_PT = 6.0          # collinear fragments closer than this merge into one run


@dataclass
class Segment:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def length(self) -> float:
        return math.hypot(self.x1 - self.x0, self.y1 - self.y0)

    @property
    def angle(self) -> float:
        a = math.degrees(math.atan2(self.y1 - self.y0, self.x1 - self.x0)) % 180.0
        return a


@dataclass
class BeamCandidate:
    centerline: tuple[float, float, float, float]
    edge_gap: float          # perpendicular distance between the two edges (points)
    edges: tuple[Segment, Segment]


def _parallel(a: Segment, b: Segment) -> bool:
    d = abs(a.angle - b.angle)
    return min(d, 180.0 - d) <= ANGLE_TOL_DEG


def _axis_overlap(a: Segment, b: Segment) -> float:
    """Fractional overlap of projections onto a's axis."""
    ux, uy = a.x1 - a.x0, a.y1 - a.y0
    n = math.hypot(ux, uy)
    if n == 0:
        return 0.0
    ux, uy = ux / n, uy / n

    def proj(px, py):
        return (px - a.x0) * ux + (py - a.y0) * uy

    a0, a1 = sorted((0.0, a.length))
    b0, b1 = sorted((proj(b.x0, b.y0), proj(b.x1, b.y1)))
    inter = min(a1, b1) - max(a0, b0)
    shorter = min(a1 - a0, b1 - b0)
    return inter / shorter if shorter > 0 else 0.0


def _perp_distance(a: Segment, b: Segment) -> float:
    """Perpendicular distance from b's midpoint to a's infinite line."""
    ux, uy = a.x1 - a.x0, a.y1 - a.y0
    n = math.hypot(ux, uy)
    if n == 0:
        return math.inf
    mx, my = (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2
    return abs((mx - a.x0) * (-uy / n) + (my - a.y0) * (ux / n))


def merge_collinear(segments: list[Segment]) -> list[Segment]:
    """Merge collinear fragments (broken centerlines/edges) into continuous runs.

    Bucketed by (orientation, line offset) so it stays near-linear on real sheets
    with tens of thousands of segments."""
    buckets: dict[tuple[int, int], list[Segment]] = {}
    for s in segments:
        ang = s.angle
        rad = math.radians(ang)
        nx, ny = -math.sin(rad), math.cos(rad)
        off = (s.x0 + s.x1) / 2 * nx + (s.y0 + s.y1) / 2 * ny
        buckets.setdefault((round(ang / 2.0), round(off / 1.5)), []).append(s)

    merged: list[Segment] = []
    for (ang_k, _), group in buckets.items():
        rad = math.radians(ang_k * 2.0)
        ux, uy = math.cos(rad), math.sin(rad)

        def span(s: Segment, ux: float = ux, uy: float = uy) -> tuple[float, float]:
            ts = sorted((s.x0 * ux + s.y0 * uy, s.x1 * ux + s.y1 * uy))
            return ts[0], ts[1]

        group.sort(key=lambda s: span(s)[0])
        chain: list[Segment] = []
        chain_hi = None
        for s in group:
            lo, hi = span(s)
            if chain and lo - chain_hi > JOIN_GAP_PT:
                merged.append(_chain_span(chain, ux, uy))
                chain = []
                chain_hi = None
            chain.append(s)
            chain_hi = hi if chain_hi is None or hi > chain_hi else chain_hi
        if chain:
            merged.append(_chain_span(chain, ux, uy))
    return merged


def _chain_span(chain: list[Segment], ux: float, uy: float) -> Segment:
    if len(chain) == 1:
        return chain[0]
    pts = [(s.x0, s.y0) for s in chain] + [(s.x1, s.y1) for s in chain]
    ts = [p[0] * ux + p[1] * uy for p in pts]
    lo, hi = pts[ts.index(min(ts))], pts[ts.index(max(ts))]
    return Segment(lo[0], lo[1], hi[0], hi[1])


def pair_edges(dashed: list[Segment]) -> tuple[list[BeamCandidate], list[Segment]]:
    """Pair parallel dashed edges into beam candidates.

    Returns (candidates, unpaired) — unpaired dashed lines are uncertain and get
    surfaced as questions rather than dropped.
    """
    # only runs long enough to be beam edges take part in pairing — keeps the
    # O(m^2) pairing tractable on real sheets with thousands of merged fragments
    segs = [s for s in merge_collinear(dashed) if s.length >= 25.0]
    used = [False] * len(segs)
    candidates: list[BeamCandidate] = []
    for i, a in enumerate(segs):
        if used[i]:
            continue
        best_j, best_gap = None, math.inf
        for j, b in enumerate(segs):
            if j == i or used[j] or not _parallel(a, b):
                continue
            if _axis_overlap(a, b) < MIN_OVERLAP_FRAC:
                continue
            gap = _perp_distance(a, b)
            if 1.0 < gap <= MAX_EDGE_GAP_PT and gap < best_gap:
                best_j, best_gap = j, gap
        if best_j is None:
            continue
        b = segs[best_j]
        used[i] = used[best_j] = True
        cx0, cy0 = (a.x0 + _closest_end(b, a.x0, a.y0)[0]) / 2, (a.y0 + _closest_end(b, a.x0, a.y0)[1]) / 2
        cx1, cy1 = (a.x1 + _closest_end(b, a.x1, a.y1)[0]) / 2, (a.y1 + _closest_end(b, a.x1, a.y1)[1]) / 2
        candidates.append(BeamCandidate((cx0, cy0, cx1, cy1), best_gap, (a, b)))
    unpaired = [s for k, s in enumerate(segs) if not used[k]]
    return candidates, unpaired


def reconstruct_dashed_runs(segments: list[Segment], max_seg_len: float = 9.0,
                            max_gap: float = 9.0, min_run_len: float = 40.0,
                            offset_tol: float = 1.2) -> list[Segment]:
    """Rebuild dashed lines that CAD plotters exploded into short SOLID strokes.

    Groups short segments by orientation + line offset, chains them along their
    axis while gaps stay small, and emits each chain long enough to be a real
    dashed run as one continuous Segment."""
    import math as _m

    strokes = [s for s in segments if s.length <= max_seg_len]
    buckets: dict[tuple[int, int], list[Segment]] = {}
    for s in strokes:
        ang = s.angle
        # normal-form offset of the segment's line from origin
        rad = _m.radians(ang)
        nx, ny = -_m.sin(rad), _m.cos(rad)
        off = (s.x0 + s.x1) / 2 * nx + (s.y0 + s.y1) / 2 * ny
        key = (round(ang / 2.0), round(off / offset_tol))
        buckets.setdefault(key, []).append(s)

    runs: list[Segment] = []
    for (ang_k, _), group in buckets.items():
        rad = _m.radians(ang_k * 2.0)
        ux, uy = _m.cos(rad), _m.sin(rad)

        def t_of(s: Segment, ux: float = ux, uy: float = uy) -> tuple[float, float]:
            ts = sorted(((s.x0 * ux + s.y0 * uy), (s.x1 * ux + s.y1 * uy)))
            return ts[0], ts[1]

        group.sort(key=lambda s: t_of(s)[0])
        chain: list[Segment] = []
        chain_end = None
        for s in group:
            t0, t1 = t_of(s)
            if chain and t0 - chain_end > max_gap:
                runs.extend(_emit_run(chain, min_run_len))
                chain = []
            chain.append(s)
            chain_end = t1 if chain_end is None or t1 > chain_end else chain_end
        runs.extend(_emit_run(chain, min_run_len))
    return runs


def _emit_run(chain: list[Segment], min_run_len: float) -> list[Segment]:
    if len(chain) < 3:
        return []
    pts = [(s.x0, s.y0) for s in chain] + [(s.x1, s.y1) for s in chain]
    first = chain[0]
    ux, uy = first.x1 - first.x0, first.y1 - first.y0
    n = math.hypot(ux, uy)
    if n == 0:
        return []
    ux, uy = ux / n, uy / n
    ts = [(p[0] * ux + p[1] * uy) for p in pts]
    lo, hi = pts[ts.index(min(ts))], pts[ts.index(max(ts))]
    run = Segment(lo[0], lo[1], hi[0], hi[1])
    return [run] if run.length >= min_run_len else []


def _closest_end(seg: Segment, x: float, y: float) -> tuple[float, float]:
    d0 = math.hypot(seg.x0 - x, seg.y0 - y)
    d1 = math.hypot(seg.x1 - x, seg.y1 - y)
    return (seg.x0, seg.y0) if d0 <= d1 else (seg.x1, seg.y1)
