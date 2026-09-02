from __future__ import annotations

from pathlib import Path
from uuid import UUID

from PIL import Image

from ...core.config import get_settings
from ...database.connection import fetch_one
from ..storage.paths import crops_dir, resolve_key
from .geometry import invert_affine, page_mpt_box_to_image_px


def viewport_context(viewport_id: UUID | str) -> dict:
    row = fetch_one(
        """SELECT v.*, s.page_id, s.title_block_scale, p.page_number, p.document_id, d.project_id, d.storage_key AS document_storage_key,
                  pr.id AS render_id, pr.width_px, pr.height_px, pr.page_from_image,
                  pr.storage_key AS render_storage_key
           FROM viewport v
           JOIN sheet s ON s.id=v.sheet_id
           JOIN page p ON p.id=s.page_id
           JOIN document d ON d.id=p.document_id
           JOIN page_render pr ON pr.page_id=p.id AND pr.dpi=150
           WHERE v.id=%s""",
        (str(viewport_id),),
    )
    if not row:
        raise ValueError("Viewport not found")
    return row


def ensure_viewport_crop(viewport_id: UUID | str) -> tuple[Path, dict]:
    ctx = viewport_context(viewport_id)
    settings = get_settings()
    render_path = resolve_key(ctx["render_storage_key"])
    image_from_page = invert_affine(ctx["page_from_image"])
    x1, y1, x2, y2 = page_mpt_box_to_image_px(ctx["bbox_mpt"], image_from_page)
    x1 = max(0, min(ctx["width_px"] - 1, x1))
    y1 = max(0, min(ctx["height_px"] - 1, y1))
    x2 = max(x1 + 1, min(ctx["width_px"], x2))
    y2 = max(y1 + 1, min(ctx["height_px"], y2))

    crop_dir = crops_dir(ctx["project_id"])
    crop_path = crop_dir / f"viewport-{viewport_id}-v{ctx['crop_version']}.png"
    if not crop_path.exists():
        with Image.open(render_path) as image:
            image.crop((x1, y1, x2, y2)).save(crop_path)
    ctx = {**ctx, "crop_px": [x1, y1, x2, y2], "crop_width_px": x2 - x1, "crop_height_px": y2 - y1}
    return crop_path, ctx


def norm_crop_point_to_page_pt(ctx: dict, x: int | float, y: int | float) -> tuple[float, float]:
    x1, y1, _, _ = ctx["crop_px"]
    px = x1 + float(x) / 1000.0 * ctx["crop_width_px"]
    py = y1 + float(y) / 1000.0 * ctx["crop_height_px"]
    a, b, c, d, e, f = ctx["page_from_image"]
    return a * px + c * py + e, b * px + d * py + f
