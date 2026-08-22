from fastapi import APIRouter

from .routes import confirmations, documents, freeze, heights, projects, scale, specs, storeys, triage, viewports

api_router = APIRouter(prefix="/api/v1")
for route in (projects, documents, triage, viewports, storeys, scale, heights, specs, confirmations, freeze):
    api_router.include_router(route.router)
