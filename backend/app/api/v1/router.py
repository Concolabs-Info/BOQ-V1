from fastapi import APIRouter, Depends

from .routes import beams, ceilings, columns, confirmations, documents, doors_windows, floor_layers, floors, freeze, heights, platform, projects, roofs, scale, scope, specs, storeys, stairs_ramps, takeoff_harness, takeoff_workspace, triage, viewports, walls
from ...modules.platform.access import enforce_workspace_access

api_router = APIRouter(prefix="/api/v1")
workspace_routers = (
    projects, documents, triage, viewports, storeys, scale, heights, specs, confirmations,
    freeze, scope, floors, floor_layers, ceilings, roofs, beams, takeoff_harness,
    takeoff_workspace, walls, stairs_ramps, doors_windows, columns,
)
for route in workspace_routers:
    api_router.include_router(route.router, dependencies=[Depends(enforce_workspace_access)])
api_router.include_router(platform.router)
