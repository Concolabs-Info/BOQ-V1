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


class RateBreakdownRowInput(ApiModel):
    item_type: NormItemType
    description: str = Field(min_length=1, max_length=240)
    unit: str | None = Field(default=None, max_length=80)
    quantity: float = Field(ge=0)
    rate_item_id: UUID | None = None
    selected_rate_label: str | None = Field(default=None, max_length=240)
    selected_rate: float | None = Field(default=None, ge=0)
    sort_order: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def trim_values(self):
        self.description = self.description.strip()
        self.unit = self.unit.strip() or None if self.unit is not None else None
        self.selected_rate_label = self.selected_rate_label.strip() or None if self.selected_rate_label is not None else None
        if not self.description:
            raise ValueError("Item description is required")
        if self.item_type != "percentage" and not self.unit:
            raise ValueError("Unit is required")
        if self.item_type == "percentage":
            self.rate_item_id = None
            self.selected_rate = None
            self.selected_rate_label = None
        return self


class RateBreakdownItemCreate(ApiModel):
    norm_group_id: UUID
    rate_file_id: UUID
    main_item_name: str = Field(min_length=1, max_length=240)
    analysis_quantity: float = Field(default=1, gt=0)
    analysis_unit: str = Field(default="cube", min_length=1, max_length=80)
    rows: list[RateBreakdownRowInput] = Field(min_length=1)

    @model_validator(mode="after")
    def trim_values(self):
        self.main_item_name = self.main_item_name.strip()
        self.analysis_unit = self.analysis_unit.strip()
        if not self.main_item_name:
            raise ValueError("Main item name is required")
        if not self.analysis_unit:
            raise ValueError("Analysis unit is required")
        if not self.rows:
            raise ValueError("Add at least one breakdown row")
        return self


class RateBreakdownItemPatch(RateBreakdownItemCreate):
    pass


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


def _require_rate_file(project_id: UUID, rate_file_id: UUID) -> dict:
    row = fetch_one("SELECT * FROM rate_file WHERE id=%s AND project_id=%s", (str(rate_file_id), str(project_id)))
    if not row:
        raise HTTPException(404, "Rate file not found")
    return row


def _require_rate_item(project_id: UUID, rate_file_id: UUID, rate_item_id: UUID) -> dict:
    row = fetch_one(
        "SELECT * FROM rate_item WHERE id=%s AND rate_file_id=%s AND project_id=%s",
        (str(rate_item_id), str(rate_file_id), str(project_id)),
    )
    if not row:
        raise HTTPException(404, "Rate item not found")
    return row


def _rate_item_name(item: dict) -> str:
    if item["item_type"] == "material":
        return item.get("material_name") or "Unnamed material"
    if item["item_type"] == "labour":
        return item.get("labour_name") or "Unnamed labour"
    if item["item_type"] == "machinery":
        return item.get("machinery_name") or "Unnamed machinery"
    return item.get("percentage_name") or "Unnamed percentage"


def _rate_item_label(item: dict) -> str:
    details: list[str] = []
    if item["item_type"] == "material":
        details.extend([item.get("supplier"), item.get("brand")])
        details.extend(f"{attribute.get('attribute')}: {attribute.get('value')}" for attribute in (item.get("material_attributes") or []))
    elif item["item_type"] == "labour":
        details.append(item.get("labour_group"))
    elif item["item_type"] == "machinery":
        details.extend([item.get("machinery_source"), item.get("machinery_location")])
    unit = " ".join(value for value in [item.get("unit_type"), item.get("unit_detail")] if value)
    if unit:
        details.append(unit)
    text = " · ".join(str(value) for value in details if value)
    suffix = f" ({text})" if text else ""
    return f"{_rate_item_name(item)}{suffix}"


def _rate_item_type_for_norm(item_type: str) -> str:
    return "labour" if item_type == "labor" else item_type


def _round_money(value: float) -> float:
    return round(value + 0.0000001, 2)


def _build_breakdown_rows(project_id: UUID, rate_file_id: UUID, rows: list[RateBreakdownRowInput]) -> list[dict]:
    subtotal = 0.0
    built: list[dict] = []
    for index, row in enumerate(rows):
        selected_rate = None
        selected_rate_label = None
        amount = None
        rate_item_id = None
        if row.item_type == "percentage":
            amount = _round_money(subtotal * (row.quantity / 100))
            subtotal += amount
        elif row.rate_item_id:
            rate_item = _require_rate_item(project_id, rate_file_id, row.rate_item_id)
            expected_type = _rate_item_type_for_norm(row.item_type)
            if rate_item["item_type"] != expected_type:
                raise HTTPException(422, "Selected rate type does not match the breakdown row")
            selected_rate = float(rate_item["rate"])
            selected_rate_label = _rate_item_label(rate_item)
            amount = _round_money(row.quantity * selected_rate)
            subtotal += amount
            rate_item_id = str(row.rate_item_id)
        elif row.selected_rate is not None:
            selected_rate = row.selected_rate
            selected_rate_label = row.selected_rate_label or "Manual rate"
            amount = _round_money(row.quantity * selected_rate)
            subtotal += amount
        built.append(
            {
                "item_type": row.item_type,
                "description": row.description,
                "unit": row.unit,
                "quantity": row.quantity,
                "rate_item_id": rate_item_id,
                "selected_rate_label": selected_rate_label,
                "selected_rate": selected_rate,
                "amount": amount,
                "sort_order": row.sort_order if row.sort_order is not None else index,
            }
        )
    return built


def _summaries(total: float, analysis_quantity: float, analysis_unit: str) -> dict:
    basis_rate = total / analysis_quantity if analysis_quantity else total
    ft3_rate = basis_rate / 100
    m3_rate = ft3_rate * 35.3147
    return {
        "total": _round_money(total),
        "rate_for_unit": _round_money(basis_rate),
        "rate_say_unit": _round_money(basis_rate),
        "rate_say_ft3": _round_money(ft3_rate),
        "rate_say_m3": _round_money(m3_rate),
        "analysis_quantity": analysis_quantity,
        "analysis_unit": analysis_unit,
    }


def _attach_rate_breakdown_rows(items: list[dict]) -> list[dict]:
    if not items:
        return []
    ids = [str(item["id"]) for item in items]
    rows = fetch_all(
        """SELECT * FROM rate_breakdown_row
           WHERE rate_breakdown_item_id::text = ANY(%s)
           ORDER BY rate_breakdown_item_id,sort_order,created_at""",
        (ids,),
    )
    by_parent: dict[str, list[dict]] = {}
    for row in rows:
        by_parent.setdefault(str(row["rate_breakdown_item_id"]), []).append(row)
    result = []
    for item in items:
        entry = dict(item)
        entry["main_item_name"] = entry.get("main_item_name") or entry.get("title") or "Untitled analysis"
        entry["analysis_quantity"] = float(entry.get("analysis_quantity") or 1)
        entry["analysis_unit"] = entry.get("analysis_unit") or "cube"
        entry["rows"] = by_parent.get(str(entry["id"]), [])
        total = sum(float(row["amount"] or 0) for row in entry["rows"])
        entry["summary"] = _summaries(total, entry["analysis_quantity"], entry["analysis_unit"])
        result.append(entry)
    return result


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
    return {"items": _attach_rate_breakdown_rows(rows)}


@router.post("/projects/{project_id}/rate-breakdown-items", status_code=201)
def create_rate_breakdown_item(project_id: UUID, body: RateBreakdownItemCreate):
    _require_project(project_id)
    norm_group = _require_norm_group(project_id, body.norm_group_id)
    _require_rate_file(project_id, body.rate_file_id)
    built_rows = _build_breakdown_rows(project_id, body.rate_file_id, body.rows)
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO rate_breakdown_item(project_id,norm_group_id,rate_file_id,main_item_name,title,analysis_quantity,analysis_unit)
               VALUES (%s,%s,%s,%s,%s,%s,%s)
               RETURNING *""",
            (
                str(project_id),
                str(norm_group["id"]),
                str(body.rate_file_id),
                body.main_item_name,
                body.main_item_name,
                body.analysis_quantity,
                body.analysis_unit,
            ),
        ).fetchone()
        for index, child in enumerate(built_rows):
            conn.execute(
                """INSERT INTO rate_breakdown_row(
                     rate_breakdown_item_id,project_id,item_type,description,unit,quantity,rate_item_id,
                     selected_rate_label,selected_rate,amount,sort_order
                   )
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    str(row["id"]),
                    str(project_id),
                    child["item_type"],
                    child["description"],
                    child["unit"],
                    child["quantity"],
                    child["rate_item_id"],
                    child["selected_rate_label"],
                    child["selected_rate"],
                    child["amount"],
                    child["sort_order"] if child["sort_order"] is not None else index,
                ),
            )
    return _attach_rate_breakdown_rows([dict(row)])[0]


@router.patch("/projects/{project_id}/rate-breakdown-items/{item_id}")
def update_rate_breakdown_item(project_id: UUID, item_id: UUID, body: RateBreakdownItemPatch):
    _require_rate_breakdown_item(project_id, item_id)
    norm_group = _require_norm_group(project_id, body.norm_group_id)
    _require_rate_file(project_id, body.rate_file_id)
    built_rows = _build_breakdown_rows(project_id, body.rate_file_id, body.rows)
    with transaction() as conn:
        row = conn.execute(
            """UPDATE rate_breakdown_item
               SET norm_group_id=%s,rate_file_id=%s,main_item_name=%s,title=%s,analysis_quantity=%s,analysis_unit=%s,updated_at=now()
               WHERE id=%s AND project_id=%s
               RETURNING *""",
            (
                str(norm_group["id"]),
                str(body.rate_file_id),
                body.main_item_name,
                body.main_item_name,
                body.analysis_quantity,
                body.analysis_unit,
                str(item_id),
                str(project_id),
            ),
        ).fetchone()
        conn.execute(
            "DELETE FROM rate_breakdown_row WHERE rate_breakdown_item_id=%s AND project_id=%s",
            (str(item_id), str(project_id)),
        )
        for index, child in enumerate(built_rows):
            conn.execute(
                """INSERT INTO rate_breakdown_row(
                     rate_breakdown_item_id,project_id,item_type,description,unit,quantity,rate_item_id,
                     selected_rate_label,selected_rate,amount,sort_order
                   )
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (
                    str(item_id),
                    str(project_id),
                    child["item_type"],
                    child["description"],
                    child["unit"],
                    child["quantity"],
                    child["rate_item_id"],
                    child["selected_rate_label"],
                    child["selected_rate"],
                    child["amount"],
                    child["sort_order"] if child["sort_order"] is not None else index,
                ),
            )
    return _attach_rate_breakdown_rows([dict(row)])[0]


@router.delete("/projects/{project_id}/rate-breakdown-items/{item_id}", status_code=204)
def delete_rate_breakdown_item(project_id: UUID, item_id: UUID):
    with transaction() as conn:
        row = conn.execute(
            "DELETE FROM rate_breakdown_item WHERE id=%s AND project_id=%s RETURNING id",
            (str(item_id), str(project_id)),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Rate breakdown item not found")
