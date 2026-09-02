"""Draft-overlay renderer for preview_answer: the model sees its own answer
drawn on the sheet (same visual language as the validation UI)."""
from __future__ import annotations

import base64

from agentic.context import AgenticContext

KIND_COLORS = {
    "dashed": (0, 0.55, 0),
    "solid_suspect": (0.9, 0.45, 0),
    "hatch_unknown": (0.6, 0.2, 0.8),
}


def render_draft_overlay(draft: dict, ctx: AgenticContext, name: str) -> dict:
    """Render candidates over the page; returns an image content block and also
    saves the PNG to the scratchpad."""
    import pymupdf

    doc = pymupdf.open(ctx.pdf_path)
    page = doc[ctx.page_index]
    W, H = page.rect.width, page.rect.height
    pix = page.get_pixmap(dpi=110)
    img = pymupdf.open()
    p = img.new_page(width=W, height=H)
    p.insert_image(p.rect, pixmap=pix)
    for c in draft.get("candidates") or []:
        color = KIND_COLORS.get(c.get("kind"), (0.85, 0, 0))
        if c.get("snapped"):
            color = (0, 0.35, 0.9)  # snapped-to-vector shown in blue
        p.draw_line(pymupdf.Point(c["x0"] * W, c["y0"] * H),
                    pymupdf.Point(c["x1"] * W, c["y1"] * H), color=color, width=1.8)
    for u in draft.get("unmatched_runs") or []:
        if "x" in u and "y" in u:
            p.draw_circle(pymupdf.Point(u["x"] * W, u["y"] * H), 5,
                          color=(0.85, 0, 0), width=1.2)
    png = p.get_pixmap(dpi=110).tobytes("png")
    img.close()
    doc.close()
    (ctx.scratch() / f"{name}.png").write_bytes(png)
    return {"type": "image",
            "source": {"type": "base64", "media_type": "image/png",
                       "data": base64.standard_b64encode(png).decode()}}
