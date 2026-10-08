from contextlib import contextmanager

import pytest
from pydantic import ValidationError

from app.api.v1.routes import projects
from app.api.v1.schemas import CreateProject


class _Result:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class _Connection:
    def __init__(self):
        self.params = None

    def execute(self, _sql, params):
        self.params = params
        return _Result(
            {
                "id": "project-id",
                "name": params[0],
                "project_number": params[1],
                "client_name": params[2],
                "location": params[3],
                "description": params[4],
                "status": params[5],
                "pre_status": "draft",
                "frame_version": 0,
                "frozen_at": None,
                "created_at": "2026-10-07T00:00:00Z",
                "updated_at": "2026-10-07T00:00:00Z",
            }
        )


@contextmanager
def _transaction(conn):
    yield conn


def test_create_project_accepts_explicit_status(monkeypatch):
    conn = _Connection()
    monkeypatch.setattr(projects, "transaction", lambda: _transaction(conn))

    response = projects.create_project(CreateProject(name="Tower", status="on_hold"))

    assert conn.params[-1] == "on_hold"
    assert response["status"] == "on_hold"
    assert response["project_id"] == "project-id"


def test_create_project_defaults_status_to_active(monkeypatch):
    conn = _Connection()
    monkeypatch.setattr(projects, "transaction", lambda: _transaction(conn))

    response = projects.create_project(CreateProject(name="Tower"))

    assert conn.params[-1] == "active"
    assert response["status"] == "active"


def test_create_project_rejects_invalid_status():
    with pytest.raises(ValidationError):
        CreateProject(name="Tower", status="paused")
