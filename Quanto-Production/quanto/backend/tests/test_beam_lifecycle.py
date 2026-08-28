from __future__ import annotations

import json
from types import SimpleNamespace

from app.modules.takeoff.beams import service
from app.modules.takeoff.beams.engine.db.repo import Repo, migrate
from vision import client as vision_client
from vision.codex_convert import to_responses_input
from agentic.sandbox import run_python
from graph.nodes import _first_number_is_thickness


def test_repo_connections_are_closed_after_each_operation(tmp_path):
    db_path = tmp_path / "beam_engine.db"
    migrate(db_path)
    repo = Repo(db_path)

    run_id = repo.create_run(str(tmp_path / "input.pdf"))
    repo.update_run(run_id, status="running", stage="S0")
    assert repo.get_run(run_id)["status"] == "running"

    # This is the regression assertion for WinError 32. Windows only permits
    # unlinking the database here when every repository connection was closed.
    db_path.unlink()
    assert not db_path.exists()


def test_failed_analysis_is_not_restarted_by_state_polling(tmp_path, monkeypatch):
    project_id = "6fef99fa-7122-48d1-998b-9e54a4004f6e"
    project = {
        "id": project_id,
        "pre_status": "frozen",
        "pre_frame": {"source_documents": []},
        "frame_version": 1,
    }
    monkeypatch.setattr(service, "project_root", lambda _project_id: tmp_path)
    monkeypatch.setattr(service, "fetch_one", lambda *_args, **_kwargs: project)
    monkeypatch.setattr(service, "_source_hash", lambda _project: "same-hash")

    beam_dir = tmp_path / "beams"
    beam_dir.mkdir()
    (beam_dir / "status.json").write_text(json.dumps({
        "status": "error",
        "stage": "error",
        "progress": 100,
        "message": "original failure",
    }))
    (beam_dir / "meta.json").write_text(json.dumps({"source_hash": "same-hash"}))

    def unexpected_restart(*_args, **_kwargs):
        raise AssertionError("polling a failed run must not restart analysis")

    monkeypatch.setattr(service, "start_analysis", unexpected_restart)
    status = service.ensure_analysis_started(project_id)
    assert status["status"] == "error"
    assert status["message"] == "original failure"


def test_vision_retries_an_empty_json_response(tmp_path, monkeypatch):
    image = tmp_path / "page.png"
    image.write_bytes(b"png")
    turns = iter([
        SimpleNamespace(text="", usage_in=10, usage_out=20),
        SimpleNamespace(text='{"results": []}', usage_in=11, usage_out=21),
    ])

    class FakeClient:
        def __init__(self):
            self.calls = 0

        def complete(self, **_kwargs):
            self.calls += 1
            return next(turns)

    fake = FakeClient()
    monkeypatch.setenv("BEAM_MODEL_RETRIES", "1")
    monkeypatch.setattr(vision_client, "get_model_client", lambda: fake)
    result = vision_client.VisionClient(tmp_path / "vision.log")._live_call(
        "classify", [str(image)], '{"results": []}', method="classify_sheets"
    )

    assert result == {"results": []}
    assert fake.calls == 2
    assert "empty_or_invalid_json" in (tmp_path / "vision.log").read_text()


def test_agentic_python_sandbox_runs_on_current_platform(tmp_path):
    assert run_python("print(6 * 7)", tmp_path).strip() == "42"


def test_responses_continuation_removes_output_only_status_fields():
    converted = to_responses_input([{
        "role": "assistant",
        "codex_output": [{
            "type": "function_call",
            "id": "fc_1",
            "call_id": "call_1",
            "name": "run_python",
            "arguments": "{}",
            "status": "completed",
        }],
    }])
    assert converted == [{
        "type": "function_call",
        "id": "fc_1",
        "call_id": "call_1",
        "name": "run_python",
        "arguments": "{}",
    }]


def test_beam_mark_defaults_to_depth_by_width_without_plan_gap_votes():
    assert _first_number_is_thickness([]) is False
    assert _first_number_is_thickness([True, True, False]) is True
