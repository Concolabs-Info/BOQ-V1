"""S5 — junction detection and intersection ownership (design doc image-7 rules).

Each intersection belongs to exactly one beam:
  1. same thickness      -> the continuous (through) beam owns; the terminating one stops.
  2. two thicknesses     -> thicker owns.
  3. three+ thicknesses  -> owner is the beam whose thickness matches the junction
                            geometry; here we can only check drawn edge gaps — if no
                            match, escalate (section / user), never guess.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

END_TOL_PT = 3.0     # closer than this to a segment end = the beam terminates there
THICK_TOL_MM = 1.0


@dataclass
class BeamGeom:
    beam_id: str
    x0: float
    y0: float
    x1: float
    y1: float
    thickness_mm: float | None
    height_mm: float | None
    edge_gap_pt: float | None = None


@dataclass
class Junction:
    a: str
    b: str
    x: float
    y: float
    a_through: bool     # junction sits mid-span of a (not at an end)
    b_through: bool


@dataclass
class Ownership:
    junction: Junction
    owner: str | None
    rule: str           # same_thickness | thicker_owns | geometry_match | unresolved


def _seg_intersection(p: BeamGeom, q: BeamGeom) -> tuple[float, float] | None:
    x1, y1, x2, y2 = p.x0, p.y0, p.x1, p.y1
    x3, y3, x4, y4 = q.x0, q.y0, q.x1, q.y1
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-9:
        return None
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den
    tol = 1e-6
    if -tol <= t <= 1 + tol and -tol <= u <= 1 + tol:
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    return None


def _is_through(g: BeamGeom, x: float, y: float) -> bool:
    d_start = math.hypot(x - g.x0, y - g.y0)
    d_end = math.hypot(x - g.x1, y - g.y1)
    return d_start > END_TOL_PT and d_end > END_TOL_PT


def find_junctions(beams: list[BeamGeom]) -> list[Junction]:
    out: list[Junction] = []
    for i in range(len(beams)):
        for j in range(i + 1, len(beams)):
            pt = _seg_intersection(beams[i], beams[j])
            if pt is None:
                continue
            x, y = pt
            out.append(Junction(
                beams[i].beam_id, beams[j].beam_id, x, y,
                _is_through(beams[i], x, y), _is_through(beams[j], x, y),
            ))
    return out


def resolve_ownership(j: Junction, by_id: dict[str, BeamGeom]) -> Ownership:
    a, b = by_id[j.a], by_id[j.b]
    ta, tb = a.thickness_mm, b.thickness_mm
    if ta is None or tb is None:
        return Ownership(j, None, "unresolved")

    if abs(ta - tb) <= THICK_TOL_MM:
        # Rule 1: continuous beam passes through; intersecting beam terminates at it.
        if j.a_through and not j.b_through:
            return Ownership(j, j.a, "same_thickness")
        if j.b_through and not j.a_through:
            return Ownership(j, j.b, "same_thickness")
        if j.a_through and j.b_through:
            # Cross of equal thickness: either can carry through; pick deterministic
            # owner (longer span) — still rule 1, volume counted once either way.
            la = math.hypot(a.x1 - a.x0, a.y1 - a.y0)
            lb = math.hypot(b.x1 - b.x0, b.y1 - b.y0)
            return Ownership(j, j.a if la >= lb else j.b, "same_thickness")
        return Ownership(j, None, "unresolved")  # L-junction, equal: geometry silent

    # Rule 2: thicker owns.
    return Ownership(j, j.a if ta > tb else j.b, "thicker_owns")


def resolve_three_way(junctions: list[Ownership], by_id: dict[str, BeamGeom],
                      cluster_tol_pt: float = 2.0) -> list[Ownership]:
    """Rule 3 — where 3+ beams meet at (near) one point with 3 distinct thicknesses,
    the owner is the beam whose drawn edge gap matches the junction region's geometry.
    We compare each beam's edge_gap (converted implicitly by identical scale) and pick
    the beam whose thickness matches the widest drawn gap at the node; ambiguous -> unresolved."""
    # cluster junction points
    clusters: list[list[Ownership]] = []
    for o in junctions:
        for c in clusters:
            if math.hypot(c[0].junction.x - o.junction.x, c[0].junction.y - o.junction.y) <= cluster_tol_pt:
                c.append(o)
                break
        else:
            clusters.append([o])

    out: list[Ownership] = []
    for c in clusters:
        ids = {o.junction.a for o in c} | {o.junction.b for o in c}
        thicks = {by_id[i].thickness_mm for i in ids if by_id[i].thickness_mm is not None}
        if len(ids) >= 3 and len(thicks) >= 3:
            gaps = {i: by_id[i].edge_gap_pt for i in ids if by_id[i].edge_gap_pt}
            owner = None
            if gaps:
                widest = max(gaps, key=lambda i: gaps[i])
                thickest = max(ids, key=lambda i: by_id[i].thickness_mm or 0)
                if widest == thickest:
                    owner = widest
            for o in c:
                out.append(Ownership(o.junction, owner, "geometry_match" if owner else "unresolved"))
        else:
            out.extend(c)
    return out
