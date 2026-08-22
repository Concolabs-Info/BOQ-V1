from __future__ import annotations

from math import hypot
from typing import Iterable


def to_mpt(pt: float) -> int:
    return round(pt * 1000)


def from_mpt(mpt: int) -> float:
    return mpt / 1000.0


def apply_affine(m: list[float] | tuple[float, ...], x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = m
    return a * x + c * y + e, b * x + d * y + f


def invert_affine(m: list[float] | tuple[float, ...]) -> list[float]:
    a, b, c, d, e, f = m
    det = a * d - b * c
    if abs(det) < 1e-12:
        raise ValueError("Affine matrix is singular")
    ia = d / det
    ib = -b / det
    ic = -c / det
    id_ = a / det
    ie = -(ia * e + ic * f)
    iff = -(ib * e + id_ * f)
    return [ia, ib, ic, id_, ie, iff]


def norm_box_to_px(box: dict[str, int], width_px: int, height_px: int) -> tuple[int, int, int, int]:
    x1 = max(0, min(width_px - 1, round(box["x1"] / 1000 * width_px)))
    y1 = max(0, min(height_px - 1, round(box["y1"] / 1000 * height_px)))
    x2 = max(x1 + 1, min(width_px, round(box["x2"] / 1000 * width_px)))
    y2 = max(y1 + 1, min(height_px, round(box["y2"] / 1000 * height_px)))
    return x1, y1, x2, y2


def px_box_to_page_mpt(box_px: tuple[int, int, int, int], page_from_image: list[float]) -> list[int]:
    x1, y1, x2, y2 = box_px
    corners = [
        apply_affine(page_from_image, x1, y1),
        apply_affine(page_from_image, x2, y1),
        apply_affine(page_from_image, x2, y2),
        apply_affine(page_from_image, x1, y2),
    ]
    xs = [p[0] for p in corners]
    ys = [p[1] for p in corners]
    return [to_mpt(min(xs)), to_mpt(min(ys)), to_mpt(max(xs)), to_mpt(max(ys))]


def page_mpt_box_to_image_px(bbox_mpt: Iterable[int], image_from_page: list[float]) -> tuple[int, int, int, int]:
    x1m, y1m, x2m, y2m = list(bbox_mpt)
    corners = [
        apply_affine(image_from_page, from_mpt(x1m), from_mpt(y1m)),
        apply_affine(image_from_page, from_mpt(x2m), from_mpt(y1m)),
        apply_affine(image_from_page, from_mpt(x2m), from_mpt(y2m)),
        apply_affine(image_from_page, from_mpt(x1m), from_mpt(y2m)),
    ]
    xs = [p[0] for p in corners]
    ys = [p[1] for p in corners]
    return round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))


def distance_pt(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    return hypot(p2[0] - p1[0], p2[1] - p1[1])


def norm01_box_to_page_mpt(rect: list[float], width_px: int, height_px: int, page_from_image: list[float]) -> list[int]:
    if len(rect) != 4:
        raise ValueError("Normalized box must contain four values")
    x1, y1, x2, y2 = rect
    if not (0 <= x1 < x2 <= 1 and 0 <= y1 < y2 <= 1):
        raise ValueError("Normalized box must be [x1,y1,x2,y2] inside 0..1")
    box_px = (
        round(x1 * width_px),
        round(y1 * height_px),
        round(x2 * width_px),
        round(y2 * height_px),
    )
    return px_box_to_page_mpt(box_px, page_from_image)


def page_mpt_box_to_norm01(bbox_mpt: Iterable[int], page_from_image: list[float], width_px: int, height_px: int) -> list[float]:
    image_from_page = invert_affine(page_from_image)
    x1, y1, x2, y2 = page_mpt_box_to_image_px(bbox_mpt, image_from_page)
    return [
        max(0.0, min(1.0, x1 / width_px)),
        max(0.0, min(1.0, y1 / height_px)),
        max(0.0, min(1.0, x2 / width_px)),
        max(0.0, min(1.0, y2 / height_px)),
    ]
