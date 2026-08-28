"""SQLite repository layer. All node/db access goes through here — no raw SQL in graph nodes."""
from __future__ import annotations

import json
import sqlite3
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def connect(db_path: str | Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA foreign_keys=ON")
    return con


def migrate(db_path: str | Path) -> None:
    con = connect(db_path)
    try:
        con.executescript(SCHEMA_PATH.read_text())
        con.commit()
    finally:
        con.close()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def now() -> str:
    return datetime.now(UTC).isoformat()


class Repo:
    def __init__(self, db_path: str | Path):
        self.db_path = str(db_path)

    @contextmanager
    def _con(self) -> Iterator[sqlite3.Connection]:
        """Return a transactional connection that is always closed.

        ``sqlite3.Connection``'s own context manager commits or rolls back, but
        deliberately does not close the connection. The Beam engine opens a
        connection per repository operation, so relying on that behavior leaves
        database handles alive until garbage collection and prevents a Windows
        re-analysis from replacing or moving Beam files.
        """
        con = connect(self.db_path)
        try:
            with con:
                yield con
        finally:
            con.close()

    # -- runs -----------------------------------------------------------------
    def create_run(self, pdf_path: str) -> str:
        run_id = new_id("run")
        with self._con() as con:
            con.execute(
                "INSERT INTO runs(id, pdf_path, status, created_at) VALUES (?,?,?,?)",
                (run_id, pdf_path, "created", now()),
            )
        return run_id

    def update_run(self, run_id: str, **fields) -> None:
        cols = ", ".join(f"{k}=?" for k in fields)
        with self._con() as con:
            con.execute(f"UPDATE runs SET {cols} WHERE id=?", (*fields.values(), run_id))

    def get_run(self, run_id: str) -> dict | None:
        with self._con() as con:
            row = con.execute("SELECT * FROM runs WHERE id=?", (run_id,)).fetchone()
        return dict(row) if row else None

    # -- extraction index -----------------------------------------------------
    def add_sheet(self, run_id: str, page_index: int, width: float, height: float,
                  thumb_path: str, hires_path: str) -> None:
        with self._con() as con:
            con.execute(
                "INSERT INTO sheets(run_id, page_index, width, height, thumb_path, hires_path)"
                " VALUES (?,?,?,?,?,?)",
                (run_id, page_index, width, height, thumb_path, hires_path),
            )

    def update_sheet(self, run_id: str, page_index: int, **fields) -> None:
        cols = ", ".join(f"{k}=?" for k in fields)
        with self._con() as con:
            con.execute(
                f"UPDATE sheets SET {cols} WHERE run_id=? AND page_index=?",
                (*fields.values(), run_id, page_index),
            )

    def add_viewport(self, run_id: str, page_index: int, kind: str, bbox: list[float],
                     title: str | None = None, scale_text: str | None = None,
                     scale_denom: float | None = None, confidence: float | None = None) -> str:
        vid = new_id("vp")
        with self._con() as con:
            con.execute(
                "INSERT INTO viewports(id, run_id, page_index, kind, title, bbox,"
                " scale_text, scale_denom, confidence) VALUES (?,?,?,?,?,?,?,?,?)",
                (vid, run_id, page_index, kind, title, json.dumps(bbox),
                 scale_text, scale_denom, confidence),
            )
        return vid

    def replace_page_viewports(self, run_id: str, page_index: int, rows: list[dict]) -> list[str]:
        with self._con() as con:
            con.execute("DELETE FROM viewports WHERE run_id=? AND page_index=?",
                        (run_id, page_index))
        ids = []
        for r in rows:
            ids.append(self.add_viewport(
                run_id, page_index, r["kind"], r["bbox"],
                title=r.get("title"), scale_text=r.get("scale_text"),
                scale_denom=r.get("scale_denom"), confidence=r.get("confidence")))
        return ids

    def update_viewport(self, viewport_id: str, **fields) -> None:
        if not fields:
            return
        cols = ", ".join(f"{k}=?" for k in fields)
        with self._con() as con:
            con.execute(f"UPDATE viewports SET {cols} WHERE id=?",
                        (*fields.values(), viewport_id))

    def viewport(self, viewport_id: str) -> dict | None:
        with self._con() as con:
            row = con.execute("SELECT * FROM viewports WHERE id=?", (viewport_id,)).fetchone()
        return dict(row) if row else None

    def viewports(self, run_id: str, page_index: int | None = None,
                  kind: str | None = None) -> list[dict]:
        q, args = "SELECT * FROM viewports WHERE run_id=?", [run_id]
        if page_index is not None:
            q += " AND page_index=?"
            args.append(page_index)
        if kind:
            q += " AND kind=?"
            args.append(kind)
        with self._con() as con:
            return [dict(r) for r in con.execute(q + " ORDER BY page_index, id", args)]

    def sheets(self, run_id: str, category: str | None = None) -> list[dict]:
        q = "SELECT * FROM sheets WHERE run_id=?"
        args: list = [run_id]
        if category:
            q += " AND category=?"
            args.append(category)
        with self._con() as con:
            return [dict(r) for r in con.execute(q + " ORDER BY page_index", args)]

    def add_layers(self, run_id: str, page_index: int, names: list[str]) -> None:
        with self._con() as con:
            con.executemany(
                "INSERT INTO layers(run_id, page_index, name) VALUES (?,?,?)",
                [(run_id, page_index, n) for n in names],
            )

    def layers(self, run_id: str, page_index: int | None = None) -> list[str]:
        q, args = "SELECT DISTINCT name FROM layers WHERE run_id=?", [run_id]
        if page_index is not None:
            q += " AND page_index=?"
            args.append(page_index)
        with self._con() as con:
            return [r["name"] for r in con.execute(q, args)]

    def add_paths(self, run_id: str, page_index: int, rows: list[dict]) -> None:
        with self._con() as con:
            con.executemany(
                "INSERT INTO paths(run_id, page_index, layer, dashed, x0, y0, x1, y1, length)"
                " VALUES (?,?,?,?,?,?,?,?,?)",
                [(run_id, page_index, r.get("layer"), int(r["dashed"]),
                  r["x0"], r["y0"], r["x1"], r["y1"], r["length"]) for r in rows],
            )

    def paths(self, run_id: str, page_index: int, dashed: bool | None = None) -> list[dict]:
        q, args = "SELECT * FROM paths WHERE run_id=? AND page_index=?", [run_id, page_index]
        if dashed is not None:
            q += " AND dashed=?"
            args.append(int(dashed))
        with self._con() as con:
            return [dict(r) for r in con.execute(q, args)]

    def add_texts(self, run_id: str, page_index: int, rows: list[dict]) -> None:
        with self._con() as con:
            con.executemany(
                "INSERT INTO texts(run_id, page_index, text, x0, y0, x1, y1) VALUES (?,?,?,?,?,?,?)",
                [(run_id, page_index, r["text"], r["x0"], r["y0"], r["x1"], r["y1"]) for r in rows],
            )

    def texts(self, run_id: str, page_index: int | None = None) -> list[dict]:
        q, args = "SELECT * FROM texts WHERE run_id=?", [run_id]
        if page_index is not None:
            q += " AND page_index=?"
            args.append(page_index)
        with self._con() as con:
            return [dict(r) for r in con.execute(q, args)]

    # -- evidence -------------------------------------------------------------
    def add_evidence(self, run_id: str, page_index: int, bbox: list[float], crop_path: str,
                     sheet_no: str | None = None, sheet_title: str | None = None,
                     note: str | None = None) -> str:
        eid = new_id("ev")
        with self._con() as con:
            con.execute(
                "INSERT INTO evidence(id, run_id, page_index, sheet_no, sheet_title, bbox,"
                " crop_path, note) VALUES (?,?,?,?,?,?,?,?)",
                (eid, run_id, page_index, sheet_no, sheet_title, json.dumps(bbox), crop_path, note),
            )
        return eid

    def evidence(self, evidence_id: str) -> dict | None:
        with self._con() as con:
            row = con.execute("SELECT * FROM evidence WHERE id=?", (evidence_id,)).fetchone()
        return dict(row) if row else None

    # -- questions ------------------------------------------------------------
    def add_question(self, run_id: str, stage: str, kind: str, text: str,
                     evidence_id: str | None = None) -> str:
        qid = new_id("q")
        with self._con() as con:
            con.execute(
                "INSERT INTO questions(id, run_id, stage, kind, text, evidence_id, created_at)"
                " VALUES (?,?,?,?,?,?,?)",
                (qid, run_id, stage, kind, text, evidence_id, now()),
            )
        return qid

    def open_questions(self, run_id: str, stage: str | None = None) -> list[dict]:
        q, args = "SELECT * FROM questions WHERE run_id=? AND status='open'", [run_id]
        if stage:
            q += " AND stage=?"
            args.append(stage)
        with self._con() as con:
            return [dict(r) for r in con.execute(q, args)]

    def questions_all(self, run_id: str) -> list[dict]:
        with self._con() as con:
            return [dict(r) for r in con.execute(
                "SELECT * FROM questions WHERE run_id=? ORDER BY created_at", (run_id,))]

    def answer_question(self, question_id: str, answer: str) -> None:
        with self._con() as con:
            con.execute(
                "UPDATE questions SET status='answered', answer=? WHERE id=?",
                (answer, question_id),
            )

    # -- gates ----------------------------------------------------------------
    def set_gate(self, run_id: str, stage: str, payload: dict) -> None:
        with self._con() as con:
            con.execute(
                "INSERT INTO gates(run_id, stage, status, payload) VALUES (?,?,'pending',?)"
                " ON CONFLICT(run_id, stage) DO UPDATE SET payload=excluded.payload,"
                " status='pending'",
                (run_id, stage, json.dumps(payload)),
            )

    def confirm_gate(self, run_id: str, stage: str, response: dict) -> None:
        with self._con() as con:
            con.execute(
                "UPDATE gates SET status='confirmed', response=? WHERE run_id=? AND stage=?",
                (json.dumps(response), run_id, stage),
            )

    def gate(self, run_id: str, stage: str) -> dict | None:
        with self._con() as con:
            row = con.execute(
                "SELECT * FROM gates WHERE run_id=? AND stage=?", (run_id, stage)
            ).fetchone()
        return dict(row) if row else None

    # -- beams ----------------------------------------------------------------
    def add_beam(self, run_id: str, page_index: int, centerline: tuple, status: str,
                 source: dict, mark: str | None = None, edge_gap: float | None = None) -> str:
        bid = new_id("beam")
        x0, y0, x1, y1 = centerline
        with self._con() as con:
            con.execute(
                "INSERT INTO beams(id, run_id, page_index, mark, x0, y0, x1, y1, status,"
                " source, edge_gap) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (bid, run_id, page_index, mark, x0, y0, x1, y1, status,
                 json.dumps(source), edge_gap),
            )
        return bid

    def beams(self, run_id: str, status: str | None = None) -> list[dict]:
        q, args = "SELECT * FROM beams WHERE run_id=?", [run_id]
        if status:
            q += " AND status=?"
            args.append(status)
        with self._con() as con:
            return [dict(r) for r in con.execute(q, args)]

    def update_beam(self, beam_id: str, **fields) -> None:
        cols = ", ".join(f"{k}=?" for k in fields)
        with self._con() as con:
            con.execute(f"UPDATE beams SET {cols} WHERE id=?", (*fields.values(), beam_id))

    def set_beam_dims(self, beam_id: str, height_mm: float | None, thickness_mm: float | None,
                      source_kind: str, method: str, evidence_id: str | None,
                      status: str = "proposed") -> None:
        with self._con() as con:
            con.execute(
                "INSERT INTO beam_dims(beam_id, height_mm, thickness_mm, source_kind, method,"
                " evidence_id, status) VALUES (?,?,?,?,?,?,?)"
                " ON CONFLICT(beam_id) DO UPDATE SET height_mm=excluded.height_mm,"
                " thickness_mm=excluded.thickness_mm, source_kind=excluded.source_kind,"
                " method=excluded.method, evidence_id=excluded.evidence_id, status=excluded.status",
                (beam_id, height_mm, thickness_mm, source_kind, method, evidence_id, status),
            )

    def beam_dims(self, run_id: str) -> list[dict]:
        with self._con() as con:
            return [dict(r) for r in con.execute(
                "SELECT b.id AS beam_id, b.mark, b.page_index, d.height_mm, d.thickness_mm,"
                " d.source_kind, d.method, d.evidence_id, d.status"
                " FROM beams b LEFT JOIN beam_dims d ON d.beam_id = b.id"
                " WHERE b.run_id=? AND b.status='confirmed'", (run_id,))]

    # -- intersections / lengths ---------------------------------------------
    def add_intersection(self, run_id: str, a_beam: str, b_beam: str, x: float, y: float,
                         owner: str | None, rule: str | None,
                         evidence_id: str | None = None) -> str:
        iid = new_id("ix")
        with self._con() as con:
            con.execute(
                "INSERT INTO intersections(id, run_id, a_beam, b_beam, x, y, owner, rule,"
                " evidence_id) VALUES (?,?,?,?,?,?,?,?,?)",
                (iid, run_id, a_beam, b_beam, x, y, owner, rule, evidence_id),
            )
        return iid

    def intersections(self, run_id: str) -> list[dict]:
        with self._con() as con:
            return [dict(r) for r in con.execute(
                "SELECT * FROM intersections WHERE run_id=?", (run_id,))]

    def update_intersection(self, iid: str, **fields) -> None:
        cols = ", ".join(f"{k}=?" for k in fields)
        with self._con() as con:
            con.execute(f"UPDATE intersections SET {cols} WHERE id=?", (*fields.values(), iid))

    def set_beam_length(self, beam_id: str, gross_m: float, net_m: float,
                        deductions: list[dict]) -> None:
        with self._con() as con:
            con.execute(
                "INSERT INTO beam_lengths(beam_id, gross_m, net_m, deductions) VALUES (?,?,?,?)"
                " ON CONFLICT(beam_id) DO UPDATE SET gross_m=excluded.gross_m,"
                " net_m=excluded.net_m, deductions=excluded.deductions",
                (beam_id, gross_m, net_m, json.dumps(deductions)),
            )

    def beam_lengths(self, run_id: str) -> list[dict]:
        with self._con() as con:
            return [dict(r) for r in con.execute(
                "SELECT l.* FROM beam_lengths l JOIN beams b ON b.id = l.beam_id"
                " WHERE b.run_id=?", (run_id,))]

    # -- workbook -------------------------------------------------------------
    def add_workbook_row(self, run_id: str, family: str, scope: str, calc: str, qty: float,
                         unit: str, status: str, source: dict) -> None:
        with self._con() as con:
            con.execute(
                "INSERT INTO workbook(run_id, family, scope, calc, qty, unit, status, source)"
                " VALUES (?,?,?,?,?,?,?,?)",
                (run_id, family, scope, calc, qty, unit, status, json.dumps(source)),
            )

    def workbook(self, run_id: str) -> list[dict]:
        with self._con() as con:
            return [dict(r) for r in con.execute(
                "SELECT * FROM workbook WHERE run_id=?", (run_id,))]
