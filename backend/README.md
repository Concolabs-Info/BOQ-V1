# Quanto backend

FastAPI backend for the complete Pre module. It owns ingestion, deterministic geometry and validation, controlled extraction calls, confirmations and Project Frame freezing.

```bash
pip install -e ".[dev]"
PYTHONPATH=. pytest -q
uvicorn app.main:app --reload
```

PostgreSQL and a writable `STORAGE_ROOT` are required when running the API.
