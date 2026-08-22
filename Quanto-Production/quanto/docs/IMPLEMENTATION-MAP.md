# Pre implementation map

This document maps the supplied plan to production code. The planning documents in `docs/pre/` remain the authority for behavior; this file shows where each requirement is implemented.

| Pre stage | Frontend | API | Business logic | Persistent records |
|---|---|---|---|---|
| Upload / ingest | `frontend/src/features/pre/upload/` | `documents.py` | `modules/pre/ingest.py` | document, page, page_render |
| Drawing triage | Upload + Plans | `triage.py`, `viewports.py` | `modules/pre/triage.py` | sheet, viewport |
| Storey stack | Plans | `storeys.py` | `modules/pre/levels.py` | storey, confirmation |
| Scale | `features/pre/scale/` | `scale.py` | `modules/pre/scale.py` | scale_fit, confirmation |
| Height | `features/pre/height/` | `heights.py` | `modules/pre/height.py` | storey height fields, confirmation |
| Specifications | `features/pre/specifications/` | `specs.py` | `modules/pre/specifications.py` | spec_item, confirmation |
| Readiness / freeze | `features/pre/project-frame/` | `freeze.py` | `modules/pre/project_frame.py` | project.pre_frame, frame_version |

## Shared production systems

- PDF rendering and coordinate transforms: `backend/app/services/pdf/`
- Controlled model adapter: `backend/app/services/ai/`
- Content-hash confirmation: `backend/app/modules/pre/confirmations.py`
- Frozen-write protection: `backend/app/modules/pre/access.py`
- API contracts: `backend/app/api/v1/schemas.py` and `shared/contracts/openapi.json`
- PostgreSQL schema: `database/schema/001_pre.sql`
- Runtime originals/renders/crops: `storage/projects/{project_id}/`

## Exact product boundary

The app shell already exposes Pre, Takeoff, Review and BOQ. Only Pre routes and features are active. Future modules belong in the existing `features/` and `backend/app/modules/` boundaries and must consume `project-frame-v1`; they must not change or duplicate Pre state.

## Controlled model calls

1. Triage: one 150-DPI page image to `TriageOutput`.
2. Scale and height: selected viewport crops to `ScaleReading` or `HeightReading`.
3. Specifications: text-heavy included sheets to `SpecReading`.

The planned Pre provider is Gemini Flash (`AI_PROVIDER=gemini`). Its adapter sends images with the same closed Pydantic schemas and retries structured-output validation twice. The OpenAI adapter remains available for future modules and compatibility testing. Triage pages run concurrently with a hard maximum of four. A page that still fails remains visible as a full-page manual-review viewport instead of disappearing or crashing the drawing set.

`AI_PROVIDER=local` uses deterministic PDF text extraction and explicit manual review. It does not fabricate visual detections.
