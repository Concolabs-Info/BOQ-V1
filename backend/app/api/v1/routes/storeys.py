from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from ....database.connection import fetch_all, fetch_one, transaction
from ....modules.pre.access import ensure_project_mutable, project_for_storey
from ..schemas import StoreyCreate, StoreyPatch, StoreyReorder

router = APIRouter(tags=["plans"])


def _project_storeys(project_id: UUID | str):
    return fetch_all("SELECT * FROM storey WHERE project_id=%s ORDER BY level_index", (str(project_id),))


@router.post("/projects/{project_id}/storeys", status_code=201)
def create_storey(project_id: UUID, body: StoreyCreate):
    try: ensure_project_mutable(project_id)
    except (PermissionError, ValueError) as exc: raise HTTPException(409 if isinstance(exc, PermissionError) else 404, str(exc)) from exc
    if not fetch_one("SELECT id FROM project WHERE id=%s", (str(project_id),)):
        raise HTTPException(404, "Project not found")
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO storey(project_id,name,level_index,typical_group,status)
               VALUES (%s,%s,%s,%s,'saved_not_confirmed') RETURNING *""",
            (str(project_id), body.name, body.level_index, body.typical_group),
        ).fetchone()
    return dict(row)


@router.patch("/storeys/{storey_id}")
def patch_storey(storey_id: UUID, body: StoreyPatch):
    pid = project_for_storey(storey_id)
    if pid:
        try: ensure_project_mutable(pid)
        except PermissionError as exc: raise HTTPException(409, str(exc)) from exc
    current = fetch_one("SELECT * FROM storey WHERE id=%s", (str(storey_id),))
    if not current:
        raise HTTPException(404, "Storey not found")
    data = body.model_dump(exclude_unset=True)
    if not data:
        return current
    cols = ",".join(f"{key}=%s" for key in data)
    with transaction() as conn:
        row = conn.execute(
            f"UPDATE storey SET {cols},status='saved_not_confirmed' WHERE id=%s RETURNING *",
            (*data.values(), str(storey_id)),
        ).fetchone()
    return dict(row)


@router.post("/projects/{project_id}/storeys/reorder")
def reorder_storeys(project_id: UUID, body: StoreyReorder):
    try: ensure_project_mutable(project_id)
    except (PermissionError, ValueError) as exc: raise HTTPException(409 if isinstance(exc, PermissionError) else 404, str(exc)) from exc
    current = _project_storeys(project_id)
    current_ids = {str(row["id"]) for row in current}
    supplied = [str(value) for value in body.storey_ids]
    if set(supplied) != current_ids or len(supplied) != len(current_ids):
        raise HTTPException(400, "storey_ids must contain every project storey exactly once")
    with transaction() as conn:
        conn.execute("UPDATE storey SET level_index=level_index+10000,status='saved_not_confirmed' WHERE project_id=%s", (str(project_id),))
        for index, storey_id in enumerate(supplied):
            conn.execute("UPDATE storey SET level_index=%s WHERE id=%s", (index, storey_id))
    return _project_storeys(project_id)
