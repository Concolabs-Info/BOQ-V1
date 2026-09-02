from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException

from ....modules.takeoff.workspace_state import (
    load_workspace_state,
    save_workspace_state,
)

router = APIRouter(tags=["takeoff-workspace"])


@router.get("/projects/{project_id}/takeoff/workspace-state")
def get_takeoff_workspace_state(project_id: UUID):
    return {"state": load_workspace_state(project_id)}


@router.put("/projects/{project_id}/takeoff/workspace-state")
def update_takeoff_workspace_state(project_id: UUID, body: dict[str, Any]):
    state = body.get("state")
    if not isinstance(state, dict):
        raise HTTPException(422, "state must be an object")
    try:
        return {"state": save_workspace_state(project_id, state)}
    except ValueError as exc:
        raise HTTPException(413, str(exc)) from exc
