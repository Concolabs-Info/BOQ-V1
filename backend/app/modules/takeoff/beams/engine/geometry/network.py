"""Deterministic beam-network junction engine.

The centerline network as drawn is full of crossings; physically each junction
volume belongs to exactly ONE beam (design doc image-7). This module makes that
true geometrically:

  1. dedupe_beams        — merge duplicate detections of the same physical beam
  2. find_nodes          — all pairwise intersections, clustered into junction
                           NODES (a 3-beam meet is one node, not three crossings)
  3. resolve_nodes       — ordered rule engine assigns one owner per node
  4. break_apart         — non-owner centerlines retract to the owner's face;
                           the owner passes through unchanged
  5. verify_disjoint     — invariant: after breaking, no two beams' segments
                           cross any more (touching at faces is allowed)

Everything is pure geometry + data; no model calls, fully reproducible.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

NODE_TOL_PT = 4.0        # intersection points closer than this = one node
END_TOL_PT = 4.0         # node within this of a centerline end = beam terminates
ANGLE_TOL_DEG = 6.0
THICK_TOL_MM = 1.0


@dataclass
class NetBeam:
    beam_id: str
    x0: float
    y0: float
    x1: float
    y1: float
    thickness_mm: float | None = None
    height_mm: float | None = None

    @property
    def length(self) -> float:
        return math.hypot(self.x1 - self.x0, self.y1 - self.y0)

    @property
    def angle(self) -> float:
        return math.degrees(math.atan2(self.y1 - self.y0, self.x1 - self.x0)) % 180.0

    def point_at(self, t: float) -> tuple[float, float]:
        return (self.x0 + t * (self.x1 - self.x0), self.y0 + t * (self.y1 - self.y0))

    def param_of(self, x: float, y: float) -> float:
        dx, dy = self.x1 - self.x0, self.y1 - self.y0
        n2 = dx * dx + dy * dy
        return ((x - self.x0) * dx + (y - self.y0) * dy) / n2 if n2 else 0.0


@dataclass
class Node:
    x: float
    y: float
    incident: dict[str, str] = field(default_factory=dict)  # beam_id -> 'through'|'end'

    @property
    def beam_ids(self) -> list[str]:
        return sorted(self.incident)


@dataclass
class NodeResolution:
    node: Node
    owner: str | None
    rule: str


# ----------------------------------------------------------------- 1. dedupe
def dedupe_beams(beams: list[NetBeam], offset_tol_pt: float = 8.0,
                 overlap_frac: float = 0.5) -> tuple[list[NetBeam], list[tuple[str, str]]]:
    """Merge near-colinear, overlapping beams (duplicate detections of one member).
    Keeps the longer beam of each duplicate pair. Returns (kept, [(kept_id, dropped_id)])."""
    order = sorted(beams, key=lambda b: -b.length)
    kept: list[NetBeam] = []
    dropped: list[tuple[str, str]] = []
    for b in order:
        dup_of = None
        for k in kept:
            d = abs(b.angle - k.angle)
            if min(d, 180.0 - d) > ANGLE_TOL_DEG:
                continue
            # perpendicular offset of b's midpoint from k's line
            mx, my = b.point_at(0.5)
            t = k.param_of(mx, my)
            px, py = k.point_at(t)
            if math.hypot(mx - px, my - py) > offset_tol_pt:
                continue
            # overlap along k's axis
            ts = sorted((k.param_of(b.x0, b.y0), k.param_of(b.x1, b.y1)))
            inter = min(1.0, ts[1]) - max(0.0, ts[0])
            if inter * k.length >= overlap_frac * b.length:
                dup_of = k
                break
        if dup_of is None:
            kept.append(b)
        else:
            dropped.append((dup_of.beam_id, b.beam_id))
    return kept, dropped


# ------------------------------------------------------------------ 2. nodes
def _intersection(a: NetBeam, b: NetBeam) -> tuple[float, float] | None:
    x1, y1, x2, y2 = a.x0, a.y0, a.x1, a.y1
    x3, y3, x4, y4 = b.x0, b.y0, b.x1, b.y1
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-9:
        return None
    t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
    u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den
    # allow slight extension so near-touch T junctions register
    slack_a = END_TOL_PT / max(a.length, 1e-6)
    slack_b = END_TOL_PT / max(b.length, 1e-6)
    if -slack_a <= t <= 1 + slack_a and -slack_b <= u <= 1 + slack_b:
        tc = min(max(t, 0.0), 1.0)
        return a.point_at(tc)
    return None


def find_nodes(beams: list[NetBeam]) -> list[Node]:
    pts: list[tuple[float, float, str, str]] = []
    for i in range(len(beams)):
        for j in range(i + 1, len(beams)):
            p = _intersection(beams[i], beams[j])
            if p:
                pts.append((p[0], p[1], beams[i].beam_id, beams[j].beam_id))

    by_id = {b.beam_id: b for b in beams}
    nodes: list[Node] = []
    for x, y, a_id, b_id in pts:
        node = None
        for n in nodes:
            if math.hypot(n.x - x, n.y - y) <= NODE_TOL_PT:
                node = n
                break
        if node is None:
            node = Node(x, y)
            nodes.append(node)
        for bid in (a_id, b_id):
            b = by_id[bid]
            d0 = math.hypot(node.x - b.x0, node.y - b.y0)
            d1 = math.hypot(node.x - b.x1, node.y - b.y1)
            node.incident[bid] = "end" if min(d0, d1) <= END_TOL_PT else "through"
    return nodes


# ---------------------------------------------------- 2b. collinear chain join
def join_collinear_chains(beams: list[NetBeam],
                          max_iter: int = 6) -> tuple[list[NetBeam], list[tuple[str, str]]]:
    """Two detections meeting end-to-end, collinear, same thickness = one
    continuous member. Join them so continuity rules see the real beam."""
    merges: list[tuple[str, str]] = []
    beams = list(beams)
    for _ in range(max_iter):
        nodes = find_nodes(beams)
        by_id = {b.beam_id: b for b in beams}
        did = False
        for n in nodes:
            ends = [b for b in n.beam_ids if n.incident[b] == "end"]
            pair = None
            for i in range(len(ends)):
                for j in range(i + 1, len(ends)):
                    a, b = by_id[ends[i]], by_id[ends[j]]
                    d = abs(a.angle - b.angle)
                    if min(d, 180.0 - d) > ANGLE_TOL_DEG:
                        continue
                    ta, tb = a.thickness_mm, b.thickness_mm
                    if ta is not None and tb is not None and abs(ta - tb) > THICK_TOL_MM:
                        continue
                    pair = (a, b)
                    break
                if pair:
                    break
            if pair is None:
                continue
            a, b = pair
            a_id, b_id = a.beam_id, b.beam_id
            ta, tb = a.thickness_mm, b.thickness_mm
            # merge b into a: keep the two endpoints farthest apart along a's axis
            pts = [(a.x0, a.y0), (a.x1, a.y1), (b.x0, b.y0), (b.x1, b.y1)]
            ts = [a.param_of(px, py) for px, py in pts]
            lo, hi = pts[ts.index(min(ts))], pts[ts.index(max(ts))]
            merged = NetBeam(a.beam_id, lo[0], lo[1], hi[0], hi[1],
                             ta if ta is not None else tb,
                             a.height_mm if a.height_mm is not None else b.height_mm)
            beams = [x for x in beams if x.beam_id not in (a_id, b_id)] + [merged]
            merges.append((a_id, b_id))
            did = True
            break
        if not did:
            break
    return beams, merges


# ----------------------------------------------------- 2c. drawn edge recovery
def find_edge_offsets(beam: NetBeam, runs: list, expected_t_pt: float,
                      overlap_frac: float = 0.3) -> tuple[float, float] | None:
    """Locate the beam's two drawn parallel edge lines among the vector runs.
    Returns signed perpendicular offsets (negative side, positive side) from the
    centerline, or None when both edges are not found."""
    dx, dy = beam.x1 - beam.x0, beam.y1 - beam.y0
    ln = math.hypot(dx, dy)
    if ln < 1e-6 or expected_t_pt <= 0:
        return None
    ux, uy = dx / ln, dy / ln
    nx, ny = -uy, ux
    best = {"neg": None, "pos": None}
    for r in runs:
        d = abs(beam.angle - r.angle)
        if min(d, 180.0 - d) > ANGLE_TOL_DEG:
            continue
        mx, my = (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2
        off = (mx - beam.x0) * nx + (my - beam.y0) * ny
        if not (0.25 * expected_t_pt <= abs(off) <= 0.85 * expected_t_pt):
            continue
        t0 = ((r.x0 - beam.x0) * ux + (r.y0 - beam.y0) * uy) / ln
        t1 = ((r.x1 - beam.x0) * ux + (r.y1 - beam.y0) * uy) / ln
        lo, hi = min(t0, t1), max(t0, t1)
        if min(1.0, hi) - max(0.0, lo) < overlap_frac:
            continue
        side = "neg" if off < 0 else "pos"
        score = abs(abs(off) - expected_t_pt / 2)
        if best[side] is None or score < best[side][1]:
            best[side] = (off, score)
    if best["neg"] and best["pos"]:
        return (best["neg"][0], best["pos"][0])
    return None


# ------------------------------------------------------------- 3. rule engine
# A rule takes (node, beams_by_id) and returns (owner_id, rule_name) or None.
def rule_continuous_through(node: Node, by_id: dict[str, NetBeam]):
    """A continuous member (runs through the node) owns against members that
    terminate on it — the terminating beams frame into it, whatever their size."""
    through = [b for b in node.beam_ids if node.incident[b] == "through"]
    ends = [b for b in node.beam_ids if node.incident[b] == "end"]
    if len(through) == 1 and ends:
        return through[0], "continuous_through"
    return None


def rule_same_thickness(node: Node, by_id: dict[str, NetBeam]):
    ts = [by_id[b].thickness_mm for b in node.beam_ids]
    if any(t is None for t in ts):
        return None
    if max(ts) - min(ts) > THICK_TOL_MM:
        return None
    through = [b for b in node.beam_ids if node.incident[b] == "through"]
    if len(through) == 1:
        return through[0], "same_thickness"
    if len(through) > 1:
        # equal-thickness cross: either carries through; deterministic longest span
        return max(through, key=lambda b: by_id[b].length), "same_thickness"
    return None  # corner of equals — geometry silent


def rule_thicker_owns(node: Node, by_id: dict[str, NetBeam]):
    ts = {b: by_id[b].thickness_mm for b in node.beam_ids}
    if any(t is None for t in ts.values()):
        return None
    thickest = max(ts, key=lambda b: ts[b])
    others = [t for b, t in ts.items() if b != thickest]
    if ts[thickest] - max(others) > THICK_TOL_MM:
        return thicker_result(thickest)
    return None


def thicker_result(beam_id: str):
    return beam_id, "thicker_owns"


def rule_longest_carries(node: Node, by_id: dict[str, NetBeam]):
    """Optional assumption rule (user opt-in): the longer beam owns."""
    return max(node.beam_ids, key=lambda b: by_id[b].length), "longest_carries"


# NOTE: rule_continuous_through and join_collinear_chains exist as opt-in tools;
# they are NOT in the defaults — trialled on the Mattegoda package they merged
# genuinely distinct detections and dropped good lines (reverted by user decision).
DEFAULT_RULES = [rule_same_thickness, rule_thicker_owns]


def resolve_nodes(nodes: list[Node], by_id: dict[str, NetBeam],
                  rules=None) -> list[NodeResolution]:
    rules = DEFAULT_RULES if rules is None else rules
    out = []
    for n in nodes:
        res = None
        for rule in rules:
            r = rule(n, by_id)
            if r:
                res = NodeResolution(n, r[0], r[1])
                break
        out.append(res or NodeResolution(n, None, "unresolved"))
    return out


# ------------------------------------------------------------ 4. break apart
def _param_on_line(b: NetBeam, px: float, py: float, dx: float, dy: float) -> float | None:
    """Param t on beam b where its infinite line crosses the infinite line through
    (px,py) with direction (dx,dy)."""
    den = (b.x1 - b.x0) * dy - (b.y1 - b.y0) * dx
    if abs(den) < 1e-9:
        return None
    return ((px - b.x0) * dy - (py - b.y0) * dx) / den


def break_apart(beams: list[NetBeam], resolutions: list[NodeResolution],
                mm_per_pt: float,
                edge_offsets: dict[str, tuple[float, float]] | None = None) -> dict[str, dict]:
    """Split every beam at its nodes; non-owner segments stop exactly on the
    owner's drawn edge line (when its two parallel edges were recovered —
    `edge_offsets[owner] = (neg, pos)` signed perpendicular offsets), falling
    back to centerline ± half-thickness with skew correction otherwise. Each
    junction volume is counted once, in the owner.

    Returns {beam_id: {"segments": [(x0,y0,x1,y1)...], "net_m": float,
                       "deductions": [{"node": (x,y), "owner": id, "metres": m}]}}
    """
    edge_offsets = edge_offsets or {}
    by_id = {b.beam_id: b for b in beams}
    cuts: dict[str, list[tuple[float, NodeResolution]]] = {b.beam_id: [] for b in beams}
    for res in resolutions:
        for bid in res.node.beam_ids:
            b = by_id[bid]
            t = min(max(b.param_of(res.node.x, res.node.y), 0.0), 1.0)
            cuts[bid].append((t, res))

    out: dict[str, dict] = {}
    for b in beams:
        events = sorted(cuts[b.beam_id], key=lambda e: e[0])
        intervals: list[list[float]] = []
        bounds = [0.0] + [e[0] for e in events] + [1.0]
        for k in range(len(bounds) - 1):
            intervals.append([bounds[k], bounds[k + 1]])
        deductions = []
        for t, res in events:
            if res.owner == b.beam_id or res.owner is None:
                continue  # owner passes through; unresolved deducts nothing (flagged)
            o = by_id[res.owner]
            t_pt = (o.thickness_mm or 0.0) / mm_per_pt
            # default (reverted) behavior: plain half-thickness retreat per side.
            # Only explicit recovered edge offsets may move the stop point, and
            # even then the cut is capped just past the widest edge — the
            # edge-line intersection of near-parallel members otherwise lands
            # metres away and swallows the beam.
            dt_cap = (t_pt / 2.0) / max(b.length, 1e-6)
            lo_p = hi_p = None
            offs = edge_offsets.get(res.owner)
            if offs:
                odx, ody = o.x1 - o.x0, o.y1 - o.y0
                oln = math.hypot(odx, ody)
                if oln > 1e-6:
                    nx, ny = -ody / oln, odx / oln
                    cands = []
                    for off in offs:
                        p = _param_on_line(b, o.x0 + nx * off, o.y0 + ny * off, odx, ody)
                        if p is not None:
                            cands.append(p)
                    lo_c = [p for p in cands if p < t]
                    hi_c = [p for p in cands if p > t]
                    lo_p = max(lo_c) if lo_c else None
                    hi_p = min(hi_c) if hi_c else None
                    dt_cap = (max(abs(off) for off in offs) + 2.0) / max(b.length, 1e-6)
            lo_p = t - dt_cap if lo_p is None else max(lo_p, t - dt_cap)
            hi_p = t + dt_cap if hi_p is None else min(hi_p, t + dt_cap)
            cut_pt = 0.0
            for iv in intervals:
                if abs(iv[1] - t) < 1e-9:   # segment arriving at the node
                    new_end = max(iv[0], min(lo_p, t))
                    cut_pt += (iv[1] - new_end) * b.length
                    iv[1] = new_end
                if abs(iv[0] - t) < 1e-9:   # segment leaving the node
                    new_start = min(iv[1], max(hi_p, t))
                    cut_pt += (new_start - iv[0]) * b.length
                    iv[0] = new_start
            if cut_pt > 1e-9:
                deductions.append({"node": (res.node.x, res.node.y), "owner": res.owner,
                                   "metres": round(cut_pt * mm_per_pt / 1000.0, 4)})
        segments = []
        net_pt = 0.0
        for iv in intervals:
            if iv[1] - iv[0] <= 1e-9:
                continue
            p0, p1 = b.point_at(iv[0]), b.point_at(iv[1])
            segments.append((p0[0], p0[1], p1[0], p1[1]))
            net_pt += math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        out[b.beam_id] = {
            "segments": segments,
            "net_m": round(net_pt * mm_per_pt / 1000.0, 4),
            "deductions": deductions,
        }
    return out


# ------------------------------------------------------------ one-call driver
def build_page_network(nets: list[NetBeam], runs: list, mm_per_pt: float,
                       rules=None) -> dict:
    """Per-sheet pipeline: dedupe → nodes → rules → break apart.
    (Chain-joining and drawn-edge recovery are deliberately NOT applied — see
    note at DEFAULT_RULES; `runs` is accepted for future edge recovery.)"""
    nets, dropped = dedupe_beams(nets)
    by_id = {n.beam_id: n for n in nets}
    nodes = find_nodes(nets)
    resolutions = resolve_nodes(nodes, by_id, rules)
    broken = break_apart(nets, resolutions, mm_per_pt)
    return {"nets": nets, "by_id": by_id, "dropped": dropped, "merges": [],
            "edge_offsets": {}, "nodes": nodes,
            "resolutions": resolutions, "broken": broken,
            "violations": verify_disjoint(broken)}


# ------------------------------------------------------- 5. invariant check
def verify_disjoint(broken: dict[str, dict], touch_tol_pt: float = 1.0) -> list[dict]:
    """After break_apart, no two beams' segments may properly cross. Touching at
    endpoints/faces is fine. Returns violations (empty list = network is clean)."""
    flat = [(bid, s) for bid, d in broken.items() for s in d["segments"]]
    bad = []
    for i in range(len(flat)):
        for j in range(i + 1, len(flat)):
            (ida, a), (idb, b) = flat[i], flat[j]
            if ida == idb:
                continue
            na = NetBeam("a", *a)
            nb = NetBeam("b", *b)
            x1, y1, x2, y2 = a
            x3, y3, x4, y4 = b
            den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
            if abs(den) < 1e-9:
                continue
            t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
            u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den
            # proper interior crossing = both params comfortably inside
            ta = touch_tol_pt / max(na.length, 1e-6)
            tb = touch_tol_pt / max(nb.length, 1e-6)
            if ta < t < 1 - ta and tb < u < 1 - tb:
                px, py = na.point_at(t)
                bad.append({"a": ida, "b": idb, "x": px, "y": py})
    return bad
