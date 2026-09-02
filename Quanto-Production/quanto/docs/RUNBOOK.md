# Quanto Pre runbook

## Start

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:3000`. API health is `http://localhost:8000/health`; interactive API docs are `http://localhost:8000/docs`.

## Normal operator flow

1. Create a project.
2. Upload one or more PDFs.
3. Wait for each document to show `ready`.
4. Analyze drawings, correct sheet metadata and include/exclude sheets.
5. Confirm the sheet set.
6. In Plans, correct/add/delete viewports and confirm each relevant viewport.
7. Build, order and confirm at least one storey.
8. Confirm a current scale for every included relevant viewport except notes.
9. Select the primary section/elevation, resolve every storey height and confirm the whole height stack.
10. Extract, correct and confirm each specification record, including explicit not-found records.
11. Open Start takeoff and freeze Pre.

After freeze, all Pre writes return a conflict response. The saved Project Frame is read-only.

## Local extraction mode

`AI_PROVIDER=local` is the safe no-key mode. It reads text from vector PDFs and produces reviewable full-page candidates. It intentionally leaves visual-only facts for the user:

- crop/view classification can be edited in Plans;
- scale can be set with two-point calibration;
- storey heights can be typed or set by a dragged band after selecting an eligible scaled source;
- text-layer notes and schedules can be edited in Specifications.

## Gemini extraction mode (planned Pre provider)

Set `AI_PROVIDER=gemini`, `GEMINI_API_KEY` and `GEMINI_MODEL=gemini-flash-latest`. Gemini receives only the controlled Pre image-reading prompts and must return the existing Pydantic schemas. No key is sent to the browser.

Successful triage, scale, height and specification results are stored in PostgreSQL. Normal navigation and refreshes reuse stored records. Re-uploading drawings, explicitly re-running analysis, or invalidating source evidence may require another paid model call.

## OpenAI extraction mode

`AI_PROVIDER=openai` remains supported for later modules or controlled compatibility testing. Set `OPENAI_API_KEY` and an approved image-input model with structured-output support. Production Pre should use Gemini to match the supplied plan.

## Reset local data

```bash
docker compose down -v
rm -rf storage/projects/* storage/temp/*
touch storage/projects/.gitkeep storage/temp/.gitkeep
```

This permanently removes the local database and uploaded drawings.

## Database migration

Fresh Docker databases load the current production schema chain automatically, including the shared element harness migration `011_element_harness.sql`. Existing databases should run migrations in filename order:

```bash
./infrastructure/scripts/migrations/apply.sh
```

## Backup

```bash
./infrastructure/scripts/maintenance/backup-db.sh backups
```

Copy the `storage/` directory with the database backup. The database contains references, while PDF/render bytes live in storage.

## Troubleshooting

- **Frontend cannot reach API:** check `NEXT_PUBLIC_API_URL` and `CORS_ORIGINS`, then rebuild the frontend because public Next.js variables are compiled into the browser bundle.
- **Upload remains processing:** inspect `docker compose logs api`; check storage write permission and PDF validity.
- **No automatic scale/height result in local mode:** expected. Use manual calibration/correction or enable the visual provider.
- **Gemini provider fails at startup:** check that `GEMINI_API_KEY` is present only in the backend environment and that `GEMINI_MODEL` is available to that Google AI project.
- **Start takeoff is blocked:** the issue list names the exact stale or missing confirmation.
- **A confirmed item becomes unconfirmed after edit:** expected content-hash staleness behavior.
