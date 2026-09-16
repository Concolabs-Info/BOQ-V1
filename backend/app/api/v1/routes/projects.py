from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request

from ....core.rbac import WORKSPACE_SCOPED_ROLES
from ....modules.platform.membership import CompanyMembership
from ....modules.pre.confirmations import is_confirmed
from ....modules.pre.project_frame import readiness
from ....modules.pre.height import confirmed_scale
from ....modules.pre.scale import is_scale_eligible, parse_scale_note, requires_primary_scale
from ....services.pdf.geometry import page_mpt_box_to_norm01
from ....database.connection import fetch_all, fetch_one, transaction
from ..schemas import CreateProject, UpdateProject

router = APIRouter(tags=["projects"])


@router.get("/projects")
def list_projects(
    request: Request,
    search: str | None = Query(default=None, max_length=200),
    status: str | None = Query(default=None),
    limit: int = Query(default=24, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    membership: CompanyMembership = request.state.membership
    user_id = request.state.current_user.id
    clauses = ["company_id = %s"]
    params: list[object] = [membership.company_id]
    if membership.role in WORKSPACE_SCOPED_ROLES:
        clauses.append("id IN (SELECT project_id FROM project_member WHERE user_id = %s)")
        params.append(user_id)
    if search and search.strip():
        needle = f"%{search.strip()}%"
        clauses.append("(name ILIKE %s OR COALESCE(project_number,'') ILIKE %s OR COALESCE(client_name,'') ILIKE %s OR COALESCE(location,'') ILIKE %s)")
        params.extend([needle, needle, needle, needle])
    if status:
        clauses.append("status=%s")
        params.append(status)
    where = " AND ".join(clauses)
    total = fetch_one(f"SELECT count(*) AS n FROM project WHERE {where}", tuple(params))
    rows = fetch_all(
        f"""SELECT id,name,status,project_number,client_name,location,description,pre_status,frame_version,
                    frozen_at,created_at,updated_at
             FROM project WHERE {where}
             ORDER BY updated_at DESC, created_at DESC LIMIT %s OFFSET %s""",
        tuple([*params, limit, offset]),
    )
    return {"projects": rows, "total": int(total["n"] if total else 0), "limit": limit, "offset": offset}


@router.post("/projects", status_code=201)
def create_project(body: CreateProject, request: Request):
    membership: CompanyMembership = request.state.membership
    user_id = request.state.current_user.id
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO project(name,project_number,client_name,location,description,company_id,created_by_user_id)
               VALUES (%s,%s,%s,%s,%s,%s,%s)
               RETURNING id,name,status,project_number,client_name,location,description,pre_status,frame_version,
                         frozen_at,created_at,updated_at""",
            (body.name.strip(), body.project_number, body.client_name, body.location, body.description, membership.company_id, user_id),
        ).fetchone()
        conn.execute(
            "INSERT INTO project_member (project_id, user_id) VALUES (%s, %s) ON CONFLICT (project_id, user_id) DO NOTHING",
            (str(row["id"]), user_id),
        )
    result = dict(row)
    result["project_id"] = str(result["id"])
    return result


@router.get("/projects/{project_id}")
def get_project(project_id: UUID):
    row = fetch_one(
        """SELECT id,name,status,project_number,client_name,location,description,pre_status,frame_version,
                  frozen_at,created_at,updated_at FROM project WHERE id=%s""",
        (str(project_id),),
    )
    if not row:
        raise HTTPException(404, "Project not found")
    return row


@router.patch("/projects/{project_id}")
def update_project(project_id: UUID, body: UpdateProject):
    current = fetch_one("SELECT * FROM project WHERE id=%s", (str(project_id),))
    if not current:
        raise HTTPException(404, "Project not found")
    if current["pre_status"] == "frozen":
        raise HTTPException(409, "Pre is frozen for this project")
    data = body.model_dump(exclude_unset=True)
    if not data:
        return get_project(project_id)
    cols = ",".join(f"{key}=%s" for key in data)
    with transaction() as conn:
        row = conn.execute(
            f"""UPDATE project SET {cols},updated_at=now() WHERE id=%s
                 RETURNING id,name,status,project_number,client_name,location,description,pre_status,frame_version,
                           frozen_at,created_at,updated_at""",
            (*data.values(), str(project_id)),
        ).fetchone()
    return dict(row)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: UUID):
    with transaction() as conn:
        row = conn.execute("DELETE FROM project WHERE id=%s RETURNING id", (str(project_id),)).fetchone()
    if not row:
        raise HTTPException(404, "Project not found")


def _safe_confirmed(entity_type: str, entity_id) -> bool:
    try:
        return is_confirmed(entity_type, entity_id)
    except ValueError:
        return False


@router.get("/projects/{project_id}/pre")
def get_pre(project_id: UUID):
    project = fetch_one(
        """SELECT id,name,status,project_number,client_name,location,description,pre_status,frame_version,
                  frozen_at,created_at,updated_at FROM project WHERE id=%s""",
        (str(project_id),),
    )
    if not project:
        raise HTTPException(404, "Project not found")

    documents = fetch_all(
        """SELECT id,filename,page_count,status,progress,size_bytes,sha256,mime_type,error_message,created_at,updated_at
           FROM document WHERE project_id=%s ORDER BY created_at""",
        (str(project_id),),
    )
    pages = fetch_all(
        """SELECT p.id,p.document_id,p.page_number,p.width_pt,p.height_pt,p.rotation,
                  r72.id AS thumbnail_render_id,r150.id AS working_render_id,
                  r150.width_px AS working_width_px,r150.height_px AS working_height_px,r150.page_from_image AS working_page_from_image
           FROM page p JOIN document d ON d.id=p.document_id
           LEFT JOIN page_render r72 ON r72.page_id=p.id AND r72.dpi=72
           LEFT JOIN page_render r150 ON r150.page_id=p.id AND r150.dpi=150
           WHERE d.project_id=%s ORDER BY d.created_at,p.page_number""",
        (str(project_id),),
    )
    sheets = fetch_all(
        """SELECT s.*,p.page_number,p.width_pt,p.height_pt,r72.id AS thumbnail_render_id,r150.id AS working_render_id
           FROM sheet s JOIN page p ON p.id=s.page_id JOIN document d ON d.id=p.document_id
           LEFT JOIN page_render r72 ON r72.page_id=p.id AND r72.dpi=72
           LEFT JOIN page_render r150 ON r150.page_id=p.id AND r150.dpi=150
           WHERE d.project_id=%s ORDER BY p.page_number""",
        (str(project_id),),
    )
    viewports = fetch_all(
        """SELECT v.*,s.page_id,s.sheet_no,s.title AS sheet_title,s.title_block_scale,s.included,p.page_number,p.width_pt,p.height_pt,
                  r150.id AS working_render_id,r150.width_px AS working_width_px,
                  r150.height_px AS working_height_px,r150.page_from_image AS working_page_from_image
           FROM viewport v JOIN sheet s ON s.id=v.sheet_id JOIN page p ON p.id=s.page_id
           JOIN document d ON d.id=p.document_id
           LEFT JOIN page_render r150 ON r150.page_id=p.id AND r150.dpi=150
           WHERE d.project_id=%s ORDER BY p.page_number,v.display_order""",
        (str(project_id),),
    )
    for vp in viewports:
        if vp.get("working_page_from_image") and vp.get("working_width_px") and vp.get("working_height_px"):
            vp["bbox_norm"] = page_mpt_box_to_norm01(
                vp["bbox_mpt"], vp["working_page_from_image"], vp["working_width_px"], vp["working_height_px"]
            )
        else:
            vp["bbox_norm"] = None
        vp["confirmed"] = _safe_confirmed("viewport", vp["id"])
        sf = confirmed_scale(vp["id"])
        latest = fetch_one("SELECT * FROM scale_fit WHERE viewport_id=%s ORDER BY created_at DESC LIMIT 1", (str(vp["id"]),))
        vp["scale"] = sf
        vp["latest_scale"] = latest
        vp["scale_confirmed"] = bool(sf and _safe_confirmed("scale", sf["id"]))
        vp["scale_stale"] = bool(latest and latest["crop_version"] != vp["crop_version"])
        vp["scale_eligible"] = is_scale_eligible(vp)
        vp["scale_required"] = requires_primary_scale(vp)
        scale_note = vp.get("stated_scale") or vp.get("title_block_scale")
        detected = parse_scale_note(scale_note)
        vp["detected_scale_factor"] = float(detected["factor"]) if detected.get("factor") is not None else None
        vp["detected_scale_source"] = "viewport" if vp.get("stated_scale") else "title_block" if vp.get("title_block_scale") else "missing"

    storeys = fetch_all("SELECT * FROM storey WHERE project_id=%s ORDER BY level_index", (str(project_id),))
    specs = fetch_all(
        """SELECT si.* FROM spec_item si
           LEFT JOIN sheet s ON s.page_id=si.page_id
           WHERE si.project_id=%s AND (si.page_id IS NULL OR s.included=true)
           ORDER BY si.found DESC,si.name""",
        (str(project_id),),
    )
    page_map = {str(row["id"]): row for row in pages}
    for item in specs:
        page = page_map.get(str(item.get("page_id"))) if item.get("page_id") else None
        if item.get("bbox_mpt") and page and page.get("working_page_from_image") and page.get("working_width_px") and page.get("working_height_px"):
            item["bbox_norm"] = page_mpt_box_to_norm01(
                item["bbox_mpt"], page["working_page_from_image"], page["working_width_px"], page["working_height_px"]
            )
        else:
            item["bbox_norm"] = None
        item["confirmed"] = _safe_confirmed("spec_item", item["id"])

    return {
        "project": project,
        "documents": documents,
        "pages": pages,
        "sheets": sheets,
        "viewports": viewports,
        "storeys": storeys,
        "spec_items": specs,
        "confirmations": {
            "sheet_set": _safe_confirmed("sheet_set", project_id) if sheets else False,
            "storey_stack": _safe_confirmed("storey_stack", project_id) if storeys else False,
            "height_stack": _safe_confirmed("height_stack", project_id) if storeys and all(s["height_mm"] for s in storeys) else False,
        },
        "readiness": readiness(project_id),
    }
