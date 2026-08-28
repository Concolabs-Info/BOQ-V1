from __future__ import annotations

from typing import Any

from ....database.connection import fetch_all, fetch_one, transaction
from ....database.json_value import Jsonb


def answered_choice(project_id: str, element: str, frame_version: int, scope_ref: str, code: str) -> str | None:
    row = fetch_one(
        """SELECT answer_json FROM takeoff_scope_question
           WHERE project_id=%s AND element=%s AND frame_version=%s AND scope_ref=%s AND code=%s AND status='answered'""",
        (project_id, element, frame_version, scope_ref, code),
    )
    answer = (row or {}).get("answer_json") or {}
    choice = answer.get("choice") if isinstance(answer, dict) else None
    return str(choice) if choice else None


def sync_questions(project_id: str, element: str, frame_version: int, questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    wanted = {(q["scope_ref"], q["code"]) for q in questions}
    with transaction() as conn:
        existing = conn.execute(
            """SELECT id,scope_ref,code,status FROM takeoff_scope_question
               WHERE project_id=%s AND element=%s AND frame_version=%s""",
            (project_id, element, frame_version),
        ).fetchall()
        for row in existing:
            key = (row["scope_ref"], row["code"])
            if row["status"] == "open" and key not in wanted:
                conn.execute("UPDATE takeoff_scope_question SET status='dismissed' WHERE id=%s", (row["id"],))
        for q in questions:
            conn.execute(
                """INSERT INTO takeoff_scope_question(project_id,element,frame_version,scope_ref,code,kind,prompt,effect,
                       options_json,entity_refs,status)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'open')
                   ON CONFLICT(project_id,element,frame_version,scope_ref,code) DO UPDATE SET
                     kind=excluded.kind,prompt=excluded.prompt,effect=excluded.effect,
                     options_json=excluded.options_json,entity_refs=excluded.entity_refs,
                     status=CASE WHEN takeoff_scope_question.status='answered' THEN 'answered' ELSE 'open' END""",
                (
                    project_id,
                    element,
                    frame_version,
                    q["scope_ref"],
                    q["code"],
                    q["kind"],
                    q["prompt"],
                    q.get("effect", "hold"),
                    Jsonb(q.get("options") or []),
                    Jsonb(q.get("entity_refs") or []),
                ),
            )
    return list_questions(project_id, element, frame_version)


def list_questions(project_id: str, element: str, frame_version: int) -> list[dict[str, Any]]:
    return fetch_all(
        """SELECT id,scope_ref,code,kind,prompt,effect,options_json AS options,entity_refs,status,answer_json AS answer,
                  created_at,answered_at
           FROM takeoff_scope_question
           WHERE project_id=%s AND element=%s AND frame_version=%s AND status IN ('open','answered')
           ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, created_at""",
        (project_id, element, frame_version),
    )


def answer_question(project_id: str, element: str, frame_version: int, question_id: str, answer: dict[str, Any]) -> dict[str, Any]:
    row = fetch_one(
        """SELECT * FROM takeoff_scope_question
           WHERE id=%s AND project_id=%s AND element=%s AND frame_version=%s""",
        (question_id, project_id, element, frame_version),
    )
    if not row:
        raise ValueError("Scope question not found")
    if row["kind"] == "single_choice":
        choice = answer.get("choice")
        allowed = {str(item.get("value")) for item in (row.get("options_json") or []) if isinstance(item, dict)}
        if not choice or str(choice) not in allowed:
            raise ValueError("Answer must choose one of the supplied options")
    with transaction() as conn:
        updated = conn.execute(
            """UPDATE takeoff_scope_question SET status='answered',answer_json=%s,answered_at=now()
               WHERE id=%s RETURNING *""",
            (Jsonb(answer), question_id),
        ).fetchone()
    return dict(updated)
