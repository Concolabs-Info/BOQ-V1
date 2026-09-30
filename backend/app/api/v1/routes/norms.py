from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import Field, model_validator

from ....database.connection import fetch_all, fetch_one, transaction
from ..schemas import ApiModel

router = APIRouter(tags=["norms"])

NormItemType = Literal["material", "labor", "machinery", "percentage"]
NormOptionType = Literal["norm_material_unit", "norm_labor_unit", "norm_machinery_unit"]

DEFAULT_NORM_OPTIONS: dict[str, list[str]] = {
    "norm_material_unit": ["m", "m2", "m3", "nr", "kg", "ton", "bag", "sheet", "litre"],
    "norm_labor_unit": ["minute", "hour", "day"],
    "norm_machinery_unit": ["hour", "day", "shift", "trip"],
}


class NormChildInput(ApiModel):
    item_type: NormItemType
    name: str = Field(min_length=1, max_length=240)
    quantity: float = Field(ge=0)
    unit: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def trim_values(self):
        self.name = self.name.strip()
        self.unit = self.unit.strip() or None if self.unit is not None else None
        if not self.name:
            raise ValueError("Name is required")
        if self.item_type != "percentage" and not self.unit:
            raise ValueError("Unit is required")
        return self


class NormItemCreate(ApiModel):
    main_item_name: str = Field(min_length=1, max_length=240)
    items: list[NormChildInput] = Field(min_length=1)

    @model_validator(mode="after")
    def trim_values(self):
        self.main_item_name = self.main_item_name.strip()
        if not self.main_item_name:
            raise ValueError("Main item name is required")
        if not self.items:
            raise ValueError("Add at least one norm row")
        return self


class NormItemPatch(NormItemCreate):
    pass


class NormOptionCreate(ApiModel):
    option_type: NormOptionType
    value: str = Field(min_length=1, max_length=160)

    @model_validator(mode="after")
    def trim_value(self):
        self.value = self.value.strip()
        if not self.value:
            raise ValueError("Option value is required")
        return self


class RateBreakdownItemCreate(ApiModel):
    title: str = Field(min_length=1, max_length=240)
    code: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def trim_values(self):
        self.title = self.title.strip()
        self.code = self.code.strip() or None if self.code is not None else None
        self.description = self.description.strip() or None if self.description is not None else None
        if not self.title:
            raise ValueError("Title is required")
        return self


class RateBreakdownItemPatch(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    code: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=1000)


def _require_project(project_id: UUID) -> None:
    if not fetch_one("SELECT id FROM project WHERE id=%s", (str(project_id),)):
        raise HTTPException(404, "Project not found")


def _require_norm_group(project_id: UUID, item_id: UUID) -> dict:
    row = fetch_one("SELECT * FROM norm_group WHERE id=%s AND project_id=%s", (str(item_id), str(project_id)))
    if not row:
        raise HTTPException(404, "Norm item not found")
    return row


def _group_norm_items(groups: list[dict], children: list[dict]) -> list[dict]:
    by_group: dict[str, list[dict]] = {}
    for child in children:
        by_group.setdefault(str(child["norm_group_id"]), []).append(child)
    result = []
    for group in groups:
        item = dict(group)
        item["items"] = by_group.get(str(group["id"]), [])
        result.append(item)
    return result


def _require_rate_breakdown_item(project_id: UUID, item_id: UUID) -> dict:
    row = fetch_one("SELECT * FROM rate_breakdown_item WHERE id=%s AND project_id=%s", (str(item_id), str(project_id)))
    if not row:
        raise HTTPException(404, "Rate breakdown item not found")
    return row


@router.get("/projects/{project_id}/norm-options")
def list_norm_options(project_id: UUID):
    _require_project(project_id)
    rows = fetch_all(
        """SELECT option_type,value
           FROM norm_option
           WHERE project_id=%s
           ORDER BY option_type,value""",
        (str(project_id),),
    )
    options = {key: list(values) for key, values in DEFAULT_NORM_OPTIONS.items()}
    for row in rows:
        values = options.setdefault(row["option_type"], [])
        if row["value"] not in values:
            values.append(row["value"])
    return {"options": options}


@router.post("/projects/{project_id}/norm-options", status_code=201)
def create_norm_option(project_id: UUID, body: NormOptionCreate):
    _require_project(project_id)
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO norm_option(project_id,option_type,value)
               VALUES (%s,%s,%s)
               ON CONFLICT(project_id,option_type,value) DO UPDATE SET value=excluded.value
               RETURNING id,project_id,option_type,value,created_at""",
            (str(project_id), body.option_type, body.value),
        ).fetchone()
    return dict(row)


@router.get("/projects/{project_id}/norm-items")
def list_norm_items(project_id: UUID, item_type: NormItemType | None = None):
    _require_project(project_id)
    groups = fetch_all(
        """SELECT * FROM norm_group
           WHERE project_id=%s
           ORDER BY updated_at DESC, created_at DESC""",
        (str(project_id),),
    )
    if not groups:
        return {"items": []}
    group_ids = [str(group["id"]) for group in groups]
    if item_type:
        children = fetch_all(
            """SELECT * FROM norm_item
               WHERE project_id=%s AND norm_group_id::text = ANY(%s) AND item_type=%s
               ORDER BY norm_group_id,sort_order,created_at""",
            (str(project_id), group_ids, item_type),
        )
        allowed_group_ids = {str(child["norm_group_id"]) for child in children}
        groups = [group for group in groups if str(group["id"]) in allowed_group_ids]
    else:
        children = fetch_all(
            """SELECT * FROM norm_item
               WHERE project_id=%s AND norm_group_id::text = ANY(%s)
               ORDER BY norm_group_id,sort_order,created_at""",
            (str(project_id), group_ids),
        )
    return {"items": _group_norm_items(groups, children)}


@router.post("/projects/{project_id}/norm-items", status_code=201)
def create_norm_item(project_id: UUID, body: NormItemCreate):
    _require_project(project_id)
    with transaction() as conn:
        group = conn.execute(
            """INSERT INTO norm_group(project_id,main_item_name)
               VALUES (%s,%s)
               RETURNING *""",
            (str(project_id), body.main_item_name),
        ).fetchone()
        for index, item in enumerate(body.items):
            conn.execute(
                """INSERT INTO norm_item(project_id,norm_group_id,item_type,name,quantity,unit,sort_order)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (str(project_id), str(group["id"]), item.item_type, item.name, item.quantity, item.unit, index),
            )
    result = dict(group)
    result["items"] = fetch_all(
        """SELECT * FROM norm_item
           WHERE norm_group_id=%s AND project_id=%s
           ORDER BY sort_order,created_at""",
        (str(group["id"]), str(project_id)),
    )
    return result


@router.patch("/projects/{project_id}/norm-items/{item_id}")
def update_norm_item(project_id: UUID, item_id: UUID, body: NormItemPatch):
    _require_norm_group(project_id, item_id)
    with transaction() as conn:
        group = conn.execute(
            """UPDATE norm_group
               SET main_item_name=%s,updated_at=now()
               WHERE id=%s AND project_id=%s
               RETURNING *""",
            (body.main_item_name, str(item_id), str(project_id)),
        ).fetchone()
        conn.execute(
            "DELETE FROM norm_item WHERE norm_group_id=%s AND project_id=%s",
            (str(item_id), str(project_id)),
        )
        for index, item in enumerate(body.items):
            conn.execute(
                """INSERT INTO norm_item(project_id,norm_group_id,item_type,name,quantity,unit,sort_order)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (str(project_id), str(item_id), item.item_type, item.name, item.quantity, item.unit, index),
            )
    result = dict(group)
    result["items"] = fetch_all(
        """SELECT * FROM norm_item
           WHERE norm_group_id=%s AND project_id=%s
           ORDER BY sort_order,created_at""",
        (str(item_id), str(project_id)),
    )
    return result


@router.delete("/projects/{project_id}/norm-items/{item_id}", status_code=204)
def delete_norm_item(project_id: UUID, item_id: UUID):
    with transaction() as conn:
        row = conn.execute(
            "DELETE FROM norm_group WHERE id=%s AND project_id=%s RETURNING id",
            (str(item_id), str(project_id)),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Norm item not found")


@router.get("/projects/{project_id}/rate-breakdown-items")
def list_rate_breakdown_items(project_id: UUID):
    _require_project(project_id)
    rows = fetch_all(
        """SELECT * FROM rate_breakdown_item
           WHERE project_id=%s
           ORDER BY updated_at DESC, created_at DESC""",
        (str(project_id),),
    )
    return {"items": rows}


@router.post("/projects/{project_id}/rate-breakdown-items", status_code=201)
def create_rate_breakdown_item(project_id: UUID, body: RateBreakdownItemCreate):
    _require_project(project_id)
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO rate_breakdown_item(project_id,code,title,description)
               VALUES (%s,%s,%s,%s)
               RETURNING *""",
            (str(project_id), body.code, body.title, body.description),
        ).fetchone()
    return dict(row)


@router.patch("/projects/{project_id}/rate-breakdown-items/{item_id}")
def update_rate_breakdown_item(project_id: UUID, item_id: UUID, body: RateBreakdownItemPatch):
    current = _require_rate_breakdown_item(project_id, item_id)
    data = body.model_dump(exclude_unset=True)
    merged = {**current, **data}
    title = str(merged.get("title") or "").strip()
    code = str(merged.get("code") or "").strip() or None
    description = str(merged.get("description") or "").strip() or None
    if not title:
        raise HTTPException(422, "Title is required")
    with transaction() as conn:
        row = conn.execute(
            """UPDATE rate_breakdown_item
               SET code=%s,title=%s,description=%s,updated_at=now()
               WHERE id=%s AND project_id=%s
               RETURNING *""",
            (code, title, description, str(item_id), str(project_id)),
        ).fetchone()
    return dict(row)


@router.delete("/projects/{project_id}/rate-breakdown-items/{item_id}", status_code=204)
def delete_rate_breakdown_item(project_id: UUID, item_id: UUID):
    with transaction() as conn:
        row = conn.execute(
            "DELETE FROM rate_breakdown_item WHERE id=%s AND project_id=%s RETURNING id",
            (str(item_id), str(project_id)),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Rate breakdown item not found")
