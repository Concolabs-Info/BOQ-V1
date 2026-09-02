from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import BaseModel

from app.modules.takeoff.harness import model_client, runtime, state
from app.modules.takeoff.harness.contracts import EvaluationReport
from app.modules.takeoff.harness.ownership import geometry_is_direct_boq, owner_for_quantity
from app.modules.takeoff.harness.prompt_builder import compose_prompt
from app.modules.takeoff.harness.registry import get_expert, list_experts


class _TinyResult(BaseModel):
    ok: bool


def test_registry_has_only_requested_new_experts_and_protects_existing_elements():
    assert [item.key for item in list_experts()] == [
        "floor", "ceiling", "walls", "doors", "windows", "roof", "stairs", "ramps"
    ]
    for protected in ("beams", "columns", "slab", "foundation"):
        with pytest.raises(ValueError, match="existing implementation"):
            get_expert(protected)
    assert get_expert("doors").runtime_key == "doors"
    assert get_expert("windows").runtime_key == "windows"
    assert get_expert("stairs").runtime_key == "stairs"
    assert get_expert("ramps").runtime_key == "ramps"


def test_geometry_is_not_a_direct_boq_line_and_structural_ownership_stays_protected():
    for element in ("floor", "ceiling", "walls", "doors", "windows", "roof", "stairs", "ramps"):
        assert geometry_is_direct_boq(element) is False
    assert owner_for_quantity("floor_finish") == "floor"
    assert owner_for_quantity("skirting") == "floor"
    assert owner_for_quantity("roof_waterproofing") == "roof"
    assert owner_for_quantity("slab_concrete") == "slab"
    assert owner_for_quantity("beam_concrete") == "beams"
    assert owner_for_quantity("column_concrete") == "columns"
    assert owner_for_quantity("foundation_concrete") == "foundation"


def test_expert_super_prompts_are_element_specific():
    floor = compose_prompt("floor", "Return geometry", schema_name="FloorGeometryOutput")
    wall = compose_prompt("walls", "Return geometry", schema_name="WallGeometryOutput")
    openings = compose_prompt("doors-windows", "Return openings", schema_name="OpeningGeometryOutput")
    stair_ramp = compose_prompt("stairs-ramps", "Return vertical circulation", schema_name="StairRampGeometryOutput")
    assert "QUANTO FLOOR EXPERT" in floor
    assert "FloorSpace is a trusted geometry/fact object, not a BOQ item" in floor
    assert "QUANTO WALL EXPERT" in wall
    assert "follow walls through door/window openings" in wall.lower()
    assert "QUANTO DOOR EXPERT" in openings and "QUANTO WINDOW EXPERT" in openings
    assert "QUANTO STAIR EXPERT" in stair_ramp and "QUANTO RAMP EXPERT" in stair_ramp


def test_model_client_appends_expert_contract_and_bounds_structured_retry(monkeypatch):
    calls: list[str] = []

    class FakeClient:
        def parse_text(self, prompt, schema, **_kwargs):
            calls.append(prompt)
            if len(calls) == 1:
                raise RuntimeError("invalid structured response")
            return schema.model_validate({"ok": True})

    monkeypatch.setattr(model_client, "CodexAccountModelClient", FakeClient)
    result = model_client.HarnessModelClient("floor", "p1").parse_text(
        "Inspect specification evidence", _TinyResult, system="base", quality="medium"
    )
    assert result.ok is True
    assert len(calls) == 2
    assert "QUANTO FLOOR EXPERT" in calls[0]
    assert "TARGETED REPAIR" in calls[1]


def test_checkpoint_falls_back_to_project_storage_without_harness_tables(monkeypatch, tmp_path):
    monkeypatch.setattr(state, "project_root", lambda _project_id: tmp_path)
    monkeypatch.setattr(state, "_tables_ready", lambda: False)

    run_id = state.create_run("p1", "floor", "expert", False)
    assert run_id is None
    state.event(None, "p1", "floor", "detect", "model_call", "Detecting", {"x": 1}, progress=50)
    state.complete_stage(None, "p1", "floor", "detect", {"detected": 3})
    state.finish_run(None, "p1", "floor", status="needs_review", evaluator={"status": "pass_with_flags"})
    current = state.latest_run("p1", "floor")
    assert current["status"] == "needs_review"
    assert current["progress"] == 100
    assert current["evaluator"]["status"] == "pass_with_flags"
    assert current["completed_stages"] == ["detect"]
    assert current["stage_artifacts"]["detect"]["detected"] == 3
    assert state.list_events("p1", "floor")[0]["event_kind"] == "checkpoint"


def test_runtime_wraps_existing_element_engine_in_shared_lifecycle(monkeypatch):
    seen: list[str] = []

    monkeypatch.setattr(runtime, "create_run", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(runtime, "event", lambda _run, _project, _element, stage, kind, *_args, **_kwargs: seen.append(f"{stage}:{kind}"))
    monkeypatch.setattr(runtime, "finish_run", lambda *_args, **_kwargs: seen.append("finish"))
    monkeypatch.setattr(runtime, "complete_stage", lambda *_args, **_kwargs: None)

    from app.modules.takeoff.harness import gates
    monkeypatch.setattr(gates, "verify_saved_geometry", lambda *_args: {"detected": 3})
    monkeypatch.setattr(gates, "resolve_dependency_state", lambda *_args: {"pending": []})
    monkeypatch.setattr(gates, "validate_measurement_readiness", lambda *_args: {"unresolved_measurements": 0})

    from app.modules.takeoff.scope import engine as scope_engine
    monkeypatch.setattr(scope_engine, "get_scope", lambda *_args, **_kwargs: {
        "status": "ready", "summary": {"primary_count": 1, "supporting_count": 2}, "coverage_gaps": []
    })

    def engine():
        seen.append("engine")
        return {"objects": 3}

    def publisher(_project, _element):
        seen.append("publisher")
        return {"facts": 3}

    def evaluator(_project, element):
        seen.append("evaluator")
        return EvaluationReport(element, "pass", (), {"objects": 3})

    result, report = runtime.run_element_harness("p1", "floor", "medium", False, engine, evaluator, publisher)
    assert result == {"objects": 3}
    assert report.status == "pass"
    assert seen.index("engine") < seen.index("publisher") < seen.index("evaluator")
    assert "scope:stage_started" in seen
    assert "check:stage_completed" in seen
    assert seen[-1] == "finish"


def test_harness_migration_supports_existing_and_fresh_databases():
    root = Path(__file__).resolve().parents[2]
    migration = (root / "database/migrations/011_element_harness.sql").read_text()
    schema = (root / "database/schema/011_element_harness.sql").read_text()
    compose = (root / "docker-compose.yml").read_text()
    assert migration == schema
    assert "CREATE TABLE IF NOT EXISTS takeoff_harness_run" in migration
    assert "CREATE TABLE IF NOT EXISTS takeoff_harness_event" in migration
    assert "ALTER COLUMN include_in_boq SET DEFAULT false" in migration
    assert "measurement_reason" in migration
    assert "database/schema/011_element_harness.sql" in compose


def test_each_expert_declares_specific_strategies_and_validation_focus():
    experts = list_experts()
    assert len(experts) == 8
    for expert in experts:
        assert expert.strategies, f"{expert.key} must declare focused detection strategies"
        assert expert.validation_focus, f"{expert.key} must declare focused validation checks"
        assert expert.max_model_attempts == 2
    assert "inherit_confirmed_floor" in get_expert("ceiling").strategies
    assert "review_only_floor_candidate" in get_expert("ceiling").strategies
    assert "paired_faces" in get_expert("walls").strategies
    assert "plan_section_multiview" in get_expert("stairs").strategies
    assert "plan_section_multiview" in get_expert("ramps").strategies


def test_target_scope_dependencies_are_soft_so_experts_can_detect_independently():
    from app.modules.takeoff.scope.registry import get_scope_spec

    for element in ("floor", "ceiling", "walls", "doors-windows", "roof"):
        spec = get_scope_spec(element)
        assert all(dep.required is False for dep in spec.dependencies), element


def test_floor_boq_emits_confirmed_derived_work_not_floor_geometry(monkeypatch):
    from app.modules.takeoff.harness import boq

    calls = []

    def fake_fetch_all(sql, _params):
        calls.append(sql)
        if "FROM finish_assignment" in sql:
            return []
        if "FROM floor_work_assignment" in sql:
            return [{
                "work_type": "skirting", "code": "SK-01", "name": "Timber skirting",
                "description": "100 mm timber skirting", "measurement_unit": "m",
                "quantity": 12.5, "floor_ids": ["f1"], "source_ids": ["a1"],
            }]
        raise AssertionError(sql)

    monkeypatch.setattr(boq, "fetch_all", fake_fetch_all)
    rows = boq._floor_candidates("p1")
    assert len(rows) == 1
    assert rows[0]["entity_type"] == "floor_skirting"
    assert rows[0]["quantity"] == 12.5
    assert all("floor_space" not in row["entity_type"] for row in rows)
    assert any("user_confirmed=true" in sql for sql in calls)


def test_roof_boq_excludes_protected_structural_slab_work_and_requires_confirmed_planes(monkeypatch):
    from app.modules.takeoff.harness import boq

    seen_sql = []

    def fake_fetch_all(sql, _params):
        seen_sql.append(sql)
        return [
            {"id": "q1", "host_floor_id": "f1", "entity_type": "roof_waterproofing", "work_section": "Waterproofing", "item_code": "19", "description": "Roof membrane", "quantity": 20.0, "unit": "m²", "entity_id": "rp1", "basis": "confirmed plane"},
            {"id": "q2", "host_floor_id": "f1", "entity_type": "concrete_roof", "work_section": "Concrete", "item_code": "11", "description": "Roof slab concrete", "quantity": 4.0, "unit": "m³", "entity_id": "rp1", "basis": "structural slab"},
        ]

    monkeypatch.setattr(boq, "fetch_all", fake_fetch_all)
    rows = boq._roof_candidates("p1")
    assert [row["entity_type"] for row in rows] == ["roof"]
    assert rows[0]["description"] == "Roof membrane"
    assert "rp.user_confirmed=true" in seen_sql[0]


def test_boq_database_failure_is_visible_instead_of_becoming_zero_quantities(monkeypatch):
    from app.modules.takeoff.harness import boq

    def unavailable(*_args, **_kwargs):
        raise RuntimeError("schema unavailable")

    monkeypatch.setattr(boq, "fetch_all", unavailable)
    with pytest.raises(RuntimeError, match="schema unavailable"):
        boq.production_boq_candidates("p1")


def test_combined_detector_records_separate_child_expert_results(monkeypatch):
    created: list[str] = []
    finished: list[tuple[str, str]] = []
    monkeypatch.setattr(runtime, "create_run", lambda _project, element, *_args: created.append(element) or f"run-{element}")
    monkeypatch.setattr(runtime, "event", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(runtime, "complete_stage", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(runtime, "finish_run", lambda run_id, _project, _element, *, status, **_kwargs: finished.append((run_id, status)))

    runtime._record_child_results(
        "p1", "doors-windows", "medium", False, "parent-1",
        lambda _project, element: EvaluationReport(element, "pass", (), {"items": 1}),
    )

    assert created == ["doors", "windows"]
    assert finished == [("run-doors", "completed"), ("run-windows", "completed")]
