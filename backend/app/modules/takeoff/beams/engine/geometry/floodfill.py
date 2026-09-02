"""S3 — flood-fill validation. Beams are closed outlines; rasterize the candidate's
edges into a small grid, flood fill from the centerline midpoint, and if the fill
escapes the candidate's own bounding envelope the outline leaks (broken/missed
segment) — surfaced as a question with the leak location."""
from __future__ import annotations

from collections import deque

import numpy as np

from geometry.lines import BeamCandidate, Segment

CELLS_PER_PT = 2.0
MARGIN_PT = 6.0


def _draw(grid: np.ndarray, seg: Segment, ox: float, oy: float) -> None:
    n = max(2, int(seg.length * CELLS_PER_PT * 2))
    xs = np.linspace(seg.x0, seg.x1, n)
    ys = np.linspace(seg.y0, seg.y1, n)
    for x, y in zip(xs, ys):
        cx, cy = int((x - ox) * CELLS_PER_PT), int((y - oy) * CELLS_PER_PT)
        if 0 <= cy < grid.shape[0] and 0 <= cx < grid.shape[1]:
            grid[cy, cx] = 1
            # thicken 1 cell to close diagonal pinholes from rasterization
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = cy + dy, cx + dx
                    if 0 <= yy < grid.shape[0] and 0 <= xx < grid.shape[1]:
                        grid[yy, xx] = max(grid[yy, xx], 1)


def validate_closed(candidate: BeamCandidate,
                    closing_segments: list[Segment] | None = None) -> dict:
    """Flood fill inside the candidate region. closing_segments are the end caps
    (e.g. supporting beam/column edges) that bound the beam run.

    Returns {closed: bool, leak_point: (x, y) | None} in page coordinates.
    """
    e0, e1 = candidate.edges
    all_segs = [e0, e1] + list(closing_segments or [])
    xs = [s.x0 for s in all_segs] + [s.x1 for s in all_segs]
    ys = [s.y0 for s in all_segs] + [s.y1 for s in all_segs]
    ox, oy = min(xs) - MARGIN_PT, min(ys) - MARGIN_PT
    w = int((max(xs) - ox + MARGIN_PT) * CELLS_PER_PT) + 2
    h = int((max(ys) - oy + MARGIN_PT) * CELLS_PER_PT) + 2
    grid = np.zeros((h, w), dtype=np.uint8)
    for s in all_segs:
        _draw(grid, s, ox, oy)

    cx0, cy0, cx1, cy1 = candidate.centerline
    sx = int(((cx0 + cx1) / 2 - ox) * CELLS_PER_PT)
    sy = int(((cy0 + cy1) / 2 - oy) * CELLS_PER_PT)
    if not (0 <= sy < h and 0 <= sx < w) or grid[sy, sx] == 1:
        return {"closed": False, "leak_point": None}

    # BFS flood fill; touching the grid border == leak (grid border sits MARGIN_PT
    # outside the candidate envelope, so a closed outline never reaches it).
    seen = np.zeros_like(grid, dtype=bool)
    dq = deque([(sy, sx)])
    seen[sy, sx] = True
    while dq:
        y, x = dq.popleft()
        if y in (0, h - 1) or x in (0, w - 1):
            return {"closed": False,
                    "leak_point": (x / CELLS_PER_PT + ox, y / CELLS_PER_PT + oy)}
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            yy, xx = y + dy, x + dx
            if 0 <= yy < h and 0 <= xx < w and not seen[yy, xx] and grid[yy, xx] == 0:
                seen[yy, xx] = True
                dq.append((yy, xx))
    return {"closed": True, "leak_point": None}
