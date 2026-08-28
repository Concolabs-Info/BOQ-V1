"""Evidence crop rendering: page raster region + highlight rectangle -> PNG.
Every question and workbook Source cites one of these."""
from __future__ import annotations

from pathlib import Path

import pymupdf

from db.repo import Repo

PAD_PT = 30.0
DPI = 150


def make_crop(pdf_path: str, page_index: int, bbox: list[float], out_dir: str | Path,
              name: str) -> str:
    doc = pymupdf.open(pdf_path)
    page = doc[page_index]
    W, H = page.rect.width, page.rect.height
    bx0, by0, bx1, by1 = bbox
    x0, x1 = min(bx0, bx1), max(bx0, bx1)
    y0, y1 = min(by0, by1), max(by0, by1)
    # clamp fully — vector coords can lie outside the page rect on real CAD PDFs
    cx0 = min(max(0.0, x0 - PAD_PT), W - 2)
    cy0 = min(max(0.0, y0 - PAD_PT), H - 2)
    cx1 = max(min(W, x1 + PAD_PT), cx0 + 2)
    cy1 = max(min(H, y1 + PAD_PT), cy0 + 2)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{name}.png"
    # draw highlight box on a copy of the page, then render the clip
    page.draw_rect(pymupdf.Rect(x0, y0, x1, y1), color=(1, 0.4, 0), width=1.5)
    try:
        pix = page.get_pixmap(dpi=DPI, clip=pymupdf.Rect(cx0, cy0, cx1, cy1))
        pix.save(str(path))
    except Exception:  # noqa: BLE001 — never let evidence rendering kill the pipeline
        # evidence rendering must never kill the pipeline — fall back to full page
        page.get_pixmap(dpi=60).save(str(path))
    doc.close()
    return str(path)


def cite(repo: Repo, run_id: str, pdf_path: str, page_index: int, bbox: list[float],
         out_dir: str | Path, name: str, note: str | None = None) -> str:
    """Render crop + store evidence row. Returns evidence id."""
    sheet = next((s for s in repo.sheets(run_id) if s["page_index"] == page_index), None)
    crop = make_crop(pdf_path, page_index, bbox, out_dir, name)
    return repo.add_evidence(
        run_id, page_index, bbox, crop,
        sheet_no=sheet.get("sheet_no") if sheet else None,
        sheet_title=sheet.get("title") if sheet else None,
        note=note,
    )
