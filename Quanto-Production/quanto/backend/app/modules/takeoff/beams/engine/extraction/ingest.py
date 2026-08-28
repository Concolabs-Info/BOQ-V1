"""S0 — Ingest & Index. PyMuPDF extraction of vector paths (with dash metadata),
OCG layers, text spans, and two-level rasters. Deterministic, no model calls."""
from __future__ import annotations

import math
from pathlib import Path

import pymupdf

from db.repo import Repo

THUMB_DPI = 40
HIRES_DPI = 150


class RasterOnlyPDFError(Exception):
    """The PDF has no vector content on any page — out of scope for v1."""


def _iter_segments(item) -> list[tuple[float, float, float, float]]:
    """Flatten a drawing item into straight segments (curves approximated by chords)."""
    kind = item[0]
    if kind == "l":  # line
        p0, p1 = item[1], item[2]
        return [(p0.x, p0.y, p1.x, p1.y)]
    if kind == "c":  # bezier — chord approximation is enough for beam centerline work
        p0, p3 = item[1], item[4]
        return [(p0.x, p0.y, p3.x, p3.y)]
    if kind == "re":  # rectangle → 4 edges
        r = item[1]
        return [
            (r.x0, r.y0, r.x1, r.y0), (r.x1, r.y0, r.x1, r.y1),
            (r.x1, r.y1, r.x0, r.y1), (r.x0, r.y1, r.x0, r.y0),
        ]
    return []


def _is_dashed(drawing: dict) -> bool:
    dashes = drawing.get("dashes")
    return bool(dashes and dashes not in ("", "[] 0", "[]0"))


def ingest(pdf_path: str | Path, repo: Repo, run_id: str, assets_dir: str | Path) -> dict:
    """Populate sheets/layers/paths/texts and render rasters. Returns summary stats."""
    assets = Path(assets_dir)
    assets.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(str(pdf_path))

    total_vector_paths = 0
    for page in doc:
        i = page.number
        thumb = assets / f"p{i}_thumb.png"
        hires = assets / f"p{i}_hires.png"
        page.get_pixmap(dpi=THUMB_DPI).save(str(thumb))
        page.get_pixmap(dpi=HIRES_DPI).save(str(hires))
        repo.add_sheet(run_id, i, page.rect.width, page.rect.height, str(thumb), str(hires))

        # OCG layers present on this page (document-level config, membership via drawings)
        layer_names = sorted({(d.get("layer") or "") for d in page.get_drawings() if d.get("layer")})
        ocgs = doc.get_ocgs() or {}
        doc_layers = sorted({v.get("name", "") for v in ocgs.values() if v.get("name")})
        repo.add_layers(run_id, i, sorted(set(layer_names) | set(doc_layers)))

        # get_drawings returns unrotated coordinates while get_text and rendered
        # rasters use display space — normalize everything to display space here
        rot = page.rotation_matrix
        path_rows = []
        for d in page.get_drawings():
            dashed = _is_dashed(d)
            layer = d.get("layer")
            for item in d["items"]:
                for x0, y0, x1, y1 in _iter_segments(item):
                    p0 = pymupdf.Point(x0, y0) * rot
                    p1 = pymupdf.Point(x1, y1) * rot
                    length = math.hypot(p1.x - p0.x, p1.y - p0.y)
                    if length < 0.5:
                        continue
                    path_rows.append({
                        "layer": layer, "dashed": dashed,
                        "x0": p0.x, "y0": p0.y, "x1": p1.x, "y1": p1.y,
                        "length": length,
                    })
        repo.add_paths(run_id, i, path_rows)
        total_vector_paths += len(path_rows)

        text_rows = []
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    t = span["text"].strip()
                    if not t:
                        continue
                    # get_text bboxes come back unrotated too — normalize to display
                    rect = pymupdf.Rect(span["bbox"]) * rot
                    rect.normalize()
                    text_rows.append({"text": t, "x0": rect.x0, "y0": rect.y0,
                                      "x1": rect.x1, "y1": rect.y1})
        repo.add_texts(run_id, i, text_rows)

    n_pages = len(doc)
    doc.close()
    if total_vector_paths == 0:
        raise RasterOnlyPDFError(
            "No vector content found on any page — raster/scanned PDFs are out of scope for v1."
        )
    return {"pages": n_pages, "paths": total_vector_paths}
