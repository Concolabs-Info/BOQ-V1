from uuid import uuid4

from app.modules.takeoff import workspace_state


def test_workspace_state_round_trip(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace_state, "project_root", lambda _project_id: tmp_path)
    project_id = uuid4()
    saved = workspace_state.save_workspace_state(
        project_id,
        {"demo": {"walls": [{"id": "W-1"}]}, "measurements": []},
    )
    loaded = workspace_state.load_workspace_state(project_id)
    assert loaded == saved
    assert loaded["schemaVersion"] == workspace_state.SCHEMA_VERSION
    assert loaded["demo"]["walls"][0]["id"] == "W-1"


def test_workspace_state_rejects_oversized_payload(tmp_path, monkeypatch):
    monkeypatch.setattr(workspace_state, "project_root", lambda _project_id: tmp_path)
    monkeypatch.setattr(workspace_state, "MAX_STATE_BYTES", 64)
    try:
        workspace_state.save_workspace_state(uuid4(), {"value": "x" * 100})
    except ValueError as exc:
        assert "12 MB" in str(exc)
    else:
        raise AssertionError("Oversized state was accepted")
