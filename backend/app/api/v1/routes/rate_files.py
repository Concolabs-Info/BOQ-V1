from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import Field, model_validator
from psycopg.errors import UniqueViolation

from ....database.connection import fetch_all, fetch_one, transaction
from ....database.json_value import Jsonb
from ..schemas import ApiModel

router = APIRouter(tags=["rate-files"])

ItemType = Literal["material", "labour", "machinery"]
OptionType = Literal[
    "main_item",
    "material_name",
    "supplier",
    "brand",
    "labour_name",
    "labour_group",
    "machinery_name",
    "machinery_source",
    "unit_type",
]

DEFAULT_UNIT_TYPES = ["m", "m2", "m3", "nr", "kg", "ton", "bag", "sheet", "litre"]
DEFAULT_OPTIONS: dict[str, list[str]] = {
    "main_item": [],
    "material_name": [],
    "supplier": [],
    "brand": [],
    "labour_name": [],
    "labour_group": [],
    "machinery_name": [],
    "machinery_source": [],
    "unit_type": list(DEFAULT_UNIT_TYPES),
}


class RateFileCreate(ApiModel):
    name: str = Field(min_length=1, max_length=160)


class RateFilePatch(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)


class MaterialAttributeSelection(ApiModel):
    attribute: str = Field(min_length=1, max_length=160)
    value: str = Field(min_length=1, max_length=160)

    @model_validator(mode="after")
    def trim_values(self):
        self.attribute = self.attribute.strip()
        self.value = self.value.strip()
        if not self.attribute or not self.value:
            raise ValueError("Material attribute and value are required")
        return self


class RateItemCreate(ApiModel):
    item_type: ItemType
    main_item: str = Field(min_length=1, max_length=240)
    material_name: str | None = Field(default=None, max_length=240)
    supplier: str | None = Field(default=None, max_length=240)
    brand: str | None = Field(default=None, max_length=240)
    material_attributes: list[MaterialAttributeSelection] = Field(default_factory=list)
    labour_name: str | None = Field(default=None, max_length=240)
    labour_group: str | None = Field(default=None, max_length=240)
    machinery_name: str | None = Field(default=None, max_length=240)
    machinery_source: str | None = Field(default=None, max_length=240)
    unit_type: str = Field(min_length=1, max_length=80)
    unit_detail: str | None = Field(default=None, max_length=160)
    rate: float = Field(ge=0)

    @model_validator(mode="after")
    def normalize_and_validate(self):
        self.main_item = self.main_item.strip()
        self.unit_type = self.unit_type.strip()
        if not self.main_item:
            raise ValueError("Main item is required")
        if not self.unit_type:
            raise ValueError("Unit type is required")
        for field_name in (
            "material_name",
            "supplier",
            "brand",
            "labour_name",
            "labour_group",
            "machinery_name",
            "machinery_source",
            "unit_detail",
        ):
            value = getattr(self, field_name)
            if value is not None:
                setattr(self, field_name, value.strip() or None)
        if self.item_type == "material" and not self.material_name:
            raise ValueError("Material name is required")
        if self.item_type != "material":
            self.material_attributes = []
        if self.item_type == "labour" and not self.labour_name:
            raise ValueError("Labour name is required")
        if self.item_type == "machinery" and not self.machinery_name:
            raise ValueError("Machinery name is required")
        return self


class RateItemPatch(ApiModel):
    item_type: ItemType | None = None
    main_item: str | None = Field(default=None, min_length=1, max_length=240)
    material_name: str | None = Field(default=None, max_length=240)
    supplier: str | None = Field(default=None, max_length=240)
    brand: str | None = Field(default=None, max_length=240)
    material_attributes: list[MaterialAttributeSelection] | None = None
    labour_name: str | None = Field(default=None, max_length=240)
    labour_group: str | None = Field(default=None, max_length=240)
    machinery_name: str | None = Field(default=None, max_length=240)
    machinery_source: str | None = Field(default=None, max_length=240)
    unit_type: str | None = Field(default=None, min_length=1, max_length=80)
    unit_detail: str | None = Field(default=None, max_length=160)
    rate: float | None = Field(default=None, ge=0)


class RateOptionCreate(ApiModel):
    option_type: OptionType
    value: str = Field(min_length=1, max_length=160)

    @model_validator(mode="after")
    def trim_value(self):
        self.value = self.value.strip()
        if not self.value:
            raise ValueError("Option value is required")
        return self


class MaterialAttributeCreate(ApiModel):
    material_name: str = Field(min_length=1, max_length=240)
    name: str = Field(min_length=1, max_length=160)

    @model_validator(mode="after")
    def trim_values(self):
        self.material_name = self.material_name.strip()
        self.name = self.name.strip()
        if not self.material_name:
            raise ValueError("Material name is required")
        if not self.name:
            raise ValueError("Attribute name is required")
        return self


class MaterialAttributeValueCreate(ApiModel):
    value: str = Field(min_length=1, max_length=160)

    @model_validator(mode="after")
    def trim_value(self):
        self.value = self.value.strip()
        if not self.value:
            raise ValueError("Attribute value is required")
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


def _require_material_attribute(project_id: UUID, attribute_id: UUID) -> dict:
    row = fetch_one(
        "SELECT * FROM rate_material_attribute WHERE id=%s AND project_id=%s",
        (str(attribute_id), str(project_id)),
    )
    if not row:
        raise HTTPException(404, "Material attribute not found")
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
    values: dict[str, list[str]] = {key: list(defaults) for key, defaults in DEFAULT_OPTIONS.items()}
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


@router.get("/projects/{project_id}/rate-material-attributes")
def list_material_attributes(project_id: UUID, material_name: str = Query(min_length=1, max_length=240)):
    _require_project(project_id)
    material = material_name.strip()
    if not material:
        raise HTTPException(422, "Material name is required")
    attributes = fetch_all(
        """SELECT id,project_id,material_name,name,created_at
           FROM rate_material_attribute
           WHERE project_id=%s AND material_name=%s
           ORDER BY name""",
        (str(project_id), material),
    )
    if not attributes:
        return {"attributes": []}
    ids = [str(row["id"]) for row in attributes]
    values = fetch_all(
        """SELECT id,attribute_id,value,created_at
           FROM rate_material_attribute_value
           WHERE attribute_id::text = ANY(%s)
           ORDER BY value""",
        (ids,),
    )
    values_by_attribute: dict[str, list[dict]] = {}
    for value in values:
        values_by_attribute.setdefault(str(value["attribute_id"]), []).append(value)
    for attribute in attributes:
        attribute["values"] = values_by_attribute.get(str(attribute["id"]), [])
    return {"attributes": attributes}


@router.post("/projects/{project_id}/rate-material-attributes", status_code=201)
def create_material_attribute(project_id: UUID, body: MaterialAttributeCreate):
    _require_project(project_id)
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO rate_material_attribute(project_id,material_name,name)
               VALUES (%s,%s,%s)
               ON CONFLICT(project_id,material_name,name) DO UPDATE SET name=excluded.name
               RETURNING id,project_id,material_name,name,created_at""",
            (str(project_id), body.material_name, body.name),
        ).fetchone()
    result = dict(row)
    result["values"] = []
    return result


@router.post("/projects/{project_id}/rate-material-attributes/{attribute_id}/values", status_code=201)
def create_material_attribute_value(project_id: UUID, attribute_id: UUID, body: MaterialAttributeValueCreate):
    _require_material_attribute(project_id, attribute_id)
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO rate_material_attribute_value(attribute_id,value)
               VALUES (%s,%s)
               ON CONFLICT(attribute_id,value) DO UPDATE SET value=excluded.value
               RETURNING id,attribute_id,value,created_at""",
            (str(attribute_id), body.value),
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
    item_type: ItemType | None = None,
):
    _require_rate_file(project_id, rate_file_id)
    clauses = ["project_id=%s", "rate_file_id=%s"]
    params: list[object] = [str(project_id), str(rate_file_id)]
    if item_type:
        clauses.append("item_type=%s")
        params.append(item_type)
    if search and search.strip():
        clauses.append(
            """(main_item ILIKE %s OR COALESCE(material_name,'') ILIKE %s OR COALESCE(supplier,'') ILIKE %s
                OR COALESCE(brand,'') ILIKE %s OR material_attributes::text ILIKE %s
                OR COALESCE(labour_name,'') ILIKE %s OR COALESCE(labour_group,'') ILIKE %s
                OR COALESCE(machinery_name,'') ILIKE %s OR COALESCE(machinery_source,'') ILIKE %s
                OR COALESCE(unit_type,'') ILIKE %s OR COALESCE(unit_detail,'') ILIKE %s)"""
        )
        needle = f"%{search.strip()}%"
        params.extend([needle] * 11)
    rows = fetch_all(
        f"""SELECT * FROM rate_item
            WHERE {" AND ".join(clauses)}
            ORDER BY main_item,item_type,material_name,labour_name,machinery_name""",
        tuple(params),
    )
    return {"items": rows}


@router.post("/projects/{project_id}/rate-files/{rate_file_id}/items", status_code=201)
def create_rate_item(project_id: UUID, rate_file_id: UUID, body: RateItemCreate):
    _require_rate_file(project_id, rate_file_id)
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO rate_item(
                 rate_file_id,project_id,item_type,main_item,material_name,supplier,brand,material_attributes,
                 labour_name,labour_group,machinery_name,machinery_source,unit_type,unit_detail,rate
               )
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING *""",
            (
                str(rate_file_id),
                str(project_id),
                body.item_type,
                body.main_item,
                body.material_name,
                body.supplier,
                body.brand,
                Jsonb([attribute.model_dump() for attribute in body.material_attributes]),
                body.labour_name,
                body.labour_group,
                body.machinery_name,
                body.machinery_source,
                body.unit_type,
                body.unit_detail,
                body.rate,
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
    for field_name in (
        "main_item",
        "material_name",
        "supplier",
        "brand",
        "labour_name",
        "labour_group",
        "machinery_name",
        "machinery_source",
        "unit_type",
        "unit_detail",
    ):
        if field_name in merged and merged[field_name] is not None:
            merged[field_name] = str(merged[field_name]).strip() or None
    if not merged.get("main_item"):
        raise HTTPException(422, "Main item is required")
    if not merged.get("unit_type"):
        raise HTTPException(422, "Unit type is required")
    if merged["item_type"] == "material" and not merged.get("material_name"):
        raise HTTPException(422, "Material name is required")
    material_attributes = merged.get("material_attributes") or []
    if merged["item_type"] != "material":
        material_attributes = []
    if merged["item_type"] == "labour" and not merged.get("labour_name"):
        raise HTTPException(422, "Labour name is required")
    if merged["item_type"] == "machinery" and not merged.get("machinery_name"):
        raise HTTPException(422, "Machinery name is required")
    with transaction() as conn:
        row = conn.execute(
            """UPDATE rate_item
               SET item_type=%s,main_item=%s,material_name=%s,supplier=%s,brand=%s,material_attributes=%s,
                   labour_name=%s,labour_group=%s,machinery_name=%s,machinery_source=%s,
                   unit_type=%s,unit_detail=%s,rate=%s,updated_at=now()
               WHERE id=%s AND rate_file_id=%s AND project_id=%s
               RETURNING *""",
            (
                merged["item_type"],
                merged["main_item"],
                merged["material_name"],
                merged.get("supplier"),
                merged.get("brand"),
                Jsonb([
                    attribute.model_dump() if hasattr(attribute, "model_dump") else attribute
                    for attribute in material_attributes
                ]),
                merged.get("labour_name"),
                merged.get("labour_group"),
                merged.get("machinery_name"),
                merged.get("machinery_source"),
                merged["unit_type"],
                merged.get("unit_detail"),
                merged["rate"],
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
