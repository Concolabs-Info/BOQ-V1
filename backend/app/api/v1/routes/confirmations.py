from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ....modules.pre.confirmations import confirm
from ....modules.pre.access import ensure_project_mutable, project_for_entity
from ..schemas import ConfirmationCreate

router = APIRouter(tags=["confirmations"])
ALLOWED = {"sheet", "sheet_set", "viewport", "storey_stack", "height_stack", "scale", "spec_item"}


@router.post("/confirmations", status_code=201)
def create_confirmation(body: ConfirmationCreate):
    if body.entity_type not in ALLOWED:
        raise HTTPException(400, "Unsupported confirmation entity type")
    pid = project_for_entity(body.entity_type, body.entity_id)
    if pid:
        try:
            ensure_project_mutable(pid)
        except PermissionError as exc:
            raise HTTPException(409, str(exc)) from exc
    try:
        return confirm(body.entity_type, body.entity_id, body.actor)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
