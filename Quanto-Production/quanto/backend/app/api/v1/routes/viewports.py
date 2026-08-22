from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ....modules.pre.access import ensure_project_mutable, project_for_sheet, project_for_viewport
from ....services.pdf.geometry import norm01_box_to_page_mpt
from ....services.pdf.media import ensure_viewport_crop
from ....database.connection import fetch_one, transaction
from ..schemas import SheetPatch, ViewportCreate, ViewportPatch

router = APIRouter(tags=["plans"])


def _working_render_for_sheet(sheet_id: UUID | str) -> dict | None:
    return fetch_one(
        """SELECT pr.width_px,pr.height_px,pr.page_from_image
           FROM sheet s JOIN page_render pr ON pr.page_id=s.page_id AND pr.dpi=150
           WHERE s.id=%s""",
        (str(sheet_id),),
    )


def _validated_mpt_box(box: list[int]) -> list[int]:
    if len(box) != 4 or box[2] <= box[0] or box[3] <= box[1]:
        raise HTTPException(400, "bbox_mpt must be [x1,y1,x2,y2] with positive extent")
    return box


def _norm_to_mpt(sheet_id: UUID | str, box: list[float]) -> list[int]:
    render = _working_render_for_sheet(sheet_id)
    if not render:
        raise HTTPException(409, "Working render is not ready")
    try:
        return norm01_box_to_page_mpt(box, render["width_px"], render["height_px"], render["page_from_image"])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.patch("/sheets/{sheet_id}")
def patch_sheet(sheet_id: UUID, body: SheetPatch):
    pid = project_for_sheet(sheet_id)
    if pid:
        try:
            ensure_project_mutable(pid)
        except PermissionError as exc:
            raise HTTPException(409, str(exc)) from exc
    current = fetch_one("SELECT * FROM sheet WHERE id=%s", (str(sheet_id),))
    if not current:
        raise HTTPException(404, "Sheet not found")
    data = body.model_dump(exclude_unset=True)
    if not data:
        return current
    cols = ",".join(f"{key}=%s" for key in data)
    included_changed = "included" in data and data["included"] != current["included"]
    with transaction() as conn:
        row = conn.execute(
            f"UPDATE sheet SET {cols},status='saved_not_confirmed' WHERE id=%s RETURNING *",
            (*data.values(), str(sheet_id)),
        ).fetchone()
        if included_changed and pid:
            # Specification evidence depends on the complete included sheet set.
            # Force a deterministic re-extraction rather than keeping stale evidence.
            conn.execute("DELETE FROM spec_item WHERE project_id=%s", (str(pid),))
    return dict(row)


@router.patch("/viewports/{viewport_id}")
def patch_viewport(viewport_id: UUID, body: ViewportPatch):
    pid = project_for_viewport(viewport_id)
    if pid:
        try:
            ensure_project_mutable(pid)
        except PermissionError as exc:
            raise HTTPException(409, str(exc)) from exc
    current = fetch_one("SELECT * FROM viewport WHERE id=%s", (str(viewport_id),))
    if not current:
        raise HTTPException(404, "Viewport not found")
    data = body.model_dump(mode="json", exclude_unset=True)
    norm = data.pop("bbox_norm", None)
    if norm is not None:
        data["bbox_mpt"] = _norm_to_mpt(current["sheet_id"], norm)
    if "bbox_mpt" in data and data["bbox_mpt"] is not None:
        data["bbox_mpt"] = _validated_mpt_box(data["bbox_mpt"])
        data["crop_version"] = current["crop_version"] + 1
    if not data:
        return current
    cols = ",".join(f"{key}=%s" for key in data)
    with transaction() as conn:
        row = conn.execute(
            f"UPDATE viewport SET {cols},status='saved_not_confirmed' WHERE id=%s RETURNING *",
            (*data.values(), str(viewport_id)),
        ).fetchone()
    return dict(row)


@router.post("/viewports", status_code=201)
def create_viewport(body: ViewportCreate):
    pid = project_for_sheet(body.sheet_id)
    if pid:
        try:
            ensure_project_mutable(pid)
        except PermissionError as exc:
            raise HTTPException(409, str(exc)) from exc
    if not fetch_one("SELECT id FROM sheet WHERE id=%s", (str(body.sheet_id),)):
        raise HTTPException(404, "Sheet not found")
    if body.parent_viewport_id:
        parent = fetch_one("SELECT sheet_id FROM viewport WHERE id=%s", (str(body.parent_viewport_id),))
        if not parent or str(parent["sheet_id"]) != str(body.sheet_id):
            raise HTTPException(400, "Parent viewport must belong to the same sheet")
    bbox_mpt = _norm_to_mpt(body.sheet_id, body.bbox_norm) if body.bbox_norm is not None else _validated_mpt_box(body.bbox_mpt or [])
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO viewport(id,sheet_id,parent_viewport_id,name,discipline,view_kind,subjects,bbox_mpt,level_label,relevant,why,status)
               VALUES (COALESCE(%s,gen_random_uuid()),%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'saved_not_confirmed') RETURNING *""",
            (str(body.id) if body.id else None, str(body.sheet_id), str(body.parent_viewport_id) if body.parent_viewport_id else None, body.name, body.discipline.value, body.view_kind.value, [x.value for x in body.subjects], bbox_mpt, body.level_label, body.relevant, body.why),
        ).fetchone()
    return dict(row)


@router.delete("/viewports/{viewport_id}", status_code=204)
def delete_viewport(viewport_id: UUID):
    pid = project_for_viewport(viewport_id)
    if pid:
        try:
            ensure_project_mutable(pid)
        except PermissionError as exc:
            raise HTTPException(409, str(exc)) from exc
    with transaction() as conn:
        row = conn.execute("DELETE FROM viewport WHERE id=%s RETURNING id", (str(viewport_id),)).fetchone()
        if not row:
            raise HTTPException(404, "Viewport not found")


@router.get("/viewports/{viewport_id}/crop")
def get_viewport_crop(viewport_id: UUID):
    try:
        path, _ = ensure_viewport_crop(viewport_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return FileResponse(path, media_type="image/png")
