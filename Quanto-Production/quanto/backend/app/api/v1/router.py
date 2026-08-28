from fastapi import APIRouter

from .routes import ceilings, confirmations, documents, floors, freeze, heights, projects, scale, specs, storeys, triage, viewports

api_router = APIRouter(prefix="/api/v1")
for route in (projects, documents, triage, viewports, storeys, scale, heights, specs, confirmations, freeze, floors, ceilings):
    api_router.include_router(route.router)
