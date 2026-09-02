from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from threading import Event, Thread
from typing import Any, Callable, Iterator

from .contracts import EvaluationReport, HarnessStage
from .registry import get_expert
from .state import complete_stage, create_run, event, finish_run, heartbeat


@dataclass
class ActiveHarnessRun:
    run_id: str | None
    project_id: str
    element: str
    quality: str
    force: bool
    stage: str = "scope"


_ACTIVE: ContextVar[ActiveHarnessRun | None] = ContextVar("quanto_active_harness_run", default=None)


def current_run() -> ActiveHarnessRun | None:
    return _ACTIVE.get()


def emit(kind: str, message: str, payload: dict[str, Any] | None = None, *, stage: str | None = None,
         progress: int | None = None) -> None:
    active = current_run()
    if not active:
        return
    selected_stage = stage or active.stage
    active.stage = selected_stage
    event(active.run_id, active.project_id, active.element, selected_stage, kind, message, payload, progress=progress)


@contextmanager
def stage(name: HarnessStage, message: str, *, progress: int | None = None) -> Iterator[dict[str, Any]]:
    active = current_run()
    if not active:
        yield {}
        return
    previous = active.stage
    active.stage = name
    emit("stage_started", message, stage=name, progress=progress)
    try:
        artifact: dict[str, Any] = {}
        yield artifact
    except Exception as exc:
        emit("stage_failed", f"{message}: {exc}", {"error": str(exc)[:1000]}, stage=name)
        raise
    else:
        complete_stage(active.run_id, active.project_id, active.element, name, artifact)
        emit("stage_completed", message, stage=name, progress=progress)
    finally:
        active.stage = previous


@contextmanager
def harness_session(project_id: str, element: str, quality: str, force: bool) -> Iterator[ActiveHarnessRun]:
    spec = get_expert(element)
    active = ActiveHarnessRun(create_run(project_id, spec.runtime_key, quality, force), project_id, spec.runtime_key, quality, force)
    token = _ACTIVE.set(active)
    stop_heartbeat = Event()

    def keep_alive() -> None:
        while not stop_heartbeat.wait(15):
            try:
                heartbeat(active.run_id, project_id, spec.runtime_key)
            except Exception:
                # A stage/event write will surface a persistent database failure. A
                # transient heartbeat failure must not terminate a valid model call.
                pass

    heartbeat_thread = Thread(target=keep_alive, name=f"quanto-harness-{spec.runtime_key}", daemon=True)
    heartbeat_thread.start()
    emit("run_started", f"Starting {spec.display_name} expert harness", {"quality": quality, "force": force}, progress=1)
    try:
        yield active
    except Exception as exc:
        emit("run_failed", f"{spec.display_name} harness failed", {"error": str(exc)[:1500]}, stage=active.stage, progress=100)
        finish_run(active.run_id, project_id, spec.runtime_key, status="failed", error=str(exc)[:2000])
        raise
    finally:
        stop_heartbeat.set()
        heartbeat_thread.join(timeout=1)
        _ACTIVE.reset(token)


def run_element_harness(
    project_id: str,
    element: str,
    quality: str,
    force: bool,
    engine: Callable[[], dict[str, Any]],
    evaluator: Callable[[str, str], EvaluationReport],
    publisher: Callable[[str, str], dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], EvaluationReport]:
    spec = get_expert(element)
    with harness_session(project_id, spec.runtime_key, quality, force) as active:
        from ..scope.engine import get_scope

        with stage("scope", "Selecting trusted frozen Pre evidence", progress=3) as artifact:
            scope = get_scope(project_id, spec.scope_key, auto_run=True)
            if scope.get("status") == "blocked":
                first = next((x.get("message") for x in scope.get("coverage_gaps", []) if x.get("severity") == "blocked"), None)
                raise RuntimeError(first or f"{spec.display_name} Scope is blocked")
            artifact.update({"scope_status": scope.get("status"), "manifest_id": scope.get("id")})

        with stage("bind", "Binding approved plans, schedules, specifications and supporting views", progress=6) as artifact:
            artifact.update({
                "primary_count": scope.get("summary", {}).get("primary_count", 0),
                "supporting_count": scope.get("summary", {}).get("supporting_count", 0),
            })
            emit("evidence_bound", "Scope evidence bound", {
                "primary_count": scope.get("summary", {}).get("primary_count", 0),
                "supporting_count": scope.get("summary", {}).get("supporting_count", 0),
                "scope_status": scope.get("status"),
            })

        with stage("detect", f"Running focused {spec.display_name} detection and resolution", progress=8) as artifact:
            result = engine()
            artifact.update({"result_keys": sorted(result.keys()), "result_status": result.get("status")})

        # Existing production engines already perform deterministic geometry checks and
        # official calculations internally. These harness stages make that contract
        # explicit and durable without duplicating the arithmetic.
        with stage("verify", "Verifying saved geometry and unresolved evidence", progress=92) as artifact:
            from .gates import verify_saved_geometry
            artifact.update(verify_saved_geometry(project_id, spec.runtime_key))
            emit("verification_ready", "Element engine completed deterministic validation")
        with stage("resolve", "Preserving unresolved evidence as review items instead of guesses", progress=94) as artifact:
            from .gates import resolve_dependency_state
            artifact.update(resolve_dependency_state(project_id, spec.runtime_key))
            emit("resolution_ready", "Unresolved facts remain explicit")
        with stage("dimension", "Using confirmed scale/levels for deterministic measurement", progress=96) as artifact:
            from .gates import validate_measurement_readiness
            artifact.update(validate_measurement_readiness(project_id, spec.runtime_key))
            emit("measurement_ready", "Official quantities remain code-calculated")
        with stage("quantify", "Deriving element-owned measurable work without double counting", progress=97) as artifact:
            published = publisher(project_id, spec.runtime_key) if publisher else {}
            artifact.update({"published": published})
            if published:
                emit("facts_published", "Reusable element facts published", published)
        with stage("check", "Running independent element completeness evaluator", progress=99) as artifact:
            report = evaluator(project_id, spec.runtime_key)
            artifact.update({"status": report.status, "issue_count": len(report.issues), "stats": report.stats})
            emit("evaluation", f"Evaluator result: {report.status}", {
                "status": report.status,
                "issues": [issue.__dict__ for issue in report.issues],
                "stats": report.stats,
            })

        final_status = "completed" if report.status == "pass" else "needs_review" if report.status == "pass_with_flags" else "failed"
        evaluator_payload = {
            "status": report.status,
            "issues": [issue.__dict__ for issue in report.issues],
            "stats": report.stats,
        }
        emit("run_completed", f"{spec.display_name} harness {final_status}", evaluator_payload, stage="check", progress=100)
        finish_run(active.run_id, project_id, spec.runtime_key, status=final_status, evaluator=evaluator_payload)
        _record_child_results(project_id, spec.runtime_key, quality, force, active.run_id, evaluator)
        return result, report


def _record_child_results(project_id: str, element: str, quality: str, force: bool,
                          parent_run_id: str | None,
                          evaluator: Callable[[str, str], EvaluationReport]) -> None:
    """Record separately queryable expert outcomes for shared physical detectors.

    Door/Window and Stair/Ramp source interpretation is intentionally shared so one plan
    is not charged to the model twice. Validation and run identity remain element-specific.
    """
    children = {
        "doors-windows": ("doors", "windows"),
        "stairs-ramps": ("stairs", "ramps"),
    }.get(element, ())
    for child in children:
        spec = get_expert(child)
        child_run = create_run(project_id, spec.runtime_key, quality, force)
        event(child_run, project_id, spec.runtime_key, "detect", "shared_detection",
              f"{spec.display_name} detection completed in shared {element} source pass",
              {"parent_run_id": parent_run_id, "shared_detector": element}, progress=90)
        for completed_stage in ("scope", "bind", "detect", "verify", "resolve", "dimension", "quantify"):
            complete_stage(child_run, project_id, spec.runtime_key, completed_stage,
                           {"parent_run_id": parent_run_id, "shared_detector": element})
        report = evaluator(project_id, spec.runtime_key)
        evaluator_payload = {
            "status": report.status,
            "issues": [issue.__dict__ for issue in report.issues],
            "stats": report.stats,
            "parent_run_id": parent_run_id,
        }
        complete_stage(child_run, project_id, spec.runtime_key, "check", evaluator_payload)
        final_status = "completed" if report.status == "pass" else "needs_review" if report.status == "pass_with_flags" else "failed"
        event(child_run, project_id, spec.runtime_key, "check", "run_completed",
              f"{spec.display_name} expert harness {final_status}", evaluator_payload, progress=100)
        finish_run(child_run, project_id, spec.runtime_key, status=final_status, evaluator=evaluator_payload)
