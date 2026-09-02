from __future__ import annotations

from collections.abc import Iterable
from math import hypot

import pymupdf

from ...database.connection import fetch_one
from ..storage.paths import resolve_key
from .geometry import apply_affine, invert_affine
from .media import ensure_viewport_crop


def clip_segment(
    p0: tuple[float, float],
    p1: tuple[float, float],
    box: tuple[float, float, float, float],
) -> tuple[tuple[float, float], tuple[float, float]] | None:
    """Clip a segment to an axis-aligned box using Liang-Barsky."""
    x0, y0 = p0
    x1, y1 = p1
    left, top, right, bottom = box
    dx, dy = x1 - x0, y1 - y0
    start, end = 0.0, 1.0
    for p, q in ((-dx, x0 - left), (dx, right - x0), (-dy, y0 - top), (dy, bottom - y0)):
        if abs(p) < 1e-12:
            if q < 0:
                return None
            continue
        ratio = q / p
        if p < 0:
            if ratio > end:
                return None
            start = max(start, ratio)
        else:
            if ratio < start:
                return None
            end = min(end, ratio)
    return ((x0 + start * dx, y0 + start * dy), (x0 + end * dx, y0 + end * dy))


def _point(value: object) -> tuple[float, float] | None:
    if hasattr(value, "x") and hasattr(value, "y"):
        return float(value.x), float(value.y)
    if isinstance(value, (tuple, list)) and len(value) >= 2:
        return float(value[0]), float(value[1])
    return None


def _rect_segments(rect: object) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    if not all(hasattr(rect, name) for name in ("x0", "y0", "x1", "y1")):
        return []
    x0, y0, x1, y1 = float(rect.x0), float(rect.y0), float(rect.x1), float(rect.y1)
    points = ((x0, y0), (x1, y0), (x1, y1), (x0, y1))
    return [(points[index], points[(index + 1) % 4]) for index in range(4)]


def drawing_segments(items: Iterable[object]) -> list[tuple[tuple[float, float], tuple[float, float]]]:
    """Convert PyMuPDF drawing primitives into deterministic straight snap segments."""
    result: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for item in items:
        if not item:
            continue
        kind = item[0]
        if kind == "l" and len(item) >= 3:
            first, second = _point(item[1]), _point(item[2])
            if first and second:
                result.append((first, second))
        elif kind == "re" and len(item) >= 2:
            result.extend(_rect_segments(item[1]))
        elif kind == "qu" and len(item) >= 2:
            quad = item[1]
            points = [_point(getattr(quad, name, None)) for name in ("ul", "ur", "lr", "ll")]
            if all(points):
                clean = [point for point in points if point is not None]
                result.extend((clean[index], clean[(index + 1) % 4]) for index in range(4))
    return result


def viewport_vector_segments(viewport_id: str, limit: int = 30000) -> dict:
    """Return PDF vector paths in the exact pixel coordinates of the viewport crop."""
    _, ctx = ensure_viewport_crop(viewport_id)
    document = pymupdf.open(resolve_key(ctx["document_storage_key"]))
    try:
        page = document[int(ctx["page_number"]) - 1]
        image_from_page = invert_affine(ctx["page_from_image"])
        crop_x0, crop_y0, crop_x1, crop_y1 = (float(value) for value in ctx["crop_px"])
        crop_box = (crop_x0, crop_y0, crop_x1, crop_y1)
        result: list[dict] = []
        seen: set[tuple[int, int, int, int]] = set()
        truncated = False
        for path_index, drawing in enumerate(page.get_drawings()):
            layer = str(drawing.get("layer") or "")
            dashed = bool(str(drawing.get("dashes") or "").strip(" []0"))
            width = float(drawing.get("width") or 0)
            for first_page, second_page in drawing_segments(drawing.get("items", [])):
                first_image = apply_affine(image_from_page, *first_page)
                second_image = apply_affine(image_from_page, *second_page)
                clipped = clip_segment(first_image, second_image, crop_box)
                if not clipped:
                    continue
                (x0, y0), (x1, y1) = clipped
                x0, y0, x1, y1 = x0 - crop_x0, y0 - crop_y0, x1 - crop_x0, y1 - crop_y0
                if hypot(x1 - x0, y1 - y0) < 1.5:
                    continue
                key = (round(x0 * 4), round(y0 * 4), round(x1 * 4), round(y1 * 4))
                reverse = (key[2], key[3], key[0], key[1])
                if key in seen or reverse in seen:
                    continue
                seen.add(key)
                result.append({
                    "id": f"pdf-{path_index}-{len(result)}",
                    "x0": round(x0, 3), "y0": round(y0, 3),
                    "x1": round(x1, 3), "y1": round(y1, 3),
                    "layer": layer, "dashed": dashed, "width_pt": width,
                })
                if len(result) >= limit:
                    truncated = True
                    break
            if truncated:
                break
        return {
            "viewport_id": viewport_id,
            "width": int(ctx["crop_width_px"]),
            "height": int(ctx["crop_height_px"]),
            "vector_available": bool(result),
            "truncated": truncated,
            "segments": result,
        }
    finally:
        document.close()


def project_page_vector_segments(
    project_id: str,
    page_number: int,
    width: int,
    height: int,
    limit: int = 30000,
) -> dict:
    """Return a project PDF page's paths in the displayed raster-image coordinates."""
    if page_number < 1 or width < 1 or height < 1 or width > 12000 or height > 12000:
        raise ValueError("Invalid page number or target dimensions")
    row = fetch_one(
        """SELECT d.storage_key,p.page_number
           FROM page p JOIN document d ON d.id=p.document_id
           WHERE d.project_id=%s AND d.status='ready' AND p.page_number=%s
           ORDER BY d.created_at DESC LIMIT 1""",
        (project_id, page_number),
    )
    if not row:
        raise ValueError("Project PDF page not found")
    document = pymupdf.open(resolve_key(row["storage_key"]))
    try:
        page = document[int(row["page_number"]) - 1]
        page_width, page_height = float(page.rect.width), float(page.rect.height)
        if page_width <= 0 or page_height <= 0:
            raise ValueError("Project PDF page has invalid dimensions")
        scale_x, scale_y = width / page_width, height / page_height
        result: list[dict] = []
        seen: set[tuple[int, int, int, int]] = set()
        truncated = False
        for path_index, drawing in enumerate(page.get_drawings()):
            layer = str(drawing.get("layer") or "")
            dashed = bool(str(drawing.get("dashes") or "").strip(" []0"))
            line_width = float(drawing.get("width") or 0)
            for first, second in drawing_segments(drawing.get("items", [])):
                x0, y0 = first[0] * scale_x, first[1] * scale_y
                x1, y1 = second[0] * scale_x, second[1] * scale_y
                clipped = clip_segment((x0, y0), (x1, y1), (0.0, 0.0, float(width), float(height)))
                if not clipped:
                    continue
                (x0, y0), (x1, y1) = clipped
                if hypot(x1 - x0, y1 - y0) < 1.5:
                    continue
                key = (round(x0 * 4), round(y0 * 4), round(x1 * 4), round(y1 * 4))
                reverse = (key[2], key[3], key[0], key[1])
                if key in seen or reverse in seen:
                    continue
                seen.add(key)
                result.append({
                    "id": f"pdf-{page_number}-{path_index}-{len(result)}",
                    "x0": round(x0, 3), "y0": round(y0, 3),
                    "x1": round(x1, 3), "y1": round(y1, 3),
                    "layer": layer, "dashed": dashed, "width_pt": line_width,
                })
                if len(result) >= limit:
                    truncated = True
                    break
            if truncated:
                break
        return {
            "viewport_id": f"project:{project_id}:page:{page_number}",
            "width": width,
            "height": height,
            "vector_available": bool(result),
            "truncated": truncated,
            "segments": result,
        }
    finally:
        document.close()
