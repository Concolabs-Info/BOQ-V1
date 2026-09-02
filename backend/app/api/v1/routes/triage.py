from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException

from ....modules.pre.triage import triage_project
from ....modules.pre.access import ensure_project_mutable
from ....database.connection import fetch_one, transaction

router = APIRouter(tags=["triage"])


def _run(project_id: UUID) -> None:
    try:
        with transaction() as conn:
            conn.execute("UPDATE project SET pre_status='triaging' WHERE id=%s", (str(project_id),))
        triage_project(project_id)
        with transaction() as conn:
            conn.execute("UPDATE project SET pre_status='draft' WHERE id=%s", (str(project_id),))
    except Exception:
        with transaction() as conn:
            conn.execute("UPDATE project SET pre_status='triage_failed' WHERE id=%s", (str(project_id),))
        raise


@router.post("/projects/{project_id}/triage", status_code=202)
def start_triage(project_id: UUID, background: BackgroundTasks):
    try:
        ensure_project_mutable(project_id)
    except (PermissionError, ValueError) as exc:
        raise HTTPException(409 if isinstance(exc, PermissionError) else 404, str(exc)) from exc
    docs = fetch_one("SELECT count(*) AS n FROM document WHERE project_id=%s AND status='ready'", (str(project_id),))
    if not docs or docs["n"] == 0:
        raise HTTPException(409, "No ready documents")
    background.add_task(_run, project_id)
    return {"status": "triaging"}
