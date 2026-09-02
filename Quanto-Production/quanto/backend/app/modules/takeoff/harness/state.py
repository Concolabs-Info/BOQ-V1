from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock
from typing import Any
from uuid import UUID

from ....database.connection import fetch_one, transaction
from ....database.json_value import Jsonb
from ....services.storage.paths import project_root

_CHECKPOINT_LOCK = RLock()


def _tables_ready() -> bool:
    try:
        row = fetch_one("SELECT to_regclass('public.takeoff_harness_run') AS name")
        return bool(row and row.get("name"))
    except Exception:
        return False


def _state_dir(project_id: UUID | str) -> Path:
    path = project_root(project_id) / "takeoff-harness"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _checkpoint_path(project_id: UUID | str, element: str) -> Path:
    safe = element.replace("/", "-")
    return _state_dir(project_id) / f"{safe}.checkpoint.json"


def write_checkpoint(project_id: UUID | str, element: str, payload: dict[str, Any]) -> None:
    with _CHECKPOINT_LOCK:
        path = _checkpoint_path(project_id, element)
        # Timestamp last so a read/modify/write cycle cannot preserve a stale heartbeat.
        body = {**payload, "updated_at": datetime.now(UTC).isoformat()}
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(body, indent=2, default=str), encoding="utf-8")
        tmp.replace(path)


def read_checkpoint(project_id: UUID | str, element: str) -> dict[str, Any]:
    with _CHECKPOINT_LOCK:
        path = _checkpoint_path(project_id, element)
        if not path.exists():
            return {}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}


def create_run(project_id: str, element: str, quality: str, force: bool) -> str | None:
    write_checkpoint(project_id, element, {
        "element": element, "quality": quality, "force": force, "status": "running",
        "current_stage": "scope", "progress": 1,
    })
    if not _tables_ready():
        return None
    with transaction() as conn:
        row = conn.execute(
            """INSERT INTO takeoff_harness_run(project_id,element,quality,force,status,current_stage,progress,message,checkpoint_json)
               VALUES (%s,%s,%s,%s,'running','scope',1,'Starting element harness',%s) RETURNING id""",
            (project_id, element, quality, force, Jsonb({"quality": quality, "force": force})),
        ).fetchone()
    return str(row["id"])


def event(run_id: str | None, project_id: str, element: str, stage: str, kind: str, message: str,
          payload: dict[str, Any] | None = None, *, progress: int | None = None) -> None:
    with _CHECKPOINT_LOCK:
        checkpoint = read_checkpoint(project_id, element)
        checkpoint.update({
            "element": element,
            "status": "running" if kind not in {"run_completed", "run_failed"} else ("completed" if kind == "run_completed" else "failed"),
            "current_stage": stage,
            "message": message,
        })
        if progress is not None:
            checkpoint["progress"] = progress
        if payload:
            checkpoint["last_payload"] = payload
        write_checkpoint(project_id, element, checkpoint)
    if not run_id or not _tables_ready():
        return
    with transaction() as conn:
        conn.execute(
            """INSERT INTO takeoff_harness_event(run_id,stage,event_kind,message,payload_json)
               VALUES (%s,%s,%s,%s,%s)""",
            (run_id, stage, kind, message, Jsonb(payload or {})),
        )
        fields = ["current_stage=%s", "message=%s", "checkpoint_json=%s", "updated_at=now()"]
        params: list[Any] = [stage, message, Jsonb(checkpoint)]
        if progress is not None:
            fields.append("progress=%s")
            params.append(progress)
        params.append(run_id)
        conn.execute(f"UPDATE takeoff_harness_run SET {','.join(fields)} WHERE id=%s", tuple(params))


def complete_stage(run_id: str | None, project_id: str, element: str, stage: str,
                   artifact: dict[str, Any] | None = None) -> None:
    """Durably mark a lifecycle stage complete.

    Stage artifacts are intentionally compact summaries. Large model results continue to
    live in the element engines' content-addressed caches and normalized project tables.
    """
    with _CHECKPOINT_LOCK:
        checkpoint = read_checkpoint(project_id, element)
        completed = list(checkpoint.get("completed_stages") or [])
        if stage not in completed:
            completed.append(stage)
        artifacts = dict(checkpoint.get("stage_artifacts") or {})
        artifacts[stage] = artifact or {}
        checkpoint.update({"completed_stages": completed, "stage_artifacts": artifacts, "current_stage": stage})
        write_checkpoint(project_id, element, checkpoint)
    if not run_id or not _tables_ready():
        return
    with transaction() as conn:
        conn.execute(
            "UPDATE takeoff_harness_run SET checkpoint_json=%s,current_stage=%s,updated_at=now() WHERE id=%s",
            (Jsonb(checkpoint), stage, run_id),
        )


def heartbeat(run_id: str | None, project_id: str, element: str) -> None:
    with _CHECKPOINT_LOCK:
        checkpoint = read_checkpoint(project_id, element)
        if checkpoint.get("status") != "running":
            return
        write_checkpoint(project_id, element, checkpoint)
    if not run_id or not _tables_ready():
        return
    with transaction() as conn:
        conn.execute("UPDATE takeoff_harness_run SET updated_at=now() WHERE id=%s AND status='running'", (run_id,))


def finish_run(run_id: str | None, project_id: str, element: str, *, status: str,
               evaluator: dict[str, Any] | None = None, error: str | None = None) -> None:
    with _CHECKPOINT_LOCK:
        checkpoint = read_checkpoint(project_id, element)
        checkpoint.update({
            "status": status,
            "current_stage": "check",
            "progress": 100,
            "evaluator": evaluator or {},
            "error": error,
        })
        write_checkpoint(project_id, element, checkpoint)
    if not run_id or not _tables_ready():
        return
    with transaction() as conn:
        conn.execute(
            """UPDATE takeoff_harness_run SET status=%s,current_stage='check',progress=100,
                      evaluator_json=%s,error_message=%s,updated_at=now() WHERE id=%s""",
            (status, Jsonb(evaluator or {}), error, run_id),
        )


def latest_run(project_id: UUID | str, element: str) -> dict[str, Any]:
    if _tables_ready():
        row = fetch_one(
            "SELECT * FROM takeoff_harness_run WHERE project_id=%s AND element=%s ORDER BY created_at DESC LIMIT 1",
            (str(project_id), element),
        )
        if row:
            value = dict(row)
            # A process-local worker cannot truthfully report a historical run as active
            # forever. The element engine performs immediate lock-aware recovery; this is
            # the durable backstop for server restarts and multi-worker deployments.
            if value.get("status") == "running":
                updated = value.get("updated_at")
                if updated and getattr(updated, "tzinfo", None) is None:
                    updated = updated.replace(tzinfo=UTC)
                if updated and (datetime.now(UTC) - updated).total_seconds() > 120:
                    with transaction() as conn:
                        conn.execute(
                            """UPDATE takeoff_harness_run SET status='failed',error_message='interrupted',
                                      message='Previous harness worker was interrupted; retry can reuse cached evidence',updated_at=now()
                               WHERE id=%s AND status='running'""",
                            (str(value["id"]),),
                        )
                    value.update({
                        "status": "failed", "error_message": "interrupted", "recoverable": True,
                        "message": "Previous harness worker was interrupted; retry can reuse cached evidence",
                    })
            return value
    checkpoint = read_checkpoint(project_id, element)
    if checkpoint.get("status") == "running" and checkpoint.get("updated_at"):
        try:
            updated = datetime.fromisoformat(str(checkpoint["updated_at"]).replace("Z", "+00:00"))
            if updated.tzinfo is None:
                updated = updated.replace(tzinfo=UTC)
            if (datetime.now(UTC) - updated).total_seconds() > 120:
                checkpoint.update({
                    "status": "failed", "error": "interrupted", "recoverable": True,
                    "message": "Previous harness worker was interrupted; retry can reuse cached evidence",
                })
                write_checkpoint(project_id, element, checkpoint)
        except (TypeError, ValueError):
            pass
    return checkpoint


def list_events(project_id: UUID | str, element: str, limit: int = 250) -> list[dict[str, Any]]:
    if not _tables_ready():
        checkpoint = read_checkpoint(project_id, element)
        if not checkpoint:
            return []
        return [{
            "stage": checkpoint.get("current_stage"),
            "event_kind": "checkpoint",
            "message": checkpoint.get("message"),
            "payload_json": checkpoint.get("last_payload") or {},
            "created_at": checkpoint.get("updated_at"),
        }]
    from ....database.connection import fetch_all
    rows = fetch_all(
        """SELECT e.* FROM takeoff_harness_event e JOIN takeoff_harness_run r ON r.id=e.run_id
           WHERE r.project_id=%s AND r.element=%s ORDER BY e.id DESC LIMIT %s""",
        (str(project_id), element, max(1, min(int(limit), 1000))),
    )
    return list(reversed(rows))
