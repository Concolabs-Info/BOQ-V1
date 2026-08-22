from __future__ import annotations

from pathlib import Path
from uuid import UUID

import pymupdf

from ...core.config import get_settings
from ...database.connection import fetch_one, transaction
from ...services.storage.paths import key_for, renders_dir, resolve_key

RENDER_DPIS = (72, 150)  # locked by the Pre plan


def _matrix_to_list(m: pymupdf.Matrix) -> list[float]:
    return [m.a, m.b, m.c, m.d, m.e, m.f]


def ingest_document(document_id: UUID | str) -> None:
    row = fetch_one("SELECT * FROM document WHERE id=%s", (str(document_id),))
    if not row:
        return

    settings = get_settings()
    source_path = resolve_key(row["storage_key"])
    try:
        with transaction() as conn:
            conn.execute("UPDATE document SET status='processing', progress=0, error_message=NULL, updated_at=now() WHERE id=%s", (str(document_id),))
            conn.execute("DELETE FROM page WHERE document_id=%s", (str(document_id),))

        pdf = pymupdf.open(source_path)
        with transaction() as conn:
            conn.execute("UPDATE document SET page_count=%s, updated_at=now() WHERE id=%s", (pdf.page_count, str(document_id)))

        for index in range(pdf.page_count):
            page = pdf[index]
            page_rect = page.cropbox  # unrotated canonical page space; page.rect may be rotation-swapped
            with transaction() as conn:
                page_row = conn.execute(
                    """INSERT INTO page(document_id, page_number, width_pt, height_pt, rotation)
                       VALUES (%s,%s,%s,%s,%s) RETURNING id""",
                    (str(document_id), index + 1, page_rect.width, page_rect.height, page.rotation),
                ).fetchone()
                page_id = page_row["id"]

            for dpi in RENDER_DPIS:
                mat = pymupdf.Matrix(dpi / 72.0, dpi / 72.0)
                pix = page.get_pixmap(matrix=mat, alpha=False)
                render_dir = renders_dir(row["project_id"])
                render_path = render_dir / f"{document_id}-p{index + 1}@{dpi}.png"
                pix.save(render_path)

                # PyMuPDF applies page rotation when rendering. This maps unrotated page
                # space to the rendered pixel space. Store the inverse once and reuse it.
                image_from_page = page.rotation_matrix * mat
                page_from_image = ~image_from_page
                storage_key = key_for(render_path)
                with transaction() as conn:
                    conn.execute(
                        """INSERT INTO page_render(page_id, dpi, width_px, height_px, page_from_image, storage_key)
                           VALUES (%s,%s,%s,%s,%s,%s)""",
                        (str(page_id), dpi, pix.width, pix.height, _matrix_to_list(page_from_image), storage_key),
                    )

            progress = round((index + 1) / max(pdf.page_count, 1) * 100)
            with transaction() as conn:
                conn.execute(
                    "UPDATE document SET progress=%s, updated_at=now() WHERE id=%s",
                    (progress, str(document_id)),
                )

        pdf.close()
        with transaction() as conn:
            conn.execute("UPDATE document SET status='ready', progress=100, updated_at=now() WHERE id=%s", (str(document_id),))
    except Exception as exc:
        with transaction() as conn:
            conn.execute(
                "UPDATE document SET status='failed', error_message=%s, updated_at=now() WHERE id=%s",
                (str(exc), str(document_id)),
            )
        raise
