# API / worker deployment

Deploy `backend/` as a persistent container with:

- `DATABASE_URL` for managed PostgreSQL;
- a persistent writable volume mounted at `STORAGE_ROOT`;
- `CORS_ORIGINS` limited to the frontend origin;
- optional server-side model credentials.

Pre v1 uses FastAPI BackgroundTasks and does not require a separate queue. If future Takeoff jobs introduce a queue, add that infrastructure as a new service rather than changing the Pre data contract.
