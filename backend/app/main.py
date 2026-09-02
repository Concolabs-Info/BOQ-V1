from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1.router import api_router
from .core.config import get_settings
from .database.connection import close_pool, fetch_one, open_pool


@asynccontextmanager
async def lifespan(_: FastAPI):
    open_pool()
    yield
    close_pool()


settings = get_settings()
app = FastAPI(title="Quanto API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "quanto-api"}


@app.get("/health/ready")
def health_ready():
    row = fetch_one("SELECT 1 AS ok")
    return {"status": "ready", "database": bool(row and row["ok"] == 1)}
