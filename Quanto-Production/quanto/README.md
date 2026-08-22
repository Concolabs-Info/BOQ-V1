# Quanto — Production Foundation with Complete Pre

This repository is the production foundation for the full Quanto application. It keeps the established demo workspace and navigation, replaces demo state with real APIs and persistent data, and completely implements the **Pre** module.

The visible product structure remains:

```text
Pre | Takeoff | Review | BOQ
```

Only Pre is active in this delivery:

```text
Upload → Plans → Scale → Height → Specifications → Start takeoff
```

Takeoff, Review and BOQ have clean feature/module boundaries but are intentionally not implemented yet.

## What is implemented

- Project creation and persistent project state.
- Multi-PDF upload with file validation, SHA-256 and stored originals.
- PyMuPDF ingestion with page metadata and 72/150 DPI renders.
- Page triage into sheets and editable viewports.
- Manual add, move, resize, rename, classify, include/exclude and delete controls.
- Deterministic storey ordering, manual storey creation, typical groups and stack confirmation.
- Scale evidence from printed scale plus independent X/Y dimension lines.
- 1% evidence comparison and anisotropy refusal above 1.01.
- Two-point manual calibration.
- Human-selected primary height source and optional supporting source.
- Storey-band extraction, printed/measured cross-check, nearest-10-mm conversion and manual correction.
- Specification, notes, schedules and table extraction with explicit “not found” records.
- Content-hash confirmations; an edit automatically makes old confirmation stale.
- Readiness gate and immutable `project-frame-v1` freeze.
- PostgreSQL schema, local persistent drawing storage, Docker, CI and tests.

Pre is deterministic. Model calls are limited to the three controlled reading tasks in the supplied plan: viewport triage, scale/height evidence and specification evidence. Models return literal text and locations; application code calculates factors and measurements.

## Repository structure

```text
Quanto/
├── frontend/                 # Same Quanto demo workspace, production-organised
│   └── src/
│       ├── app/              # Next.js routes
│       ├── features/
│       │   ├── quanto/       # app shell and main navigation
│       │   ├── projects/     # project start page
│       │   ├── pre/          # all six implemented Pre stages
│       │   ├── takeoff/      # future boundary
│       │   ├── review/       # future boundary
│       │   └── boq/          # future boundary
│       └── shared/           # UI, API client, providers and data contracts
├── backend/                  # FastAPI production API
│   └── app/
│       ├── api/v1/           # REST routes
│       ├── modules/pre/      # Pre business rules
│       ├── services/         # shared AI/PDF services
│       ├── database/         # connection and runtime schema copy
│       └── core/             # settings
├── database/                 # source-controlled PostgreSQL schema/migrations
├── storage/                  # local development originals/renders/crops
├── shared/                   # cross-service schemas and OpenAPI contract
├── infrastructure/          # Docker/deployment/scripts/monitoring notes
├── docs/                     # supplied plans plus implementation/runbook
└── tests/                    # future end-to-end fixtures and flows
```

## Run the complete application with Docker

Requirements: Docker Desktop or Docker Engine with Compose.

1. Extract the ZIP and enter the folder:

```bash
cd Quanto
```

2. Create local environment settings:

```bash
cp .env.example .env
```

3. Start PostgreSQL, API and frontend:

```bash
docker compose up --build
```

4. Open:

```text
http://localhost:3000
```

API documentation is available at:

```text
http://localhost:8000/docs
```

Stop the stack with:

```bash
docker compose down
```

The default `AI_PROVIDER=local` is deliberately conservative. It uses extractable PDF text where available and leaves visual decisions, scale and height calibration for human review. It never pretends to have visually inspected a page.

## Enable the planned Gemini visual extraction for Pre

Edit `.env`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_server_side_key
GEMINI_MODEL=gemini-flash-latest
```

Then restart:

```bash
docker compose up --build
```

Keep the API key only in the backend environment. The model name is configurable rather than hard-coded so the application can use the approved production model for the deployment. Pre saves accepted extraction records in PostgreSQL; refreshing a page reuses them instead of making another model call. Re-uploading or re-running source analysis can intentionally create new calls.

The shared adapter also retains `AI_PROVIDER=openai` for future modules. Pre production deployments should use Gemini to match the supplied plan.

## Run without Docker for application code

Start PostgreSQL first:

```bash
docker compose up -d db
```

Backend:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -e "./backend[dev]"
set -a; source .env; set +a          # macOS/Linux
cd backend
uvicorn app.main:app --reload
```

On Windows PowerShell, set the values from `.env` in the shell before starting Uvicorn.

Frontend, in another terminal:

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

## Verification

```bash
cd backend
PYTHONPATH=. pytest -q

cd ../frontend
npm run typecheck
npm run test:syntax
npm run build
```

The delivery was assembled in an environment without reliable npm registry access, so dependency installation and the full `next build` must run on a normal development machine or in CI. During packaging, the complete Python test suite, Python compile pass and a TypeScript/TSX syntax pass were run. Run `npm run typecheck` and `npm run build` after `npm install` on your development machine.

## Production deployment boundary

- Deploy `frontend/` as the Next.js web service.
- Deploy `backend/` as a persistent Python service.
- Use managed PostgreSQL and run `database/migrations/` in order.
- Mount persistent storage at `STORAGE_ROOT`, or replace only the shared storage service before using an ephemeral API host.
- Put authentication and tenant enforcement at the existing Quanto identity/gateway boundary; the supplied Pre plan did not define a new authentication system, so this repository does not invent one.
- Takeoff must read the frozen Project Frame instead of re-reading Pre drawings independently.

See `docs/RUNBOOK.md`, `docs/IMPLEMENTATION-MAP.md` and `docs/PRE-DATA-CONTRACT.md` for the operational and data details.
