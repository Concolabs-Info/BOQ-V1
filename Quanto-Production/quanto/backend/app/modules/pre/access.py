from __future__ import annotations

from uuid import UUID

from ...database.connection import fetch_one


def ensure_project_mutable(project_id: UUID | str) -> None:
    row = fetch_one("SELECT pre_status FROM project WHERE id=%s", (str(project_id),))
    if not row:
        raise ValueError("Project not found")
    if row["pre_status"] == "frozen":
        raise PermissionError("Pre is frozen and read-only")


def project_for_sheet(sheet_id: UUID | str) -> str | None:
    row = fetch_one(
        """SELECT d.project_id FROM sheet s JOIN page p ON p.id=s.page_id JOIN document d ON d.id=p.document_id WHERE s.id=%s""",
        (str(sheet_id),),
    )
    return str(row["project_id"]) if row else None


def project_for_viewport(viewport_id: UUID | str) -> str | None:
    row = fetch_one(
        """SELECT d.project_id FROM viewport v JOIN sheet s ON s.id=v.sheet_id JOIN page p ON p.id=s.page_id JOIN document d ON d.id=p.document_id WHERE v.id=%s""",
        (str(viewport_id),),
    )
    return str(row["project_id"]) if row else None


def project_for_storey(storey_id: UUID | str) -> str | None:
    row = fetch_one("SELECT project_id FROM storey WHERE id=%s", (str(storey_id),))
    return str(row["project_id"]) if row else None


def project_for_spec(item_id: UUID | str) -> str | None:
    row = fetch_one("SELECT project_id FROM spec_item WHERE id=%s", (str(item_id),))
    return str(row["project_id"]) if row else None


def project_for_entity(entity_type: str, entity_id: UUID | str) -> str | None:
    if entity_type in {"sheet_set", "storey_stack", "height_stack"}:
        row = fetch_one("SELECT id FROM project WHERE id=%s", (str(entity_id),))
        return str(row["id"]) if row else None
    if entity_type == "sheet":
        return project_for_sheet(entity_id)
    if entity_type == "viewport":
        return project_for_viewport(entity_id)
    if entity_type == "storey":
        return project_for_storey(entity_id)
    if entity_type == "spec_item":
        return project_for_spec(entity_id)
    if entity_type == "scale":
        row = fetch_one(
            """SELECT d.project_id FROM scale_fit sf JOIN viewport v ON v.id=sf.viewport_id
               JOIN sheet s ON s.id=v.sheet_id JOIN page p ON p.id=s.page_id JOIN document d ON d.id=p.document_id
               WHERE sf.id=%s""",
            (str(entity_id),),
        )
        return str(row["project_id"]) if row else None
    return None
