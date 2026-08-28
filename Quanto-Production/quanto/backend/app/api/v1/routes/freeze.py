from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from ....modules.pre.project_frame import freeze, readiness
from ....database.connection import fetch_one

router = APIRouter(tags=["pre"])


@router.get("/projects/{project_id}/pre/readiness")
def get_readiness(project_id: UUID):
    return readiness(project_id)


@router.post("/projects/{project_id}/pre/freeze")
def freeze_pre(project_id: UUID):
    try:
        frame = freeze(project_id)
        # Beam processing is a downstream consumer of the frozen Pre frame.
        # Kick it off immediately so the Beam canvas is normally ready before
        # the user opens Takeoff > Beams. Failure here must never alter Pre.
        try:
            from ....modules.takeoff.beams import ensure_analysis_started
            ensure_analysis_started(project_id)
        except Exception:  # Beam status will surface the error in the Beam page.
            pass
        return frame
    except RuntimeError as exc:
        detail = exc.args[0] if exc.args else "Pre is not ready"
        raise HTTPException(409, detail=detail) from exc


@router.get("/projects/{project_id}/pre/frame")
def get_frame(project_id: UUID):
    row = fetch_one("SELECT pre_status,pre_frame FROM project WHERE id=%s", (str(project_id),))
    if not row:
        raise HTTPException(404, "Project not found")
    if row["pre_status"] != "frozen" or row["pre_frame"] is None:
        raise HTTPException(409, "Pre has not been frozen")
    return row["pre_frame"]
