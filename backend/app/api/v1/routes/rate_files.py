from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import Field, model_validator
from psycopg.errors import UniqueViolation

from ....database.connection import fetch_all, fetch_one, transaction
from ..schemas import ApiModel

router = APIRouter(tags=["rate-files"])

OptionType = Literal["unit_type", "specification"]

DEFAULT_UNIT_TYPES = ["m", "m2", "m3", "nr", "kg", "ton", "bag", "sheet", "litre"]
DEFAULT_SPECIFICATIONS = ["Grade C25/30"]


class RateFileCreate(ApiModel):
    name: str = Field(min_length=1, max_length=160)


class RateFilePatch(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)


class RateItemCreate(ApiModel):
    material_name: str = Field(min_length=1, max_length=240)
    specification: str | None = Field(default=None, max_length=500)
    size: str | None = Field(default=None, max_length=160)
    unit_cost: float = Field(ge=0)
    markup_percent: float = Field(default=0, ge=0)
    unit_type: str = Field(min_length=1, max_length=80)
    custom_unit: str | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def custom_unit_matches_type(self):
        self.custom_unit = None
        self.unit_type = self.unit_type.strip()
        self.material_name = self.material_name.strip()
        if not self.material_name:
            raise ValueError("Material name is required")
        if not self.unit_type:
            raise ValueError("Unit type is required")
        if self.specification is not None:
            self.specification = self.specification.strip() or None
        if self.size is not None:
            self.size = self.size.strip() or None
        return self


class RateItemPatch(ApiModel):
    material_name: str | None = Field(default=None, min_length=1, max_length=240)
    specification: str | None = Field(default=None, max_length=500)
    size: str | None = Field(default=None, max_length=160)
    unit_cost: float | None = Field(default=None, ge=0)
    markup_percent: float | None = Field(default=None, ge=0)
    unit_type: str | None = Field(default=None, min_length=1, max_length=80)
    custom_unit: str | None = Field(default=None, max_length=40)


class RateOptionCreate(ApiModel):
    option_type: OptionType
    value: str = Field(min_length=1, max_length=160)

    @model_validator(mode="after")
    def trim_value(self):
        self.value = self.value.strip()
        if not self.value:
            raise ValueError("Option value is required")
        return self


def _require_project(project_id: UUID) -> None:
    if not fetch_one("SELECT id FROM project WHERE id=%s", (str(project_id),)):
        raise HTTPException(404, "Project not found")


def _require_rate_file(project_id: UUID, rate_file_id: UUID) -> dict:
    row = fetch_one("SELECT * FROM rate_file WHERE id=%s AND project_id=%s", (str(rate_file_id), str(project_id)))
    if not row:
        raise HTTPException(404, "Rate file not found")
    return row


def _require_rate_item(project_id: UUID, rate_file_id: UUID, item_id: UUID) -> dict:
    row = fetch_one(
        "SELECT * FROM rate_item WHERE id=%s AND rate_file_id=%s AND project_id=%s",
        (str(item_id), str(rate_file_id), str(project_id)),
    )
    if not row:
        raise HTTPException(404, "Rate item not found")
    return row


@router.get("/projects/{project_id}/rate-options")
def list_rate_options(project_id: UUID):
    _require_project(project_id)
    rows = fetch_all(
        """SELECT option_type,value
           FROM rate_option
           WHERE project_id=%s
           ORDER BY option_type,value""",
        (str(project_id),),
    )
    values: dict[str, list[str]] = {"unit_type": list(DEFAULT_UNIT_TYPES), "specification": list(DEFAULT_SPECIFICATIONS)}
    for row in rows:
        current = values.setdefault(row["option_type"], [])
        if row["value"] not in current:
            current.append(row["value"])
    return {"options": values}


@router.post("/projects/{project_id}/rate-options", status_code=201)
def create_rate_option(project_id: UUID, body: RateOptionCreate):
    _require_project(project_id)
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO rate_option(project_id,option_type,value)
               VALUES (%s,%s,%s)
               ON CONFLICT(project_id,option_type,value) DO UPDATE SET value=excluded.value
               RETURNING id,project_id,option_type,value,created_at""",
            (str(project_id), body.option_type, body.value),
        ).fetchone()
    return dict(row)


@router.get("/projects/{project_id}/rate-files")
def list_rate_files(project_id: UUID):
    _require_project(project_id)
    rows = fetch_all(
        """SELECT rf.*, count(ri.id)::int AS item_count
           FROM rate_file rf
           LEFT JOIN rate_item ri ON ri.rate_file_id=rf.id
           WHERE rf.project_id=%s
           GROUP BY rf.id
           ORDER BY rf.updated_at DESC, rf.created_at DESC""",
        (str(project_id),),
    )
    return {"rate_files": rows}


@router.post("/projects/{project_id}/rate-files", status_code=201)
def create_rate_file(project_id: UUID, body: RateFileCreate):
    _require_project(project_id)
    try:
        with transaction() as conn:
            row = conn.execute(
                """INSERT INTO rate_file(project_id,name)
                   VALUES (%s,%s)
                   RETURNING *, 0::int AS item_count""",
                (str(project_id), body.name.strip()),
            ).fetchone()
    except UniqueViolation as exc:
        raise HTTPException(409, "A rate file with this name already exists for this project") from exc
    return dict(row)


@router.patch("/projects/{project_id}/rate-files/{rate_file_id}")
def update_rate_file(project_id: UUID, rate_file_id: UUID, body: RateFilePatch):
    _require_rate_file(project_id, rate_file_id)
    data = body.model_dump(exclude_unset=True)
    if not data:
        row = _require_rate_file(project_id, rate_file_id)
        row["item_count"] = int(fetch_one("SELECT count(*) AS n FROM rate_item WHERE rate_file_id=%s", (str(rate_file_id),))["n"])
        return row
    try:
        with transaction() as conn:
            row = conn.execute(
                """UPDATE rate_file SET name=%s,updated_at=now()
                   WHERE id=%s AND project_id=%s
                   RETURNING *""",
                (data["name"].strip(), str(rate_file_id), str(project_id)),
            ).fetchone()
    except UniqueViolation as exc:
        raise HTTPException(409, "A rate file with this name already exists for this project") from exc
    result = dict(row)
    result["item_count"] = int(fetch_one("SELECT count(*) AS n FROM rate_item WHERE rate_file_id=%s", (str(rate_file_id),))["n"])
    return result


@router.delete("/projects/{project_id}/rate-files/{rate_file_id}", status_code=204)
def delete_rate_file(project_id: UUID, rate_file_id: UUID):
    with transaction() as conn:
        row = conn.execute(
            "DELETE FROM rate_file WHERE id=%s AND project_id=%s RETURNING id",
            (str(rate_file_id), str(project_id)),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Rate file not found")


@router.get("/projects/{project_id}/rate-files/{rate_file_id}/items")
def list_rate_items(
    project_id: UUID,
    rate_file_id: UUID,
    search: str | None = Query(default=None, max_length=200),
):
    _require_rate_file(project_id, rate_file_id)
    clauses = ["project_id=%s", "rate_file_id=%s"]
    params: list[object] = [str(project_id), str(rate_file_id)]
    if search and search.strip():
        clauses.append("(material_name ILIKE %s OR COALESCE(specification,'') ILIKE %s OR COALESCE(size,'') ILIKE %s)")
        needle = f"%{search.strip()}%"
        params.extend([needle, needle, needle])
    rows = fetch_all(
        f"""SELECT * FROM rate_item
            WHERE {" AND ".join(clauses)}
            ORDER BY material_name,specification,size""",
        tuple(params),
    )
    return {"items": rows}


@router.post("/projects/{project_id}/rate-files/{rate_file_id}/items", status_code=201)
def create_rate_item(project_id: UUID, rate_file_id: UUID, body: RateItemCreate):
    _require_rate_file(project_id, rate_file_id)
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO rate_item(rate_file_id,project_id,material_name,specification,size,unit_cost,markup_percent,unit_type,custom_unit)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING *""",
            (
                str(rate_file_id),
                str(project_id),
                body.material_name,
                body.specification,
                body.size,
                body.unit_cost,
                body.markup_percent,
                body.unit_type,
                body.custom_unit,
            ),
        ).fetchone()
        conn.execute("UPDATE rate_file SET updated_at=now() WHERE id=%s", (str(rate_file_id),))
    return dict(row)


@router.patch("/projects/{project_id}/rate-files/{rate_file_id}/items/{item_id}")
def update_rate_item(project_id: UUID, rate_file_id: UUID, item_id: UUID, body: RateItemPatch):
    current = _require_rate_item(project_id, rate_file_id, item_id)
    data = body.model_dump(exclude_unset=True)
    if not data:
        return current
    merged = {**current, **data}
    if "material_name" in merged and isinstance(merged["material_name"], str):
        merged["material_name"] = merged["material_name"].strip()
    if "specification" in merged and merged["specification"] is not None:
        merged["specification"] = str(merged["specification"]).strip() or None
    if "size" in merged and merged["size"] is not None:
        merged["size"] = str(merged["size"]).strip() or None
    merged["unit_type"] = str(merged["unit_type"]).strip()
    merged["custom_unit"] = None
    with transaction() as conn:
        row = conn.execute(
            """UPDATE rate_item
               SET material_name=%s,specification=%s,size=%s,unit_cost=%s,markup_percent=%s,unit_type=%s,custom_unit=%s,updated_at=now()
               WHERE id=%s AND rate_file_id=%s AND project_id=%s
               RETURNING *""",
            (
                merged["material_name"],
                merged.get("specification"),
                merged.get("size"),
                merged["unit_cost"],
                merged["markup_percent"],
                merged["unit_type"],
                merged["custom_unit"],
                str(item_id),
                str(rate_file_id),
                str(project_id),
            ),
        ).fetchone()
        conn.execute("UPDATE rate_file SET updated_at=now() WHERE id=%s", (str(rate_file_id),))
    return dict(row)


@router.delete("/projects/{project_id}/rate-files/{rate_file_id}/items/{item_id}", status_code=204)
def delete_rate_item(project_id: UUID, rate_file_id: UUID, item_id: UUID):
    with transaction() as conn:
        row = conn.execute(
            """DELETE FROM rate_item
               WHERE id=%s AND rate_file_id=%s AND project_id=%s
               RETURNING id""",
            (str(item_id), str(rate_file_id), str(project_id)),
        ).fetchone()
        if row:
            conn.execute("UPDATE rate_file SET updated_at=now() WHERE id=%s", (str(rate_file_id),))
    if not row:
        raise HTTPException(404, "Rate item not found")
