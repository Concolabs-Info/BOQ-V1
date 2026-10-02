from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import Field, model_validator

from ....database.connection import fetch_all, fetch_one, transaction
from ..schemas import ApiModel

router = APIRouter(tags=["boq-rate-mappings"])

MappingSource = Literal["auto", "manual", "suggested"]
MappingStatus = Literal["applied", "suggested", "conflict", "unmatched"]


class RateFileSelectionPatch(ApiModel):
    rate_file_id: UUID | None = None


class RateMappingUpsert(ApiModel):
    row_signature: str = Field(min_length=1, max_length=600)
    rate_item_id: UUID
    source: MappingSource = "manual"
    status: MappingStatus = "applied"
    score: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def trim_signature(self):
        self.row_signature = self.row_signature.strip()
        return self


def _require_project(project_id: UUID) -> None:
    if not fetch_one("SELECT id FROM project WHERE id=%s", (str(project_id),)):
        raise HTTPException(404, "Project not found")


def _require_rate_file(project_id: UUID, rate_file_id: UUID) -> None:
    if not fetch_one("SELECT id FROM rate_file WHERE id=%s AND project_id=%s", (str(rate_file_id), str(project_id))):
        raise HTTPException(404, "Rate file not found")


def _require_rate_item(project_id: UUID, rate_file_id: UUID, rate_item_id: UUID) -> None:
    if not fetch_one(
        "SELECT id FROM rate_item WHERE id=%s AND rate_file_id=%s AND project_id=%s",
        (str(rate_item_id), str(rate_file_id), str(project_id)),
    ):
        raise HTTPException(404, "Rate item not found")


@router.get("/projects/{project_id}/boq/rate-mappings")
def get_boq_rate_mappings(project_id: UUID):
    _require_project(project_id)
    selection = fetch_one(
        """SELECT project_id,rate_file_id,created_at,updated_at
           FROM boq_rate_file_selection
           WHERE project_id=%s""",
        (str(project_id),),
    )
    rate_file_id = selection["rate_file_id"] if selection else None
    mappings = []
    if rate_file_id:
        mappings = fetch_all(
            """SELECT *
               FROM boq_rate_mapping
               WHERE project_id=%s AND rate_file_id=%s
               ORDER BY updated_at DESC""",
            (str(project_id), str(rate_file_id)),
        )
    return {"selection": selection or {"project_id": str(project_id), "rate_file_id": None}, "mappings": mappings}


@router.put("/projects/{project_id}/boq/rate-mappings/selection")
def save_boq_rate_file_selection(project_id: UUID, body: RateFileSelectionPatch):
    _require_project(project_id)
    if body.rate_file_id is not None:
        _require_rate_file(project_id, body.rate_file_id)
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO boq_rate_file_selection(project_id,rate_file_id)
               VALUES (%s,%s)
               ON CONFLICT(project_id) DO UPDATE
                 SET rate_file_id=excluded.rate_file_id,updated_at=now()
               RETURNING project_id,rate_file_id,created_at,updated_at""",
            (str(project_id), str(body.rate_file_id) if body.rate_file_id else None),
        ).fetchone()
    return dict(row)


@router.put("/projects/{project_id}/boq/rate-mappings/{rate_file_id}")
def upsert_boq_rate_mapping(project_id: UUID, rate_file_id: UUID, body: RateMappingUpsert):
    _require_rate_file(project_id, rate_file_id)
    _require_rate_item(project_id, rate_file_id, body.rate_item_id)
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO boq_rate_mapping(project_id,rate_file_id,rate_item_id,row_signature,source,status,score)
               VALUES (%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT(project_id,rate_file_id,row_signature) DO UPDATE
                 SET rate_item_id=excluded.rate_item_id,
                     source=excluded.source,
                     status=excluded.status,
                     score=excluded.score,
                     updated_at=now()
               RETURNING *""",
            (
                str(project_id),
                str(rate_file_id),
                str(body.rate_item_id),
                body.row_signature,
                body.source,
                body.status,
                body.score,
            ),
        ).fetchone()
    return dict(row)
