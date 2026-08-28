# Quanto — Production Pre + Floor + Ceiling + Roof

This repository is the current production Quanto codebase. It preserves the supplied **demo UI and workflow** and replaces demo Floor/Ceiling/Roof data with real PostgreSQL-backed project data and real drawing analysis. The existing demo-derived workflow UI remains the visual contract.

Visible product navigation remains unchanged:

```text
Pre | Takeoff | Review | BOQ
```

Implemented production modules in this delivery:

```text
Pre
Upload → Plans → Scale → Height → Specifications → Start Takeoff

Takeoff
Floor   → Dimension | Workbook | 3D
Ceiling → Dimension | Workbook | 3D
Roof    → Dimension | Workbook | 3D
```

Other Takeoff elements, Review and BOQ remain in the existing project exactly where they were and can be implemented later. The Projects library is the application entry point and can be reached again from the workflow navigation.

## What is production-backed now

### Pre
- Multi-PDF upload and SHA-256 source records.
- PyMuPDF page metadata and 72/150 DPI renders.
- Drawing/sheet/viewport triage and editable viewport geometry.
- Storey stack, typical groups and height evidence.
- Printed/manual scale handling and confirmations.
- Specification/schedule/notes extraction.
- Content-hash confirmation and stale-on-edit behaviour.
- Frozen Project Frame gate before Takeoff.

### Floor
- Uses the confirmed Pre plan viewport and confirmed scale.
- OpenAI structured vision reads physical FloorSpace geometry in exact crop pixels.
- Deterministic code calculates areas/perimeters from confirmed scale.
- Supports room/space polygons, holes, void/open-to-below exclusions, external floors, balconies/terraces, landings, under-stair areas and doorway/connector strips.
- Open-plan functional zones can carry explicit different finish evidence without duplicating physical room geometry.
- Floor finish catalog and room rules are extracted from project schedules/specifications.
- Supports direct finish tags/codes plus room-rule fallback; unresolved evidence remains visibly unassigned for QS review.
- Floor-related work data model covers screed, waterproofing, underlay, insulation/membranes, sealer and skirting.
- Skirting is measured linearly and retained as reviewable edges.
- AI output never becomes official measurement by itself: invalid/out-of-bounds/overlapping geometry is rejected and quantities are calculated by code.
- User drawing/family/status edits in the existing Dimension UI persist back to PostgreSQL.
- Workbook overrides/confirmation state persists.

### Ceiling
- Reuses confirmed FloorSpace geometry when there is no separate RCP, as specified in the ceiling plan.
- Uses a real RCP/ceiling-plan viewport when Pre has identified one and its scale is confirmed.
- Extracts C01/C02/etc ceiling/soffit definitions and room rules from project specification evidence.
- Supports flat, suspended, exposed/external soffit, dropped, raked/sloped, vaulted, multi-plane, stair-soffit, double-height, no-ceiling and open-to-sky states in the production data model.
- Uses targeted confirmed section/elevation crops for special-ceiling evidence when no RCP is available; ambiguous level-only evidence is not silently applied to every room.
- Stores bulkheads/soffits/access panels and other ceiling features separately.
- Flat surface quantities are deterministic. Special/sloped surfaces remain review-required unless enough evidence exists to calculate a true surface area.
- User Dimension/Workbook edits persist back to PostgreSQL.

### Roof
- Uses only Pre-included roof plan / roof terrace / roof-deck viewports as primary geometry sources; it does not rescan unrelated sheets.
- OpenAI structured vision returns exact source-crop pixel polygons for RoofRegion/RoofPlane plus ridge/hip/valley/eave/verge/abutment/parapet/gutter edges, roof openings and drainage components.
- One primary roof geometry model call is allowed per source crop, with at most one targeted repair crop when deterministic geometry validation rejects one entity. Saved runs are cached by source/crop/model/prompt context.
- Deterministic validation rejects out-of-bounds/self-intersecting/materially overlapping plane geometry. AI never calculates official quantities.
- Projected area is calculated from source pixels + confirmed Pre scale. Sloping planar true area is `projected / cos(pitch)` only when pitch evidence exists. Curved roofs remain review-required until profile evidence/user input exists.
- Roof system/build-up resolution uses project drawings, schedules/specifications/legends/details and stores covering, waterproofing, underlay, insulation, screed/falls, protection and finish layers with evidence.
- NRM2 routing is separated: sheet covering 17; tile/slate 18; waterproofing 19; rooflights 23; insulation 31; drainage 33; concrete/reinforcement/formwork 11.
- Concrete roof structural/derived fields are editable inside the existing Roof Item panel: slab thickness, reinforcement kg/m² factor, soffit formwork and formed-edge depth. Their derived quantities are clearly labelled and persisted.
- Roof openings remain stored even when a later ruleset decides whether to deduct them. Upstand edges are independently selectable in the existing canvas UI.
- User-confirmed roof geometry/system edits are never silently overwritten by a later AI run.
- Roof Dimension / Workbook / 3D stay in the supplied demo shell; production records are persisted through PostgreSQL.

## Repository structure

```text
Quanto/
├── frontend/                         # existing demo UI, production data bridge added
│   └── src/
│       ├── app/
│       ├── features/
│       │   ├── pre/
│       │   ├── quanto/               # same main Quanto shell / Takeoff UI
│       │   ├── floors/               # existing future/detail feature boundary
│       │   ├── ceilings/             # existing future/detail feature boundary
│       │   ├── roofs/                # roof feature/API boundary; demo shell remains primary UI
│       │   ├── review/
│       │   └── boq/
│       └── shared/
├── backend/
│   └── app/
│       ├── api/v1/routes/
│       │   ├── ... Pre routes ...
│       │   ├── floors.py             # production Floor API
│       │   ├── ceilings.py           # production Ceiling API
│       │   └── roofs.py              # production Roof API
│       ├── modules/
│       │   ├── pre/
│       │   └── takeoff/
│       │       ├── common.py
│       │       ├── floors.py
│       │       ├── ceilings.py
│       │       ├── roofs.py
│       │       ├── model_schemas.py
│       │       └── prompts.py
│       └── services/
├── database/
│   ├── schema/001_pre.sql
│   ├── schema/002_floor_ceiling.sql
│   ├── schema/003_roof.sql
│   └── migrations/
├── storage/                          # plan-defined local project storage
├── shared/
├── infrastructure/
├── docs/
│   ├── pre/
│   ├── takeoff/floor-plan/           # supplied Floor planning source
│   ├── takeoff/ceiling-plan/         # supplied Ceiling planning source
│   ├── takeoff/roof/planning/        # supplied Roof planning source
│   └── ui-reference/                 # supplied Takeoff UI plan
└── tests/
```

## Windows local setup — no Docker

This is the recommended setup for the current 8 GB development machine.

### 1. PostgreSQL

The database must already exist:

```sql
CREATE DATABASE quanto;
```

Apply schemas from the repository root. If `psql` is on PATH:

```powershell
psql -U postgres -d quanto -f ".\database\schema\001_pre.sql"
psql -U postgres -d quanto -f ".\database\schema\002_floor_ceiling.sql"
```

If PostgreSQL is installed on E: and is not on PATH, use the full executable path, for example:

```powershell
& "E:\Softwares\PostgreSQL-17\bin\psql.exe" -U postgres -d quanto -f ".\database\schema\001_pre.sql"
& "E:\Softwares\PostgreSQL-17\bin\psql.exe" -U postgres -d quanto -f ".\database\schema\002_floor_ceiling.sql"
& "E:\Softwares\PostgreSQL-17\bin\psql.exe" -U postgres -d quanto -f ".\database\schema\003_roof.sql"
```

All schema files are written to be safe for the intended upgrade path; on an existing Pre + Floor + Ceiling database, apply only `003_roof.sql`.

For an existing database that already has Pre + Floor + Ceiling, apply only the new Roof migration:

```powershell
& "E:\Softwares\PostgreSQL-17\bin\psql.exe" -U postgres -d quanto -f ".\database\schema\003_roof.sql"
```

Or run all idempotent migrations with:

```powershell
.\infrastructure\scripts\migrations\apply-windows.ps1 -PsqlPath "E:\Softwares\PostgreSQL-17\bin\psql.exe"
```

### 2. Environment

Copy:

```powershell
Copy-Item .env.example .env
```

Set your real PostgreSQL password in `.env`:

```env
POSTGRES_DB=quanto
POSTGRES_USER=postgres
POSTGRES_PASSWORD=YOUR_PASSWORD
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/quanto
```

The backend now reads the root `.env`; a separate `backend/.env` is optional.

### 3. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
uvicorn app.main:app --reload
```

Open API docs:

```text
http://localhost:8000/docs
```

### 4. Frontend

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## OpenAI Floor/Ceiling/Roof detection

Do **not** put the API key in frontend code and do not commit `.env`.

After normal Pre is working, edit root `.env`:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=gpt-5.6-terra
```

Restart the backend.

The existing Floor/Ceiling/Roof Takeoff UI then loads the project from PostgreSQL. On the first Floor/Ceiling/Roof entry with no saved zones, the production bridge requests analysis once and hydrates the same UI with real project families/zones. Saved results are reused; normal refreshes do not resend already-saved geometry.

Server quality mapping is kept behind the UI:

```text
Easy     → gpt-5.6-luna
Medium   → gpt-5.6-terra
Expert   → gpt-5.6-sol
Maximum  → gpt-5.6-sol
```

A deployment can pin another model through `OPENAI_MODEL`.

## Required workflow

Floor/Ceiling analysis deliberately requires the frozen Pre Project Frame:

```text
Upload
→ Plans confirmed
→ Scale confirmed
→ Height confirmed
→ Specifications reviewed
→ Start Takeoff / freeze Project Frame
→ Floor
→ Ceiling
→ Roof
```

Ceiling is intentionally run after Floor. When there is no dedicated RCP, it will not derive ceiling geometry until the Floor zones have been reviewed/confirmed in Floor → Dimension; this prevents unreviewed AI room geometry from silently becoming ceiling measurement geometry.

## Floor/Ceiling/Roof API endpoints

```text
GET  /api/v1/projects/{project_id}/takeoff/floors
GET  /api/v1/projects/{project_id}/takeoff/floor/demo-state
PUT  /api/v1/projects/{project_id}/takeoff/floor/demo-state
POST /api/v1/projects/{project_id}/takeoff/floor/analyze
POST /api/v1/projects/{project_id}/takeoff/floor/{floor_id}/analyze
GET  /api/v1/projects/{project_id}/takeoff/floor-spaces
GET  /api/v1/projects/{project_id}/takeoff/floor-quantities
GET  /api/v1/projects/{project_id}/takeoff/floor-finish-definitions
GET  /api/v1/projects/{project_id}/takeoff/floor-work-assignments
GET  /api/v1/projects/{project_id}/takeoff/skirting-edges

GET  /api/v1/projects/{project_id}/takeoff/ceiling/demo-state
PUT  /api/v1/projects/{project_id}/takeoff/ceiling/demo-state
POST /api/v1/projects/{project_id}/takeoff/ceiling/analyze
GET  /api/v1/projects/{project_id}/takeoff/ceiling-zones
GET  /api/v1/projects/{project_id}/takeoff/ceiling-quantities
GET  /api/v1/projects/{project_id}/takeoff/ceiling-definitions
GET  /api/v1/projects/{project_id}/takeoff/ceiling-features
```


### Roof API

```text
GET  /api/v1/projects/{project_id}/takeoff/roof/demo-state
PUT  /api/v1/projects/{project_id}/takeoff/roof/demo-state
POST /api/v1/projects/{project_id}/takeoff/roof/analyze
GET  /api/v1/projects/{project_id}/takeoff/roof-quantities
GET  /api/v1/projects/{project_id}/takeoff/roof-review

GET  /api/v1/projects/{project_id}/roofs
POST /api/v1/projects/{project_id}/roofs/analyze
POST /api/v1/projects/{project_id}/roofs/import-json
GET  /api/v1/projects/{project_id}/roofs/crop
POST/PATCH/DELETE roof levels, planes, edges, openings and components
POST /api/v1/projects/{project_id}/roofs/recalculate
POST /api/v1/projects/{project_id}/roofs/confirm
```

## Verification

Backend:

```powershell
cd backend
python -m pytest -q
python -m compileall -q app
```

Frontend after dependencies are installed:

```powershell
cd frontend
npm run typecheck
npm run test:syntax
npm run build
```

The package was verified with the backend test suite (including Roof geometry/NRM rules/API surface) and a TypeScript/TSX syntax pass. The packaging environment could not complete npm registry installation, so the full Next.js build must be run on the normal development PC/CI after `npm install`.

## Docker / deployment

Docker remains optional. `docker-compose.yml` initializes `001_pre.sql`, `002_floor_ceiling.sql` and `003_roof.sql` for a fresh database.

For deployment, keep PostgreSQL persistent and keep the plan-defined `STORAGE_ROOT` persistent. Floor/Ceiling/Roof records store evidence and geometry in PostgreSQL while original PDFs/renders/crops stay in project storage.
