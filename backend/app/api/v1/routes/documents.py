from __future__ import annotations

import hashlib
import re
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ....core.config import get_settings
from ....modules.pre.ingest import ingest_document
from ....modules.pre.access import ensure_project_mutable
from ....database.connection import fetch_all, fetch_one, transaction
from ....services.storage.paths import key_for, resolve_key, source_dir

router = APIRouter(tags=["documents"])


def _safe_filename(name: str) -> str:
    base = Path(name).name
    cleaned = re.sub(r"[^A-Za-z0-9._ -]+", "_", base).strip()
    return cleaned or "drawing.pdf"


@router.post("/projects/{project_id}/documents", status_code=202)
async def upload_document(project_id: UUID, background: BackgroundTasks, file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")
    if not fetch_one("SELECT id FROM project WHERE id=%s", (str(project_id),)):
        raise HTTPException(404, "Project not found")
    try:
        ensure_project_mutable(project_id)
    except PermissionError as exc:
        raise HTTPException(409, str(exc)) from exc

    settings = get_settings()
    name = _safe_filename(file.filename)
    storage_dir = source_dir(project_id)
    stored_name = f"{uuid4()}-{name}"
    path = storage_dir / stored_name
    max_bytes = settings.max_upload_mb * 1024 * 1024
    total = 0
    digest = hashlib.sha256()
    try:
        with path.open("wb") as target:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > max_bytes:
                    raise HTTPException(413, f"PDF exceeds the {settings.max_upload_mb} MB upload limit")
                digest.update(chunk)
                target.write(chunk)
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await file.close()
    with path.open("rb") as source:
        header = source.read(5)
    if total < 5 or header != b"%PDF-":
        path.unlink(missing_ok=True)
        raise HTTPException(400, "The uploaded file is not a valid PDF")
    storage_key = key_for(path)

    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO document(project_id,filename,storage_key,status,progress,size_bytes,sha256,mime_type)
               VALUES (%s,%s,%s,'queued',0,%s,%s,'application/pdf') RETURNING *""",
            (str(project_id), name, storage_key, total, digest.hexdigest()),
        ).fetchone()
    background.add_task(ingest_document, row["id"])
    return dict(row)


@router.get("/documents/{document_id}")
def get_document(document_id: UUID):
    row = fetch_one("SELECT * FROM document WHERE id=%s", (str(document_id),))
    if not row:
        raise HTTPException(404, "Document not found")
    pages = fetch_all(
        """SELECT p.id,p.page_number,p.width_pt,p.height_pt,p.rotation,
                  r72.id AS thumbnail_render_id,r150.id AS working_render_id
           FROM page p
           LEFT JOIN page_render r72 ON r72.page_id=p.id AND r72.dpi=72
           LEFT JOIN page_render r150 ON r150.page_id=p.id AND r150.dpi=150
           WHERE p.document_id=%s ORDER BY p.page_number""",
        (str(document_id),),
    )
    return {**row, "ingested_pages": len(pages), "pages": pages}


@router.get("/renders/{render_id}")
def get_render(render_id: UUID):
    row = fetch_one("SELECT * FROM page_render WHERE id=%s", (str(render_id),))
    if not row:
        raise HTTPException(404, "Render not found")
    path = resolve_key(row["storage_key"])
    if not path.exists():
        raise HTTPException(404, "Render file missing")
    return FileResponse(path, media_type="image/png")
