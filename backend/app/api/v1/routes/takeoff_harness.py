from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException

from ....modules.takeoff.harness.capabilities import capability_registry
from ....modules.takeoff.harness.dependencies import dependency_contract
from ....modules.takeoff.harness.ownership import ownership_for
from ....modules.takeoff.harness.registry import get_expert, list_experts
from ....modules.takeoff.harness.state import latest_run, list_events
from ....modules.takeoff.harness.boq import production_boq_candidates

router = APIRouter(tags=["takeoff-element-harness"])


@router.get("/takeoff/harness/elements")
def harness_elements():
    return {
        "elements": [
            {
                "key": item.key,
                "runtime_key": item.runtime_key,
                "label": item.display_name,
                "scope_key": item.scope_key,
                "publishes": list(item.publishes),
                "consumes": list(item.consumes),
                "boq_ownership": list(item.boq_ownership),
                "strategies": list(item.strategies),
                "validation_focus": list(item.validation_focus),
                "geometry_is_boq": item.geometry_is_boq,
            }
            for item in list_experts()
        ],
        "shared_capabilities": [value.__dict__ | {"callable": None} for value in capability_registry().values()],
        "protected_existing": ["beams", "columns", "slab", "foundation"],
    }


@router.get("/projects/{project_id}/takeoff/harness/boq-candidates")
def harness_boq_candidates(project_id: UUID):
    try:
        return production_boq_candidates(str(project_id))
    except Exception as exc:
        # Empty quantities and unavailable quantities are materially different in a BOQ.
        # Keep the previous client rows and surface a visible service error.
        raise HTTPException(503, f"Production BOQ candidates are unavailable: {exc}") from exc


@router.get("/projects/{project_id}/takeoff/harness/{element}")
def harness_state(project_id: UUID, element: str):
    try:
        spec = get_expert(element)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    state = latest_run(project_id, spec.runtime_key)
    return {
        "element": spec.key,
        "runtime_key": spec.runtime_key,
        "state": state,
        "dependencies": dependency_contract(spec.key),
        "boq_ownership": list(ownership_for(spec.key)),
    }


@router.get("/projects/{project_id}/takeoff/harness/{element}/events")
def harness_events(project_id: UUID, element: str):
    try:
        spec = get_expert(element)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    return {"items": list_events(project_id, spec.runtime_key)}
