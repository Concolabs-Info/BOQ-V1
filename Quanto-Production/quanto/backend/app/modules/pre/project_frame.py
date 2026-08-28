from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi.encoders import jsonable_encoder

from ...database.json_value import Jsonb

from ...database.connection import fetch_all, fetch_one, transaction
from .confirmations import is_confirmed
from .height import confirmed_scale
from .scale import requires_primary_scale


def readiness(project_id: UUID | str) -> dict:
    pid = str(project_id)
    issues: list[dict] = []
    documents = fetch_all("SELECT id,status,filename FROM document WHERE project_id=%s", (pid,))
    if not documents:
        issues.append({"stage": "upload", "message": "No documents uploaded"})
    for doc in documents:
        if doc["status"] != "ready":
            issues.append({"stage": "upload", "message": f"{doc['filename']} is {doc['status']}"})

    sheets = fetch_all(
        """SELECT s.* FROM sheet s JOIN page p ON p.id=s.page_id JOIN document d ON d.id=p.document_id
           WHERE d.project_id=%s ORDER BY p.page_number""",
        (pid,),
    )
    if documents and not sheets:
        issues.append({"stage": "plans", "message": "Drawings have not been triaged"})
    if sheets and not is_confirmed("sheet_set", pid):
        issues.append({"stage": "upload", "message": "Sheet inclusion has not been confirmed"})

    viewports = fetch_all(
        """SELECT v.* FROM viewport v JOIN sheet s ON s.id=v.sheet_id JOIN page p ON p.id=s.page_id
           JOIN document d ON d.id=p.document_id WHERE d.project_id=%s AND s.included=true AND v.relevant=true""",
        (pid,),
    )
    for vp in viewports:
        if not is_confirmed("viewport", vp["id"]):
            issues.append({"stage": "plans", "message": f"Viewport not confirmed: {vp['name']}", "entity_id": str(vp["id"])})
        if requires_primary_scale(vp):
            scale = confirmed_scale(vp["id"])
            if not scale or not is_confirmed("scale", scale["id"]):
                issues.append({"stage": "scale", "message": f"Scale not confirmed: {vp['name']}", "entity_id": str(vp["id"])})

    storeys = fetch_all("SELECT * FROM storey WHERE project_id=%s ORDER BY level_index", (pid,))
    if not storeys:
        issues.append({"stage": "plans", "message": "No storeys are defined"})
    else:
        if not is_confirmed("storey_stack", pid):
            issues.append({"stage": "plans", "message": "Storey order has not been confirmed"})
        missing = [s for s in storeys if s["height_mm"] is None]
        if missing:
            issues.append({"stage": "height", "message": f"{len(missing)} storey height(s) unresolved"})
        elif not is_confirmed("height_stack", pid):
            issues.append({"stage": "height", "message": "Storey heights have not been confirmed"})

    specs = fetch_all(
        """SELECT si.* FROM spec_item si LEFT JOIN sheet s ON s.page_id=si.page_id
           WHERE si.project_id=%s AND (si.page_id IS NULL OR s.included=true)""",
        (pid,),
    )
    if not specs:
        issues.append({"stage": "specifications", "message": "Specifications have not been extracted"})
    for item in specs:
        if not is_confirmed("spec_item", item["id"]):
            issues.append({"stage": "specifications", "message": f"Specification item not confirmed: {item['name']}", "entity_id": str(item["id"])})

    return {"ready": len(issues) == 0, "issues": issues}


def build_frame(project_id: UUID | str) -> dict:
    pid = str(project_id)
    project = fetch_one("SELECT id,name,frame_version FROM project WHERE id=%s", (pid,))
    documents = fetch_all(
        "SELECT id,filename,page_count,sha256 FROM document WHERE project_id=%s AND status='ready' ORDER BY created_at",
        (pid,),
    )
    sheets = fetch_all(
        """SELECT s.id,s.sheet_no,s.title,s.revision,s.discipline,p.id AS page_id,p.page_number,p.document_id,
                  p.width_pt,p.height_pt,pr.id AS working_render_id
           FROM sheet s JOIN page p ON p.id=s.page_id JOIN document d ON d.id=p.document_id
           LEFT JOIN page_render pr ON pr.page_id=p.id AND pr.dpi=150
           WHERE d.project_id=%s AND s.included=true ORDER BY p.page_number""",
        (pid,),
    )
    viewports = fetch_all(
        """SELECT v.id,v.sheet_id,v.name,v.discipline,v.view_kind,v.subjects,v.bbox_mpt,v.level_label,v.crop_version
           FROM viewport v JOIN sheet s ON s.id=v.sheet_id JOIN page p ON p.id=s.page_id
           JOIN document d ON d.id=p.document_id
           WHERE d.project_id=%s AND s.included=true AND v.relevant=true ORDER BY p.page_number,v.display_order""",
        (pid,),
    )
    for vp in viewports:
        sf = confirmed_scale(vp["id"])
        checks = (sf or {}).get("checks") or {}
        factor = checks.get("confirmed_factor") if sf else None
        if factor is None and sf:
            factor = sf.get("factor_x") or sf.get("factor_y")
        vp["scale_factor"] = float(factor) if factor is not None else None
        vp["scale_fit_id"] = str(sf["id"]) if sf else None

    levels = fetch_all(
        "SELECT id,name,level_index,height_mm,typical_group,source_viewport_id,height_source_viewport_id FROM storey WHERE project_id=%s ORDER BY level_index",
        (pid,),
    )
    specs = fetch_all(
        """SELECT si.id,si.viewport_id,si.page_id,si.kind,si.name,si.topic,si.raw_text,si.table_json,si.bbox_mpt,si.found
           FROM spec_item si LEFT JOIN sheet s ON s.page_id=si.page_id
           WHERE si.project_id=%s AND (si.page_id IS NULL OR s.included=true) ORDER BY si.name""",
        (pid,),
    )
    transforms = fetch_all(
        """SELECT v.id AS viewport_id,p.id AS page_id,pr.id AS render_id,pr.page_from_image,pr.width_px,pr.height_px
           FROM viewport v JOIN sheet s ON s.id=v.sheet_id JOIN page_render pr ON pr.page_id=s.page_id AND pr.dpi=150
           JOIN page p ON p.id=s.page_id JOIN document d ON d.id=p.document_id
           WHERE d.project_id=%s AND s.included=true AND v.relevant=true""",
        (pid,),
    )
    return {
        "schema_version": "project-frame-v1",
        "project": {"id": pid, "name": project["name"] if project else None},
        "frame_version": int((project or {}).get("frame_version", 0)) + 1,
        "created_at": datetime.now(UTC).isoformat(),
        "coordinate_contract": {
            "canonical_page_geometry": "integer_page_milli_points",
            "measurement_units": "millimetres",
            "model_coordinates": "temporary_norm_1000_top_left",
        },
        "source_documents": documents,
        "sheets": sheets,
        "viewports": viewports,
        "levels": levels,
        "spec_items": specs,
        "transforms": transforms,
    }


def freeze(project_id: UUID | str) -> dict:
    existing = fetch_one("SELECT pre_status,pre_frame FROM project WHERE id=%s", (str(project_id),))
    if existing and existing["pre_status"] == "frozen" and existing.get("pre_frame"):
        return existing["pre_frame"]
    state = readiness(project_id)
    if not state["ready"]:
        raise RuntimeError(state)
    frame = jsonable_encoder(build_frame(project_id))
    with transaction() as conn:
        conn.execute(
            "UPDATE project SET pre_status='frozen',pre_frame=%s,frame_version=%s,frozen_at=now() WHERE id=%s",
            (Jsonb(frame), frame["frame_version"], str(project_id)),
        )
    return frame
