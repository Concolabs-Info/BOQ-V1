from fastapi import APIRouter

from .routes import beams, ceilings, confirmations, documents, floors, freeze, heights, projects, roofs, scale, scope, specs, storeys, takeoff_workspace, triage, viewports

api_router = APIRouter(prefix="/api/v1")
for route in (projects, documents, triage, viewports, storeys, scale, heights, specs, confirmations, freeze, scope, floors, ceilings, roofs, beams, takeoff_workspace):
    api_router.include_router(route.router)
