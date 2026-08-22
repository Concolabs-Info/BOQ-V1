from __future__ import annotations

from contextlib import contextmanager
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from app.modules.pre import project_frame


def test_readiness_requires_a_storey_stack(monkeypatch):
    project_id = uuid4()

    def fake_fetch_all(sql: str, params=()):
        if "FROM document" in sql and "JOIN" not in sql:
            return [{"id": uuid4(), "status": "ready", "filename": "A.pdf"}]
        if "FROM sheet s" in sql and "JOIN page" in sql and "SELECT s.*" in sql:
            return [{"id": uuid4()}]
        if "FROM viewport v" in sql:
            return []
        if "FROM storey" in sql:
            return []
        if "FROM spec_item" in sql:
            return [{"id": uuid4(), "name": "Door schedule"}]
        raise AssertionError(sql)

    monkeypatch.setattr(project_frame, "fetch_all", fake_fetch_all)
    monkeypatch.setattr(project_frame, "is_confirmed", lambda *_: True)

    state = project_frame.readiness(project_id)
    assert not state["ready"]
    assert any(issue["message"] == "No storeys are defined" for issue in state["issues"])


def test_freeze_json_encodes_database_values(monkeypatch):
    project_id = uuid4()
    captured = {}

    monkeypatch.setattr(
        project_frame,
        "fetch_one",
        lambda *args, **kwargs: {"pre_status": "draft", "pre_frame": None},
    )
    monkeypatch.setattr(project_frame, "readiness", lambda *_: {"ready": True, "issues": []})
    monkeypatch.setattr(
        project_frame,
        "build_frame",
        lambda *_: {
            "schema_version": "project-frame-v1",
            "project": {"id": project_id, "name": "Test"},
            "frame_version": 1,
            "created_at": datetime.now(UTC),
            "coordinate_contract": {},
            "source_documents": [{"id": uuid4()}],
            "sheets": [],
            "viewports": [{"scale_factor": Decimal("96.0")}],
            "levels": [{"id": uuid4()}],
            "spec_items": [{}],
            "transforms": [],
        },
    )

    class Connection:
        def execute(self, sql, params):
            captured["sql"] = sql
            captured["params"] = params

    @contextmanager
    def fake_transaction():
        yield Connection()

    monkeypatch.setattr(project_frame, "transaction", fake_transaction)

    frame = project_frame.freeze(project_id)
    assert frame["project"]["id"] == str(project_id)
    assert isinstance(frame["created_at"], str)
    assert frame["viewports"][0]["scale_factor"] == 96.0
    assert "pre_status='frozen'" in captured["sql"]
