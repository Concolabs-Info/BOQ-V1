# Production implementation map

The planning documents remain the authority for behaviour. This file maps the current production implementation to the repository.

## Pre

| Pre stage | Frontend | API | Business logic | Persistent records |
|---|---|---|---|---|
| Upload / ingest | `frontend/src/features/pre/upload/` | `documents.py` | `modules/pre/ingest.py` | document, page, page_render |
| Drawing triage | Upload + Plans | `triage.py`, `viewports.py` | `modules/pre/triage.py` | sheet, viewport |
| Storey stack | Plans | `storeys.py` | `modules/pre/levels.py` | storey, confirmation |
| Scale | `features/pre/scale/` | `scale.py` | `modules/pre/scale.py` | scale_fit, confirmation |
| Height | `features/pre/height/` | `heights.py` | `modules/pre/height.py` | storey height fields, confirmation |
| Specifications | `features/pre/specifications/` | `specs.py` | `modules/pre/specifications.py` | spec_item, confirmation |
| Readiness / freeze | `features/pre/project-frame/` | `freeze.py` | `modules/pre/project_frame.py` | project.pre_frame, frame_version |

## Takeoff Scope

| Part | Implementation |
|---|---|
| Generic API | `backend/app/api/v1/routes/scope.py` |
| Shared deterministic engine | `backend/app/modules/takeoff/scope/engine.py` |
| Registry | `backend/app/modules/takeoff/scope/registry.py` |
| Element definitions | `backend/app/modules/takeoff/scope/elements/` |
| Questions | `backend/app/modules/takeoff/scope/questions.py` |
| Persistence | `database/schema/004_takeoff_scope.sql` |
| Frontend status | `frontend/src/features/scope/components/ScopeStatus.tsx` |
| Floor/Ceiling/Roof bridge | `backend/app/modules/takeoff/common.py`, `floors.py`, `ceilings.py`, `roofs.py` |

Scope reads `project-frame-v1`, makes no AI/model call, and never edits frozen Pre state. The ten element definitions are Columns, Beams, Slab, Floor, Ceiling, Doors & Windows, Walls, Roof, Stairs & Ramps and Foundation.

## Current production Takeoff analysis

- Floor — PostgreSQL-backed analysis/editing/quantities.
- Ceiling — PostgreSQL-backed analysis/editing/quantities, with Scope-controlled RCP vs confirmed Floor fallback.
- Roof — PostgreSQL-backed analysis/editing/quantities using Scope-selected primary roof viewports.
- Other Takeoff elements — Scope is production-backed now; Bind and later element-specific stages remain for later implementation.

## Shared production systems

- PDF rendering and coordinate transforms: `backend/app/services/pdf/`
- Controlled model adapter: `backend/app/services/ai/`
- Content-hash confirmation: `backend/app/modules/pre/confirmations.py`
- Frozen-write protection: `backend/app/modules/pre/access.py`
- API contracts: `backend/app/api/v1/schemas.py` and `shared/contracts/openapi.json`
- Runtime originals/renders/crops: `storage/projects/{project_id}/`
