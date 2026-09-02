from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from math import ceil, hypot
from typing import Any

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

from ...services.pdf.vectors import viewport_vector_segments


AXIS_TOLERANCE_PX = 0.9
MIN_VECTOR_LENGTH_PX = 18.0
SNAP_DISTANCE_PX = 20.0
SUPPORT_DISTANCE_PX = 4.5
INTERNAL_SUPPORT_MIN = 0.58
EXTERNAL_SUPPORT_MIN = 0.45
MAX_WALL_OVERLAP_RATIO = 0.012


@dataclass(frozen=True)
class AxisSegment:
    axis: str
    coordinate: float
    start: float
    end: float
    length: float


@lru_cache(maxsize=64)
def _axis_segments(viewport_id: str) -> tuple[AxisSegment, ...]:
    source = viewport_vector_segments(viewport_id, limit=100_000)
    result: list[AxisSegment] = []
    seen: set[tuple[str, int, int, int]] = set()
    for value in source.get("segments") or []:
        if value.get("dashed"):
            continue
        x0, y0 = float(value["x0"]), float(value["y0"])
        x1, y1 = float(value["x1"]), float(value["y1"])
        if abs(y1 - y0) <= AXIS_TOLERANCE_PX:
            start, end = sorted((x0, x1))
            axis, coordinate = "h", (y0 + y1) / 2
        elif abs(x1 - x0) <= AXIS_TOLERANCE_PX:
            start, end = sorted((y0, y1))
            axis, coordinate = "v", (x0 + x1) / 2
        else:
            continue
        length = end - start
        if length < MIN_VECTOR_LENGTH_PX:
            continue
        key = (axis, round(coordinate * 2), round(start * 2), round(end * 2))
        if key in seen:
            continue
        seen.add(key)
        result.append(AxisSegment(axis, coordinate, start, end, length))
    return tuple(result)


def _edge_axis(first: dict[str, float], second: dict[str, float]) -> tuple[str, float, float, float] | None:
    dx, dy = second["x"] - first["x"], second["y"] - first["y"]
    if abs(dy) <= 1.25 and abs(dx) >= 8:
        start, end = sorted((first["x"], second["x"]))
        return "h", (first["y"] + second["y"]) / 2, start, end
    if abs(dx) <= 1.25 and abs(dy) >= 8:
        start, end = sorted((first["y"], second["y"]))
        return "v", (first["x"] + second["x"]) / 2, start, end
    return None


def _merged_length(intervals: list[tuple[float, float]]) -> float:
    if not intervals:
        return 0.0
    intervals.sort()
    total = 0.0
    start, end = intervals[0]
    for next_start, next_end in intervals[1:]:
        if next_start <= end + 2:
            end = max(end, next_end)
        else:
            total += end - start
            start, end = next_start, next_end
    return total + end - start


def _support_for_edge(
    edge: tuple[str, float, float, float],
    segments: list[AxisSegment],
    tolerance: float,
) -> tuple[float, float | None]:
    axis, coordinate, start, end = edge
    length = max(1.0, end - start)
    # Never merge evidence from several parallel lines. Architectural drawings
    # commonly contain dimensions, hatches and the two faces of one wall close
    # together; combining them can make an unsupported edge look fully proven.
    groups: dict[int, tuple[float, list[tuple[float, float]]]] = {}
    for segment in segments:
        if segment.axis != axis or abs(segment.coordinate - coordinate) > tolerance:
            continue
        overlap_start, overlap_end = max(start, segment.start), min(end, segment.end)
        if overlap_end <= overlap_start:
            continue
        key = round(segment.coordinate * 2)
        group_coordinate, intervals = groups.setdefault(key, (segment.coordinate, []))
        intervals.append((overlap_start, overlap_end))
        groups[key] = (group_coordinate, intervals)
    if not groups:
        return 0.0, None
    candidates = [
        (min(length, _merged_length(intervals)) / length, abs(group_coordinate - coordinate), group_coordinate)
        for group_coordinate, intervals in groups.values()
    ]
    candidates.sort(key=lambda item: (-item[0], item[1]))
    return candidates[0][0], candidates[0][2]


def _snap_ring(points: list[dict[str, float]], segments: list[AxisSegment]) -> tuple[list[dict[str, float]], int]:
    x_proposals: list[list[float]] = [[] for _ in points]
    y_proposals: list[list[float]] = [[] for _ in points]
    snapped_edges = 0
    for index, first in enumerate(points):
        second_index = (index + 1) % len(points)
        edge = _edge_axis(first, points[second_index])
        if not edge:
            continue
        support, coordinate = _support_for_edge(edge, segments, SNAP_DISTANCE_PX)
        if coordinate is None or support < 0.38 or abs(coordinate - edge[1]) > SNAP_DISTANCE_PX:
            continue
        if edge[0] == "h":
            y_proposals[index].append(coordinate)
            y_proposals[second_index].append(coordinate)
        else:
            x_proposals[index].append(coordinate)
            x_proposals[second_index].append(coordinate)
        snapped_edges += 1
    result: list[dict[str, float]] = []
    for index, point in enumerate(points):
        x = sum(x_proposals[index]) / len(x_proposals[index]) if x_proposals[index] else point["x"]
        y = sum(y_proposals[index]) / len(y_proposals[index]) if y_proposals[index] else point["y"]
        result.append({"x": round(x), "y": round(y)})
    original = Polygon([(point["x"], point["y"]) for point in points])
    candidate = Polygon([(point["x"], point["y"]) for point in result])
    if candidate.is_empty or not candidate.is_valid or candidate.area <= 1:
        return points, 0
    # Do not allow snapping to create a materially different room. Large changes
    # need a local retrace, not silent arithmetic.
    if original.area > 1 and abs(candidate.area - original.area) / original.area > 0.12:
        return points, 0
    return result, snapped_edges


def _wall_strips(segments: list[AxisSegment]) -> list[Polygon]:
    """Find long paired vector faces and convert them into conservative wall solids."""
    long_segments = [segment for segment in segments if segment.length >= 70]
    by_axis = {
        "h": sorted((segment for segment in long_segments if segment.axis == "h"), key=lambda item: item.coordinate),
        "v": sorted((segment for segment in long_segments if segment.axis == "v"), key=lambda item: item.coordinate),
    }
    strips: list[Polygon] = []
    seen: set[tuple[str, int, int, int]] = set()
    for axis, values in by_axis.items():
        for index, first in enumerate(values):
            for second in values[index + 1:]:
                separation = second.coordinate - first.coordinate
                if separation > 26:
                    break
                if separation < 3:
                    continue
                start, end = max(first.start, second.start), min(first.end, second.end)
                overlap = end - start
                if overlap < 60 or overlap < min(first.length, second.length) * 0.55:
                    continue
                key = (axis, round((first.coordinate + second.coordinate) / 2), round(start), round(end))
                if key in seen:
                    continue
                seen.add(key)
                if axis == "h":
                    strips.append(box(start, first.coordinate, end, second.coordinate))
                else:
                    strips.append(box(first.coordinate, start, second.coordinate, end))
    return strips


@lru_cache(maxsize=64)
def _wall_union(viewport_id: str) -> Any:
    return unary_union(_wall_strips(list(_axis_segments(viewport_id))))


def audit_and_snap_floor_spaces(output: Any, viewport_id: str, *, snap: bool = True) -> list[dict[str, Any]]:
    """Snap candidate room rings to PDF vectors and grade wall conformity.

    The model supplies semantics and an approximate topology. PDF vector evidence
    supplies the final boundary coordinates. Results below the deterministic gate
    remain visible for correction but cannot be confirmed or published to BOQ.
    """
    segments = _axis_segments(viewport_id)
    wall_union = _wall_union(viewport_id)
    audits: list[dict[str, Any]] = []
    for index, space in enumerate(output.spaces):
        points = [{"x": float(point.x), "y": float(point.y)} for point in space.polygon]
        snapped, snapped_edges = _snap_ring(points, segments) if snap else (points, 0)
        data = space.model_dump(mode="python")
        data["polygon"] = snapped
        candidate = space.__class__.model_validate(data)
        polygon = Polygon(
            [(point.x, point.y) for point in candidate.polygon],
            [[(point.x, point.y) for point in ring] for ring in candidate.holes],
        )
        total_length = 0.0
        supported_length = 0.0
        unsupported_edges = 0
        for edge_index, first in enumerate(snapped):
            second = snapped[(edge_index + 1) % len(snapped)]
            length = hypot(second["x"] - first["x"], second["y"] - first["y"])
            edge = _edge_axis(first, second)
            if length < 8:
                continue
            total_length += length
            if edge:
                support, _ = _support_for_edge(edge, segments, SUPPORT_DISTANCE_PX)
                supported_length += length * support
                if support < 0.4:
                    unsupported_edges += 1
            else:
                # Curved/angled boundaries require local review unless a later
                # dedicated vector-curve matcher proves them.
                unsupported_edges += 1
        support_ratio = supported_length / total_length if total_length else 0.0
        interior = polygon.buffer(-5)
        overlap_area = interior.intersection(wall_union).area if not interior.is_empty and not wall_union.is_empty else 0.0
        overlap_ratio = overlap_area / polygon.area if polygon.area > 1 else 1.0
        minimum = EXTERNAL_SUPPORT_MIN if space.environment != "internal" else INTERNAL_SUPPORT_MIN
        reasons: list[str] = []
        if support_ratio < minimum:
            reasons.append(f"Only {support_ratio:.0%} of the boundary is supported by PDF wall vectors (minimum {minimum:.0%}).")
        # Paired-vector wall strips remain diagnostic evidence only. Furniture,
        # cabinetry and tile hatches also create close parallel vectors, so this
        # signal is not safe enough on its own to reject a measured room.
        # One short unsupported edge is normally a doorway threshold. Escalate
        # only when a meaningful portion of the ring has no wall-face evidence.
        edge_count = max(1, len(snapped))
        if unsupported_edges >= max(2, ceil(edge_count * 0.4)):
            reasons.append(f"{unsupported_edges} boundary edge(s) need local wall-face review.")
        status = "wall_verified" if not reasons else "boundary_review"
        output.spaces[index] = candidate
        audits.append({
            "index": index,
            "name": space.name or space.raw_label or space.normalized_type,
            "status": status,
            "support_ratio": round(support_ratio, 4),
            "wall_overlap_ratio": round(overlap_ratio, 5),
            "snapped_edges": snapped_edges,
            "unsupported_edges": unsupported_edges,
            "reasons": reasons,
        })
    return audits


def wall_audit_failures(audits: list[dict[str, Any]], limit: int = 20) -> list[str]:
    return [
        f"{audit['name']}: {' '.join(audit['reasons'])}"
        for audit in audits if audit.get("status") != "wall_verified"
    ][:limit]
