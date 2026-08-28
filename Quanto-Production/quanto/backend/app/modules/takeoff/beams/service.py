from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import threading
import traceback
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pymupdf

from ....core.config import get_settings
from ....database.connection import fetch_all, fetch_one
from ....services.storage.paths import project_root, resolve_key

ENGINE_ROOT = Path(__file__).resolve().parent / "engine"
if str(ENGINE_ROOT) not in sys.path:
    # The supplied Beam project uses top-level imports (geometry.*, vision.*, db.*).
    # Keep those files intact and give the embedded engine the same import root.
    sys.path.insert(0, str(ENGINE_ROOT))

from db.repo import Repo, migrate  # type: ignore  # noqa: E402
from geometry.scale import mm_per_point  # type: ignore  # noqa: E402

_LOCKS: dict[str, threading.Lock] = {}
_LOCK_GUARD = threading.Lock()

STAGES = [
    ("S0", "Preparing beam drawings"),
    ("S1", "Finding beam plans and supporting information"),
    ("S2", "Checking scale and beam information"),
    ("S3", "Detecting beams"),
    ("S4", "Resolving beam sizes"),
    ("S5", "Checking junctions and net lengths"),
    ("S6", "Calculating beam quantities"),
]
STAGE_PROGRESS = {"S0": 8, "S1": 22, "S2": 36, "S3": 58, "S4": 72, "S5": 88, "S6": 97}
PALETTE = ["#e11d48", "#ea580c", "#ca8a04", "#2563eb", "#7c3aed", "#0891b2", "#be123c", "#0f766e"]


def _dir(project_id: UUID | str) -> Path:
    out = project_root(project_id) / "beams"
    out.mkdir(parents=True, exist_ok=True)
    return out


def _status_path(project_id: UUID | str) -> Path:
    return _dir(project_id) / "status.json"


def _meta_path(project_id: UUID | str) -> Path:
    return _dir(project_id) / "meta.json"


def _editor_path(project_id: UUID | str) -> Path:
    return _dir(project_id) / "editor_state.json"


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text()) if path.exists() else default
    except (OSError, json.JSONDecodeError):
        return default


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, indent=2, default=str))
    tmp.replace(path)


def _set_status(project_id: UUID | str, status: str, stage: str, progress: int, message: str, **extra: Any) -> None:
    payload = {"status": status, "stage": stage, "progress": progress, "message": message, **extra}
    _write_json(_status_path(project_id), payload)


def _configure_engine() -> None:
    settings = get_settings()
    if settings.openai_api_key:
        os.environ["OPENAI_API_KEY"] = settings.openai_api_key
    if settings.openai_model:
        os.environ.setdefault("OPENAI_MODEL", settings.openai_model)
    os.environ.setdefault("BEAM_MODEL", os.environ.get("BEAM_MODEL") or "gpt-5.6-sol")
    os.environ.setdefault("BEAM_REASONING", "medium")
    os.environ.setdefault("BEAM_MODEL_RETRIES", "2")
    os.environ.setdefault("BEAM_VISION_PROVIDER", "quanto-openai")
    if settings.openai_api_key:
        # Beam uses its own hidden OpenAI connection whenever the project has an
        # OpenAI key. This remains independent of whichever provider Pre uses.
        os.environ.setdefault("BEAM_VISION_MODE", "live")
        os.environ.setdefault("BEAM_AGENTIC", "1")
    else:
        # The exact deterministic Beam engine still runs; only external visual
        # corroboration falls back to its original stub mode when no API is configured.
        os.environ.setdefault("BEAM_VISION_MODE", "stub")
        os.environ.setdefault("BEAM_AGENTIC", "0")


def _source_hash(project: dict) -> str:
    frame = project.get("pre_frame") or {}
    docs = frame.get("source_documents") or []
    payload = {
        "frame_version": project.get("frame_version"),
        "documents": [(d.get("id"), d.get("sha256"), d.get("page_count")) for d in docs],
    }
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()


def _beam_relevant(viewport: dict) -> bool:
    subjects = {str(x).lower() for x in (viewport.get("subjects") or [])}
    discipline = str(viewport.get("discipline") or "").lower()
    kind = str(viewport.get("view_kind") or "").lower()
    name = str(viewport.get("name") or "").lower()
    if "beam" in subjects or "ground_beam" in subjects:
        return True
    if discipline == "structural" and subjects.intersection({"column", "slab", "reinforcement", "connection", "structural_wall"}):
        return True
    if discipline == "structural" and kind in {"plan", "schedule", "section", "detail", "notes", "legend"}:
        return True
    return "beam" in name or "framing" in name


def _select_source_pages(project_id: str, frame: dict) -> list[dict]:
    sheets = {str(s["id"]): s for s in frame.get("sheets") or []}
    selected: dict[str, dict] = {}
    levels_by_vp = {str(v.get("id")): v.get("level_label") for v in frame.get("viewports") or []}

    for vp in frame.get("viewports") or []:
        if not _beam_relevant(vp):
            continue
        sheet = sheets.get(str(vp.get("sheet_id")))
        if not sheet:
            continue
        key = str(sheet["page_id"])
        item = selected.setdefault(key, {**sheet, "level_labels": [], "reasons": []})
        if vp.get("level_label") and vp.get("level_label") not in item["level_labels"]:
            item["level_labels"].append(vp.get("level_label"))
        item["reasons"].append(vp.get("name") or vp.get("view_kind") or "structural")

    # Include pages carrying beam/concrete schedules/notes discovered during Pre.
    spec_rows = fetch_all(
        """SELECT si.page_id,si.name,si.topic,si.raw_text,p.document_id,p.page_number,p.width_pt,p.height_pt,
                  s.id AS sheet_id,s.sheet_no,s.title,s.discipline
           FROM spec_item si JOIN page p ON p.id=si.page_id LEFT JOIN sheet s ON s.page_id=p.id
           WHERE si.project_id=%s AND si.page_id IS NOT NULL""",
        (project_id,),
    )
    for row in spec_rows:
        text = " ".join(str(row.get(k) or "") for k in ("name", "topic", "raw_text")).lower()
        if not re.search(r"\b(beam|concrete|reinforcement|rebar|structural|framing)\b", text):
            continue
        key = str(row["page_id"])
        item = selected.setdefault(key, {**row, "level_labels": [], "reasons": []})
        item["reasons"].append(row.get("name") or "specification")

    # If Pre found no beam-specific evidence, use included structural sheets. If
    # that is also empty, fall back to the included sheet set rather than asking
    # the user to upload the same PDF again.
    if not selected:
        for sheet in frame.get("sheets") or []:
            discipline = str(sheet.get("discipline") or "").lower()
            if discipline == "structural":
                selected[str(sheet["page_id"])] = {**sheet, "level_labels": [], "reasons": ["structural sheet"]}
    if not selected:
        for sheet in frame.get("sheets") or []:
            selected[str(sheet["page_id"])] = {**sheet, "level_labels": [], "reasons": ["included drawing"]}

    rows = list(selected.values())
    rows.sort(key=lambda x: (str(x.get("document_id")), int(x.get("page_number") or 0)))
    return rows


def _stage_pdf(project_id: str, frame: dict, run_dir: Path) -> tuple[Path, list[dict]]:
    pages = _select_source_pages(project_id, frame)
    if not pages:
        raise RuntimeError("No project drawings are available for Beam analysis")
    docs = {
        str(r["id"]): r
        for r in fetch_all("SELECT id,filename,storage_key FROM document WHERE project_id=%s AND status='ready'", (project_id,))
    }
    staged = pymupdf.open()
    source_map: list[dict] = []
    opened: dict[str, pymupdf.Document] = {}
    try:
        for row in pages:
            did = str(row.get("document_id"))
            docrow = docs.get(did)
            if not docrow:
                continue
            if did not in opened:
                opened[did] = pymupdf.open(resolve_key(docrow["storage_key"]))
            source = opened[did]
            page_no = int(row["page_number"]) - 1
            if page_no < 0 or page_no >= len(source):
                continue
            staged.insert_pdf(source, from_page=page_no, to_page=page_no)
            source_map.append({
                "staged_page_index": len(source_map),
                "source_document_id": did,
                "source_document": docrow["filename"],
                "source_page_number": int(row["page_number"]),
                "sheet_id": str(row.get("sheet_id") or row.get("id") or ""),
                "sheet_no": row.get("sheet_no"),
                "title": row.get("title"),
                "discipline": row.get("discipline"),
                "level_label": (row.get("level_labels") or [None])[0],
                "reasons": row.get("reasons") or [],
            })
        if not source_map:
            raise RuntimeError("Beam drawings could not be prepared from the project PDFs")
        run_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = run_dir / "beam_input.pdf"
        staged.save(pdf_path, garbage=4, deflate=True)
        _write_json(run_dir / "source_map.json", source_map)
        return pdf_path, source_map
    finally:
        staged.close()
        for doc in opened.values():
            doc.close()


def _auto_gate(repo: Repo, run_id: str, gate: str) -> None:
    """Apply the same defaults as submitting each original Beam gate unchanged."""
    if gate == "GATE1":
        repo.confirm_gate(run_id, gate, {"confirmed": True, "automatic": True})
        repo.update_run(run_id, status="running", stage="S1:done")
        return
    if gate == "GATE2":
        repo.confirm_gate(run_id, gate, {"confirmed": True, "automatic": True})
        repo.update_run(run_id, status="running", stage="S2:done")
        return
    if gate == "GATE3":
        for beam in repo.beams(run_id):
            if beam["status"] in ("candidate", "uncertain"):
                repo.update_beam(beam["id"], status="confirmed")
        repo.confirm_gate(run_id, gate, {"confirmed": True, "automatic": True})
        repo.update_run(run_id, status="running", stage="S3:done")
        return
    if gate == "GATE4":
        for dim in repo.beam_dims(run_id):
            if dim["status"] == "proposed" and dim["height_mm"] is not None:
                repo.set_beam_dims(dim["beam_id"], dim["height_mm"], dim["thickness_mm"], dim["source_kind"], dim["method"], dim["evidence_id"], status="confirmed")
        repo.confirm_gate(run_id, gate, {"confirmed": True, "automatic": True})
        repo.update_run(run_id, status="running", stage="S4:done")
        return
    if gate == "GATE5":
        repo.confirm_gate(run_id, gate, {"confirmed": True, "automatic": True})
        repo.update_run(run_id, status="running", stage="S5:done")
        return
    if gate == "FINAL":
        repo.confirm_gate(run_id, gate, {"confirmed": True, "automatic": True})
        repo.update_run(run_id, status="done", stage="S6:done")


def _run_engine(project_id: str, *, force: bool = False, lock_acquired: bool = False) -> None:
    lock = _project_lock(project_id)
    if not lock_acquired and not lock.acquire(blocking=False):
        return
    out = _dir(project_id)
    try:
        _configure_engine()
        project = fetch_one("SELECT id,pre_status,pre_frame,frame_version FROM project WHERE id=%s", (project_id,))
        if not project:
            raise RuntimeError("Project not found")
        if project.get("pre_status") != "frozen" or not project.get("pre_frame"):
            raise RuntimeError("Complete Pre before Beam analysis")
        src_hash = _source_hash(project)
        meta = _read_json(_meta_path(project_id), {})
        db_path = out / "beam_engine.db"
        resumable: tuple[Repo, dict] | None = None
        if meta.get("source_hash") == src_hash and meta.get("run_id") and db_path.exists():
            existing_repo = Repo(db_path)
            run = existing_repo.get_run(meta["run_id"])
            if run:
                if run.get("status") == "done" and not force:
                    _set_status(project_id, "done", "S6", 100, "Beam analysis complete", run_id=meta["run_id"])
                    return
                if run.get("status") != "done" and Path(run.get("pdf_path") or "").exists():
                    resumable = (existing_repo, run)

        # Runs are row-scoped in the Beam schema. Keep the database and previous
        # run artifacts intact so a retry never needs to delete a SQLite file
        # which may still be serving the UI on Windows.
        assets = out / "assets"
        assets.mkdir(parents=True, exist_ok=True)

        resume_stage: str | None = None
        resume_after_stage = False
        if resumable:
            repo, run = resumable
            run_id = str(run["id"])
            pdf_path = Path(run["pdf_path"])
            source_map = meta.get("source_map") or []
            run_assets = assets / run_id
            run_assets.mkdir(parents=True, exist_ok=True)
            stored_stage = str(run.get("stage") or "S0")
            resume_stage = stored_stage.split(":", 1)[0]
            resume_after_stage = stored_stage.endswith(":done")
        else:
            _set_status(project_id, "running", "S0", 2, "Preparing beam drawings")
            run_dir = out / "runs" / f"pending_{uuid4().hex[:10]}"
            pdf_path, source_map = _stage_pdf(project_id, project["pre_frame"], run_dir)
            migrate(db_path)
            repo = Repo(db_path)
            run_id = repo.create_run(str(pdf_path))
            run_assets = assets / run_id
            run_assets.mkdir(parents=True, exist_ok=True)
            _write_json(_meta_path(project_id), {"source_hash": src_hash, "run_id": run_id, "source_map": source_map})
        state = {"run_id": run_id, "db_path": str(db_path), "pdf_path": str(pdf_path), "assets_dir": str(run_assets)}

        # Import the supplied Beam stage module only when a Beam run starts.
        # This keeps the rest of Quanto bootable even before optional Beam
        # runtime dependencies have been installed.
        from graph import nodes as beam_nodes  # type: ignore

        stages = [
            ("S0", beam_nodes.s0_ingest, None),
            ("S1", beam_nodes.s1_triage, "GATE1"),
            ("S2", beam_nodes.s2_calibration, "GATE2"),
            ("S3", beam_nodes.s3_beam_id, "GATE3"),
            ("S4", beam_nodes.s4_dims, "GATE4"),
            ("S5", beam_nodes.s5_lengths, "GATE5"),
            ("S6", beam_nodes.s6_workbook, "FINAL"),
        ]
        labels = dict(STAGES)
        start_index = next((i for i, stage in enumerate(stages) if stage[0] == resume_stage), 0)
        if resume_after_stage:
            start_index += 1
        for code, fn, gate in stages[start_index:]:
            _set_status(project_id, "running", code, STAGE_PROGRESS[code], labels[code], run_id=run_id)
            fn(state)
            if gate:
                _auto_gate(repo, run_id, gate)

        _set_status(project_id, "done", "S6", 100, "Beam analysis complete", run_id=run_id)
        # Generate the editable Quanto projection immediately; original engine DB
        # remains intact as the source-of-truth result.
        editor = _adapt_engine_state(project_id, repo, run_id, source_map)
        _write_json(_editor_path(project_id), editor)
    except Exception as exc:  # noqa: BLE001
        _set_status(project_id, "error", "error", 100, str(exc)[:300], error=str(exc)[:1000], traceback=traceback.format_exc(limit=6))
    finally:
        lock.release()


def _project_lock(project_id: str) -> threading.Lock:
    with _LOCK_GUARD:
        return _LOCKS.setdefault(project_id, threading.Lock())


def start_analysis(project_id: UUID | str, *, force: bool = False) -> dict:
    pid = str(project_id)
    project = fetch_one("SELECT id,pre_status FROM project WHERE id=%s", (pid,))
    if not project:
        raise ValueError("Project not found")
    if project.get("pre_status") != "frozen":
        raise RuntimeError("Complete Pre before Beam analysis")
    lock = _project_lock(pid)
    if not lock.acquire(blocking=False):
        return _read_json(_status_path(pid), {"status": "running", "stage": "S0", "progress": 1, "message": "Preparing beam drawings"})
    thread = threading.Thread(
        target=_run_engine,
        kwargs={"project_id": pid, "force": force, "lock_acquired": True},
        daemon=True,
        name=f"beams-{pid[:8]}",
    )
    try:
        thread.start()
    except Exception:
        lock.release()
        raise
    return {"status": "running", "stage": "S0", "progress": 1, "message": "Preparing beam drawings"}


def ensure_analysis_started(project_id: UUID | str) -> dict:
    pid = str(project_id)
    project = fetch_one("SELECT id,pre_status,pre_frame,frame_version FROM project WHERE id=%s", (pid,))
    if not project:
        raise ValueError("Project not found")
    if project.get("pre_status") != "frozen":
        return {"status": "blocked", "stage": "pre", "progress": 0, "message": "Complete Pre before Beam analysis"}
    status = _read_json(_status_path(pid), {})
    meta = _read_json(_meta_path(pid), {})
    current_hash = _source_hash(project)
    stale = bool(meta and meta.get("source_hash") != current_hash)
    # State reads may start a project that has never run, but a failed analysis
    # remains failed until the user explicitly chooses Run analysis again. This
    # prevents polling GET requests from creating an uncontrolled retry loop and
    # preserves the original error for diagnosis.
    if stale or status.get("status") in {None, "", "idle"}:
        return start_analysis(pid, force=stale)
    return status


def _family_id(height: float | None, thickness: float | None) -> str:
    h = int(round(height or 0))
    t = int(round(thickness or 0))
    return f"BEAM-{t}X{h}" if h and t else "BEAM-UNRESOLVED"


def _adapt_engine_state(project_id: str, repo: Repo, run_id: str, source_map: list[dict]) -> dict:
    sheets = {s["page_index"]: s for s in repo.sheets(run_id)}
    dims = {d["beam_id"]: d for d in repo.beam_dims(run_id)}
    lengths = {r["beam_id"]: r for r in repo.beam_lengths(run_id)}
    questions = repo.questions_all(run_id)
    open_by_stage = [q for q in questions if q.get("status") == "open"]
    source_by_page = {int(x["staged_page_index"]): x for x in source_map}

    families: dict[str, dict] = {}
    beams: list[dict] = []
    for beam in repo.beams(run_id):
        if beam.get("status") == "rejected":
            continue
        dim = dims.get(beam["id"]) or {}
        length = lengths.get(beam["id"]) or {}
        h = float(dim["height_mm"]) if dim.get("height_mm") is not None else None
        t = float(dim["thickness_mm"]) if dim.get("thickness_mm") is not None else None
        fid = _family_id(h, t)
        if fid not in families:
            i = len(families)
            families[fid] = {
                "id": fid,
                "mark": f"{int(round(t))}×{int(round(h))}" if h and t else "Unresolved",
                "description": "RCC beam" if h and t else "Beam size needs review",
                "widthMm": int(round(t or 0)),
                "depthMm": int(round(h or 0)),
                "source": (dim.get("source_kind") or "Beam drawing").replace("_", " "),
                "color": PALETTE[i % len(PALETTE)],
            }
        page_index = int(beam["page_index"])
        src = source_by_page.get(page_index, {})
        sheet = sheets.get(page_index) or {}
        denom = sheet.get("scale_denom")
        mmpt = mm_per_point(float(denom)) if denom else None
        source_payload = {}
        try:
            source_payload = json.loads(beam.get("source") or "{}")
        except (TypeError, json.JSONDecodeError):
            pass
        unresolved = h is None or t is None
        status = "needs_review" if unresolved else "ready"
        beam_questions = [q for q in open_by_stage if (beam.get("mark") and str(beam.get("mark")) in str(q.get("text"))) or beam["id"] in str(q.get("text"))]
        if beam_questions:
            status = "needs_review"
        net_m = float(length.get("net_m")) if length.get("net_m") is not None else None
        gross_m = float(length.get("gross_m")) if length.get("gross_m") is not None else None
        volume = net_m * (t / 1000.0) * (h / 1000.0) if net_m is not None and h and t else None
        beams.append({
            "id": beam["id"],
            "familyId": fid,
            "kind": "Downstand",
            "floorId": src.get("level_label") or f"Page {src.get('source_page_number') or page_index + 1}",
            "floorLabel": src.get("level_label") or src.get("title") or "Project",
            "viewportId": f"BEAM-P{page_index}",
            "start": {"x": float(beam["x0"]), "y": float(beam["y0"])},
            "end": {"x": float(beam["x1"]), "y": float(beam["y1"])},
            "dropMm": int(round(h or 0)),
            "status": status,
            "mark": beam.get("mark") or beam["id"],
            "grossLengthM": gross_m,
            "netLengthM": net_m,
            "engineVolumeM3": volume,
            "mmPerPoint": mmpt,
            "pageIndex": page_index,
            "sourcePageNumber": src.get("source_page_number"),
            "sourceDocument": src.get("source_document"),
            "dimensionSource": dim.get("source_kind"),
            "dimensionMethod": dim.get("method"),
            "detectionMethod": source_payload.get("method"),
            "visionCorroborated": source_payload.get("vision_corroborated"),
            "deductions": length.get("deductions") or [],
            "reviewMessages": [q.get("text") for q in beam_questions],
        })

    pages = []
    for page_index, sheet in sorted(sheets.items()):
        if sheet.get("category") != "general_beam_layout" and not any(b["pageIndex"] == page_index for b in beams):
            continue
        src = source_by_page.get(page_index, {})
        pages.append({
            "id": f"BEAM-P{page_index}",
            "pageIndex": page_index,
            "name": src.get("sheet_no") or src.get("title") or f"Beam drawing · page {src.get('source_page_number') or page_index + 1}",
            "title": src.get("title"),
            "sourceDocument": src.get("source_document"),
            "sourcePageNumber": src.get("source_page_number"),
            "floorLabel": src.get("level_label"),
            "width": float(sheet["width"]),
            "height": float(sheet["height"]),
            "scaleDenom": sheet.get("scale_denom"),
            "mmPerPoint": mm_per_point(float(sheet["scale_denom"])) if sheet.get("scale_denom") else None,
            "imageUrl": f"/api/v1/projects/{project_id}/takeoff/beams/pages/{page_index}/image",
        })

    return {
        "schemaVersion": "quanto-beam-editor-v1",
        "engine": "supplied-beams-project-s0-s6",
        "runId": run_id,
        "pages": pages,
        "families": list(families.values()),
        "beams": beams,
        "engineWorkbook": repo.workbook(run_id),
        "questions": questions,
        "summary": {
            "beamCount": len(beams),
            "needsReview": sum(1 for b in beams if b["status"] == "needs_review"),
            "netLengthM": round(sum(b.get("netLengthM") or 0 for b in beams), 4),
            "concreteM3": round(sum(b.get("engineVolumeM3") or 0 for b in beams), 4),
        },
    }


def beam_state(project_id: UUID | str, *, auto_start: bool = True) -> dict:
    pid = str(project_id)
    status = ensure_analysis_started(pid) if auto_start else _read_json(_status_path(pid), {"status": "idle", "stage": "idle", "progress": 0, "message": "Beam analysis has not started"})
    result: dict[str, Any] = {"analysis": status, "editor": None}
    if status.get("status") == "done":
        result["editor"] = _read_json(_editor_path(pid), None)
        if result["editor"] is None:
            meta = _read_json(_meta_path(pid), {})
            db_path = _dir(pid) / "beam_engine.db"
            if meta.get("run_id") and db_path.exists():
                repo = Repo(db_path)
                result["editor"] = _adapt_engine_state(pid, repo, meta["run_id"], meta.get("source_map") or _read_json(_dir(pid) / "source_map.json", []))
                _write_json(_editor_path(pid), result["editor"])
    return result


def save_editor_state(project_id: UUID | str, state: dict) -> dict:
    pid = str(project_id)
    current = beam_state(pid, auto_start=False)
    if current.get("analysis", {}).get("status") != "done":
        raise RuntimeError("Beam analysis is not complete")
    payload = dict(state)
    payload["schemaVersion"] = "quanto-beam-editor-v1"
    payload["engine"] = "supplied-beams-project-s0-s6"
    _write_json(_editor_path(pid), payload)
    return payload


def answer_question(project_id: UUID | str, question_id: str, answer: str) -> dict:
    pid = str(project_id)
    current = beam_state(pid, auto_start=False)
    if current.get("analysis", {}).get("status") != "done":
        raise RuntimeError("Beam analysis is not complete")
    value = answer.strip()
    if not value:
        raise ValueError("An answer is required")
    meta = _read_json(_meta_path(pid), {})
    run_id = meta.get("run_id")
    db_path = _dir(pid) / "beam_engine.db"
    if not run_id or not db_path.exists():
        raise ValueError("Beam analysis is not available")
    repo = Repo(db_path)
    question = next((q for q in repo.questions_all(run_id) if q["id"] == question_id), None)
    if not question:
        raise ValueError("Beam question not found")
    repo.answer_question(question_id, value)
    editor = _adapt_engine_state(
        pid,
        repo,
        run_id,
        meta.get("source_map") or _read_json(_dir(pid) / "source_map.json", []),
    )
    _write_json(_editor_path(pid), editor)
    return editor


def page_image_path(project_id: UUID | str, page_index: int) -> Path:
    pid = str(project_id)
    meta = _read_json(_meta_path(pid), {})
    run_id = meta.get("run_id")
    db_path = _dir(pid) / "beam_engine.db"
    if not run_id or not db_path.exists():
        raise ValueError("Beam analysis is not available")
    repo = Repo(db_path)
    sheet = next((s for s in repo.sheets(run_id) if int(s["page_index"]) == int(page_index)), None)
    if not sheet:
        raise ValueError("Beam page not found")
    path = Path(sheet["hires_path"])
    if not path.exists():
        raise ValueError("Beam page image is missing")
    return path
