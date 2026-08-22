from contextlib import contextmanager
from typing import Any, Iterator

try:
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool
except ModuleNotFoundError:  # unit tests can exercise pure rules without PostgreSQL installed
    dict_row = None
    ConnectionPool = None  # type: ignore[assignment,misc]

from ..core.config import get_settings


_pool: Any | None = None


def open_pool() -> None:
    global _pool
    if ConnectionPool is None:
        raise RuntimeError("psycopg is required to run the production API. Install backend dependencies first.")
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=get_settings().database_url,
            min_size=1,
            max_size=10,
            kwargs={"row_factory": dict_row},
            open=True,
        )


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def pool() -> Any:
    if _pool is None:
        raise RuntimeError("Database pool is not open")
    return _pool


@contextmanager
def transaction() -> Iterator[Any]:
    with pool().connection() as conn:
        with conn.transaction():
            yield conn


def fetch_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    with pool().connection() as conn:
        row = conn.execute(sql, params).fetchone()
        return dict(row) if row else None


def fetch_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with pool().connection() as conn:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]


def execute(sql: str, params: tuple[Any, ...] = ()) -> None:
    with pool().connection() as conn:
        conn.execute(sql, params)
        conn.commit()
