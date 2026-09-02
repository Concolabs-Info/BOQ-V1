from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException
from ....database.json_value import Jsonb

from ....modules.pre.access import ensure_project_mutable, project_for_spec
from ....modules.pre.specifications import extract_specs
from ....database.connection import fetch_one, transaction
from ..schemas import SpecCreate, SpecPatch

router = APIRouter(tags=["specifications"])


def _extract(project_id: UUID):
    try:
        extract_specs(project_id)
        with transaction() as conn:
            conn.execute("UPDATE project SET pre_status='draft' WHERE id=%s", (str(project_id),))
    except Exception:
        with transaction() as conn:
            conn.execute("UPDATE project SET pre_status='specs_failed' WHERE id=%s", (str(project_id),))
        raise


@router.post("/projects/{project_id}/specs/extract", status_code=202)
def extract(project_id: UUID, background: BackgroundTasks):
    try:
        ensure_project_mutable(project_id)
    except (PermissionError, ValueError) as exc:
        raise HTTPException(409 if isinstance(exc, PermissionError) else 404, str(exc)) from exc
    if not fetch_one("SELECT id FROM project WHERE id=%s", (str(project_id),)):
        raise HTTPException(404, "Project not found")
    included = fetch_one(
        """SELECT s.id FROM sheet s JOIN page p ON p.id=s.page_id JOIN document d ON d.id=p.document_id
           WHERE d.project_id=%s AND s.included=true LIMIT 1""",
        (str(project_id),),
    )
    if not included:
        raise HTTPException(409, "Confirm/retain at least one included drawing sheet before extracting specifications")

    # Claim the extraction synchronously. React development mode may call the
    # screen effect twice, and two background jobs would otherwise delete and
    # reinsert the same specification rows concurrently.
    with transaction() as conn:
        claimed = conn.execute(
            """UPDATE project SET pre_status='specs_extracting'
               WHERE id=%s AND pre_status<>'specs_extracting' RETURNING id""",
            (str(project_id),),
        ).fetchone()
    if not claimed:
        return {"status": "specs_extracting"}
    background.add_task(_extract, project_id)
    return {"status": "specs_extracting"}


@router.post("/projects/{project_id}/spec-items", status_code=201)
def create_spec(project_id: UUID, body: SpecCreate):
    try:
        ensure_project_mutable(project_id)
    except (PermissionError, ValueError) as exc:
        raise HTTPException(409 if isinstance(exc, PermissionError) else 404, str(exc)) from exc
    if not fetch_one("SELECT id FROM project WHERE id=%s", (str(project_id),)):
        raise HTTPException(404, "Project not found")
    if body.viewport_id and not fetch_one(
        """SELECT v.id FROM viewport v JOIN sheet s ON s.id=v.sheet_id JOIN page p ON p.id=s.page_id
           JOIN document d ON d.id=p.document_id WHERE v.id=%s AND d.project_id=%s""",
        (str(body.viewport_id), str(project_id)),
    ):
        raise HTTPException(400, "viewport_id does not belong to this project")
    if body.page_id and not fetch_one(
        """SELECT p.id FROM page p JOIN document d ON d.id=p.document_id WHERE p.id=%s AND d.project_id=%s""",
        (str(body.page_id), str(project_id)),
    ):
        raise HTTPException(400, "page_id does not belong to this project")
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO spec_item(id,project_id,viewport_id,page_id,kind,name,topic,raw_text,table_json,found,status)
               VALUES (COALESCE(%s,gen_random_uuid()),%s,%s,%s,%s,%s,%s,%s,%s,%s,'saved_not_confirmed') RETURNING *""",
            (str(body.id) if body.id else None, str(project_id), str(body.viewport_id) if body.viewport_id else None, str(body.page_id) if body.page_id else None,
             body.kind, body.name, body.topic, body.raw_text, Jsonb(body.table_json) if body.table_json is not None else None, body.found),
        ).fetchone()
    return dict(row)


@router.put("/spec-items/{item_id}")
def patch_spec(item_id: UUID, body: SpecPatch):
    pid = project_for_spec(item_id)
    if pid:
        try:
            ensure_project_mutable(pid)
        except PermissionError as exc:
            raise HTTPException(409, str(exc)) from exc
    current = fetch_one("SELECT * FROM spec_item WHERE id=%s", (str(item_id),))
    if not current:
        raise HTTPException(404, "Specification item not found")
    data = body.model_dump(exclude_unset=True)
    if "table_json" in data:
        data["table_json"] = Jsonb(data["table_json"]) if data["table_json"] is not None else None
    if not data:
        return current
    cols = ",".join(f"{key}=%s" for key in data)
    with transaction() as conn:
        row = conn.execute(
            f"UPDATE spec_item SET {cols},status='saved_not_confirmed' WHERE id=%s RETURNING *",
            (*data.values(), str(item_id)),
        ).fetchone()
    return dict(row)
