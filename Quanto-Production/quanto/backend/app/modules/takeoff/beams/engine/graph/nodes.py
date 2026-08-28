"""Pipeline nodes S0–S6. Each stage is split into a WORK node (extraction/analysis,
writes results + gate payload to SQLite) and a GATE node (interrupt + apply answers).
The split matters: LangGraph replays a node from its top on resume, so side-effectful
work must complete in its own node before the interrupt happens. All persistent state
lives in SQLite via Repo — graph state carries only run identity/config."""
from __future__ import annotations

import json
import math
import re
from typing import TypedDict

from langgraph.types import interrupt

from db.repo import Repo
from evidence.crops import cite
from extraction.ingest import ingest
from geometry import scale as gscale
from geometry.floodfill import validate_closed
from geometry.lines import BeamCandidate, Segment, pair_edges, reconstruct_dashed_runs
from geometry.network import NetBeam, build_page_network
from vision.client import VisionClient, primary_kind

REQUIRED_CATEGORIES = ["general_beam_layout", "notes_spec"]
DIM_PAIR_RE = re.compile(r"(\d{2,4})\s*[xX]\s*(\d{2,4})")
# imperial pair like 32"x18" or 32" X 18"
DIM_PAIR_IN_RE = re.compile(r'(\d{1,3})\s*(?:"|”)\s*[xX×]\s*(\d{1,3})\s*(?:"|”)?')
# beam marks: B1, B-1, and dimension-labels like 'B- 32" x 18"' or 'B- 30"/32" x 18"'
MARK_RE = re.compile(r'^B[-\s]?[\d"”xX×\'./\s]{1,20}$')
# dims embedded in the mark itself; an NN"/ prefix (variable width) keeps the last width
MARK_DIM_RE = re.compile(
    r'^B[-\s]*(?:\d{1,3}\s*(?:"|”)?\s*/\s*)?(\d{1,3})\s*(?:"|”)\s*[xX×]\s*'
    r'(\d{1,3})\s*(?:"|”)?$')
IN_TO_MM = 25.4

NRM2_SCOPE = "In-situ concrete works — horizontal work, reinforced"


class RunState(TypedDict):
    run_id: str
    db_path: str
    pdf_path: str
    assets_dir: str


def _repo(state: RunState) -> Repo:
    return Repo(state["db_path"])


def _vision(state: RunState) -> VisionClient:
    return VisionClient(log_path=f"{state['assets_dir']}/vision.log")


def _emit(event: dict) -> None:
    try:
        from app.progress import emit
        emit(event)
    except Exception:  # noqa: BLE001, S110
        pass


def _open_gate(repo: Repo, run_id: str, stage: str, payload: dict) -> None:
    repo.set_gate(run_id, stage, payload)
    repo.update_run(run_id, status="awaiting_gate")
    _emit({"type": "gate", "gate": payload.get("gate"), "pending": payload,
           "message": f"Waiting for confirmation: {payload.get('gate')}"})


def _gate_payload(repo: Repo, run_id: str, stage: str) -> dict:
    gate = repo.gate(run_id, stage)
    return json.loads(gate["payload"]) if gate and gate["payload"] else {}


def _apply_answers(repo: Repo, response: dict) -> None:
    for qid, answer in (response.get("answers") or {}).items():
        repo.answer_question(qid, str(answer))


# ---------------------------------------------------------------------------- S0
def s0_ingest(state: RunState) -> dict:
    repo = _repo(state)
    repo.update_run(state["run_id"], status="running", stage="S0")
    _emit({"type": "stage", "stage": "S0",
           "message": "Extracting vector geometry, text, and sheet rasters"})
    ingest(state["pdf_path"], repo, state["run_id"], state["assets_dir"])
    n = len(repo.sheets(state["run_id"]))
    _emit({"type": "stage", "stage": "S0",
           "message": f"Indexed {n} sheet{'s' if n != 1 else ''}"})
    repo.update_run(state["run_id"], stage="S0:done")
    return {}


# ---------------------------------------------------------------------------- S1
def _frac_to_pts(sheet: dict, frac: list[float]) -> tuple[float, float, float, float]:
    w, h = sheet["width"], sheet["height"]
    return frac[0] * w, frac[1] * h, frac[2] * w, frac[3] * h


def s1_triage(state: RunState) -> dict:
    repo, vision = _repo(state), _vision(state)
    run_id = state["run_id"]
    repo.update_run(run_id, stage="S1")
    _emit({"type": "stage", "stage": "S1",
           "message": "Triaging sheets and viewports (a page may hold several drawings)"})

    sheets = repo.sheets(run_id)
    inputs = [{"page_index": s["page_index"], "thumb_path": s["thumb_path"],
               "hires_path": s["hires_path"],
               "title_texts": [t["text"] for t in repo.texts(run_id, s["page_index"])],
               "layer_names": repo.layers(run_id, s["page_index"])} for s in sheets]
    results = {r["page_index"]: r for r in vision.classify_sheets(inputs)}

    payload_sheets = []
    for sheet in sheets:
        i = sheet["page_index"]
        result = results.get(i) or {"category": "irrelevant", "confidence": 0.0,
                                    "sheet_no": None, "title": None, "viewports": []}
        ev_id = None
        title = result.get("title")
        if title:
            hit = next((t for t in repo.texts(run_id, i) if t["text"] == title), None)
            if hit:
                ev_id = cite(repo, run_id, state["pdf_path"], i,
                             [hit["x0"], hit["y0"], hit["x1"], hit["y1"]],
                             state["assets_dir"], f"triage_p{i}", note="title block")
        vps_in = result.get("viewports") or [{
            "kind": result.get("category") or "irrelevant",
            "title": title, "bbox": [0, 0, 1, 1], "scale_text": None,
            "confidence": result.get("confidence") or 0.0,
        }]
        vp_ids = repo.replace_page_viewports(run_id, i, vps_in)
        vp_payload = []
        for vid in vp_ids:
            vp = repo.viewport(vid)
            if not vp:
                continue
            bbox_pts = list(_frac_to_pts(sheet, json.loads(vp["bbox"])))
            vp_ev = cite(repo, run_id, state["pdf_path"], i, bbox_pts,
                         state["assets_dir"], f"vp_{vp['id']}",
                         note=f"{vp['kind']}: {vp.get('title') or ''}")
            vp_payload.append({
                "id": vp["id"], "kind": vp["kind"], "title": vp.get("title"),
                "bbox": json.loads(vp["bbox"]), "scale_text": vp.get("scale_text"),
                "confidence": vp.get("confidence"), "evidence_id": vp_ev,
            })
        primary = result.get("category") or primary_kind(vps_in)
        repo.update_sheet(run_id, i, category=primary,
                          confidence=result.get("confidence") or 0.0,
                          sheet_no=result.get("sheet_no"), title=title)
        payload_sheets.append({"page_index": i, "category": primary,
                               "confidence": result.get("confidence"),
                               "sheet_no": result.get("sheet_no"), "title": title,
                               "thumb": sheet["thumb_path"], "evidence_id": ev_id,
                               "viewports": vp_payload})

    found = {s["category"] for s in payload_sheets}
    for s in payload_sheets:
        found.update(v["kind"] for v in s.get("viewports") or [])
    for cat in REQUIRED_CATEGORIES:
        if cat not in found:
            repo.add_question(run_id, "S1", "missing_sheet_category",
                              f"No sheet or viewport classified as '{cat}' in the package "
                              f"({len(payload_sheets)} pages searched). Confirm how to proceed.")

    _open_gate(repo, run_id, "GATE1",
               {"gate": "GATE1", "sheets": payload_sheets,
                "questions": repo.open_questions(run_id, "S1")})
    return {}


def gate1(state: RunState) -> dict:
    repo = _repo(state)
    run_id = state["run_id"]
    response = interrupt(_gate_payload(repo, run_id, "GATE1")) or {}
    for vp_id, kind in (response.get("viewport_kinds") or {}).items():
        repo.update_viewport(str(vp_id), kind=str(kind))
    recat = response.get("recategorize") or {}
    for page_str, cat in recat.items():
        repo.update_sheet(run_id, int(page_str), category=cat, confidence=1.0)
    if (response.get("viewport_kinds") or {}) and not recat:
        for sheet in repo.sheets(run_id):
            vps = repo.viewports(run_id, sheet["page_index"])
            if vps:
                repo.update_sheet(run_id, sheet["page_index"],
                                  category=primary_kind(vps), confidence=1.0)
    _apply_answers(repo, response)
    repo.confirm_gate(run_id, "GATE1", response)
    repo.update_run(run_id, status="running", stage="S1:done")
    return {}


# ---------------------------------------------------------------------------- S2
def _calibrate_region(repo: Repo, run_id: str, pdf_path: str, sheet: dict,
                      texts: list[dict], solid: list[dict], unit_system: str,
                      denom: float, assets_dir: str, tag: str) -> tuple[dict, str | None]:
    v = gscale.verify_scale(texts, solid, denom, unit_system)
    verification = {k: v[k] for k in v if k not in ("dim_text", "line")}
    ev_id = None
    i = sheet["page_index"]
    if v.get("verified") is False:
        dt = v["dim_text"]
        ev_id = cite(repo, run_id, pdf_path, i,
                     [dt["x0"], dt["y0"], dt["x1"], dt["y1"]], assets_dir,
                     f"scale_mismatch_{tag}",
                     note=f"label {v['label_mm']}mm vs measured {v['measured_mm']}mm")
    elif v.get("verified") is True:
        dt = v["dim_text"]
        ev_id = cite(repo, run_id, pdf_path, i,
                     [dt["x0"], dt["y0"], dt["x1"], dt["y1"]], assets_dir,
                     f"scale_ok_{tag}", note=f"calibration dimension {v['label_mm']:g}mm")
    return verification, ev_id


def s2_calibration(state: RunState) -> dict:
    repo, vision = _repo(state), _vision(state)
    run_id = state["run_id"]
    repo.update_run(run_id, stage="S2")
    _emit({"type": "stage", "stage": "S2",
           "message": "Calibrating units, per-viewport scale, and grade"})

    all_texts = repo.texts(run_id)
    unit_system = gscale.detect_units(all_texts)

    plan_kinds = ("general_beam_layout", "structural_floor_plan")
    scales = {}
    for sheet in repo.sheets(run_id):
        i = sheet["page_index"]
        vps = [v for v in repo.viewports(run_id, i) if v["kind"] in plan_kinds]
        if not vps and sheet["category"] in plan_kinds:
            vps = [{"id": None, "kind": sheet["category"], "title": sheet.get("title"),
                    "bbox": json.dumps([0, 0, 1, 1]), "scale_text": None}]
        if not vps:
            continue
        texts = repo.texts(run_id, i)
        solid = repo.paths(run_id, i, dashed=False)
        vp_entries = []
        sheet_denom = None
        sheet_verif = None
        sheet_ev = None
        sheet_scale_text = None
        for vp in vps:
            frac = json.loads(vp["bbox"]) if isinstance(vp["bbox"], str) else vp["bbox"]
            bbox = _frac_to_pts(sheet, frac)
            # Prefer a scale label sitting with this viewport; title block is fallback only.
            hit = gscale.scale_for_region(texts, bbox)
            if hit is None and vp.get("scale_text"):
                denom = gscale.parse_scale_label(vp["scale_text"])
                hit = {"denom": denom, "scale_text": vp["scale_text"],
                       "dim_text": None} if denom else None
            denom = hit["denom"] if hit else None
            local_texts = [t for t in texts if gscale.in_bbox(t, bbox, pad=30)]
            local_solid = [p for p in solid if gscale.in_bbox(p, bbox, pad=30)]
            verif, ev_id = {"verified": None}, None
            if denom:
                verif, ev_id = _calibrate_region(
                    repo, run_id, state["pdf_path"], sheet,
                    local_texts or texts, local_solid or solid,
                    unit_system, denom, state["assets_dir"],
                    tag=vp["id"] or f"p{i}")
                if vp.get("id"):
                    repo.update_viewport(vp["id"], scale_denom=denom,
                                         scale_text=hit.get("scale_text") if hit else vp.get("scale_text"))
                if vp["kind"] == "general_beam_layout" or sheet_denom is None:
                    sheet_denom, sheet_verif, sheet_ev = denom, verif, ev_id
                    sheet_scale_text = hit.get("scale_text") if hit else vp.get("scale_text")
            else:
                repo.add_question(
                    run_id, "S2", "scale_mismatch",
                    f"Page {i + 1} viewport '{vp.get('title') or vp['kind']}': no scale "
                    f"label found next to the drawing or in the title block. Provide scale.")
            vp_entries.append({
                "id": vp.get("id"), "kind": vp["kind"], "title": vp.get("title"),
                "stated": denom, "scale_text": (hit or {}).get("scale_text") or vp.get("scale_text"),
                "verification": verif, "evidence_id": ev_id,
            })
        if sheet_denom:
            repo.update_sheet(run_id, i, scale_denom=sheet_denom)
        scales[str(i)] = {
            "page_index": i, "stated": sheet_denom, "scale_text": sheet_scale_text,
            "verification": sheet_verif, "evidence_id": sheet_ev,
            "viewports": vp_entries,
        }

    grade, grade_ev = None, None
    notes_pages = {s["page_index"] for s in repo.sheets(run_id, category="notes_spec")}
    notes_pages.update(v["page_index"] for v in repo.viewports(run_id, kind="notes_spec"))
    for i in sorted(notes_pages):
        sheet = next(s for s in repo.sheets(run_id) if s["page_index"] == i)
        texts = repo.texts(run_id, i)
        g = vision.find_grade(sheet["hires_path"], [t["text"] for t in texts])
        if g["grade"]:
            grade = g["grade"]
            hit = next((t for t in texts if g["snippet"] and g["snippet"] in t["text"]), None)
            if hit:
                grade_ev = cite(repo, run_id, state["pdf_path"], i,
                                [hit["x0"], hit["y0"], hit["x1"], hit["y1"]],
                                state["assets_dir"], f"grade_p{i}", note=g["snippet"])
            break
    if grade is None:
        repo.add_question(run_id, "S2", "grade_not_found",
                          "No beam concrete grade found in notes/specification sheets "
                          "or notes viewports. State the grade to use.")
    repo.update_run(run_id, unit_system=unit_system, grade=grade)

    _open_gate(repo, run_id, "GATE2",
               {"gate": "GATE2", "unit_system": unit_system, "scales": scales,
                "grade": grade, "grade_evidence_id": grade_ev,
                "questions": repo.open_questions(run_id, "S2")})
    return {}


def gate2(state: RunState) -> dict:
    repo = _repo(state)
    run_id = state["run_id"]
    response = interrupt(_gate_payload(repo, run_id, "GATE2")) or {}
    run = repo.get_run(run_id)
    repo.update_run(run_id,
                    unit_system=response.get("unit_system") or run["unit_system"],
                    grade=response.get("grade") or run["grade"])
    for page_str, denom in (response.get("scales") or {}).items():
        repo.update_sheet(run_id, int(page_str), scale_denom=float(denom))
    for vp_id, denom in (response.get("viewport_scales") or {}).items():
        repo.update_viewport(str(vp_id), scale_denom=float(denom))
        vp = repo.viewport(str(vp_id))
        if vp and vp["kind"] == "general_beam_layout":
            repo.update_sheet(run_id, vp["page_index"], scale_denom=float(denom))
    _apply_answers(repo, response)
    repo.confirm_gate(run_id, "GATE2", response)
    repo.update_run(run_id, status="running", stage="S2:done")
    return {}


# ---------------------------------------------------------------------------- S3
def s3_beam_id(state: RunState) -> dict:
    repo, vision = _repo(state), _vision(state)
    run_id = state["run_id"]
    repo.update_run(run_id, stage="S3")
    _emit({"type": "stage", "stage": "S3", "message": "Identifying beams"})

    overlay = []
    for sheet in repo.sheets(run_id, category="general_beam_layout"):
        i = sheet["page_index"]
        _emit({"type": "status",
               "message": f"Beam identification on page {i + 1}"})
        # true dashed vectors + dashed runs reconstructed from exploded short strokes
        dashed_rows = repo.paths(run_id, i, dashed=True)
        solid_rows = repo.paths(run_id, i, dashed=False)
        segs = [Segment(r["x0"], r["y0"], r["x1"], r["y1"]) for r in dashed_rows]
        segs += reconstruct_dashed_runs(
            [Segment(r["x0"], r["y0"], r["x1"], r["y1"]) for r in solid_rows])
        ga_vps = repo.viewports(run_id, i, kind="general_beam_layout")
        clip = None
        if ga_vps:
            frac = json.loads(ga_vps[0]["bbox"])
            if abs((frac[2] - frac[0]) * (frac[3] - frac[1])) < 0.85:
                clip = _frac_to_pts(sheet, frac)

        def _in_ga(x0, y0, x1, y1, box=clip) -> bool:
            if box is None:
                return True
            mx, my = (x0 + x1) / 2, (y0 + y1) / 2
            return box[0] - 24 <= mx <= box[2] + 24 and box[1] - 24 <= my <= box[3] + 24

        segs = [s for s in segs if _in_ga(s.x0, s.y0, s.x1, s.y1)]
        vis = vision.identify_beams(sheet["hires_path"], len(segs),
                                    agentic_ctx=_agentic_ctx(state, sheet, segs))
        # AnswerWithFlags / Failure from the agentic loop become questions here
        for flag in vis.get("_flags") or []:
            repo.add_question(run_id, "S3", "solid_line_suspect",
                              f"Agentic vision on p{i + 1}: {flag}")
        candidates, unpaired = pair_edges(segs)

        texts = [t for t in repo.texts(run_id, i)
                 if _in_ga(t["x0"], t["y0"], t["x1"], t["y1"])]
        marks = [t for t in texts if MARK_RE.match(t["text"])]
        W, H = sheet["width"], sheet["height"]
        vis_dashed = [v for v in vis.get("candidates", []) if v.get("kind") == "dashed"]
        vis_matched = [False] * len(vis_dashed)

        for c in candidates:
            x0, y0, x1, y1 = c.centerline
            mark = _nearest_mark(marks, (x0 + x1) / 2, (y0 + y1) / 2)
            corroborated = False
            for k, v in enumerate(vis_dashed):
                if _vis_match(v, c.centerline, W, H):
                    vis_matched[k] = corroborated = True
            ff = validate_closed(c, closing_segments=_end_caps(c))
            status = "candidate" if (ff["closed"] and corroborated) else "uncertain"
            bid = repo.add_beam(run_id, i, c.centerline, status,
                               {"method": "vector_pairing", "edge_gap_pt": c.edge_gap,
                                "vision_corroborated": corroborated},
                               mark=mark, edge_gap=c.edge_gap)
            if not corroborated:
                ev = cite(repo, run_id, state["pdf_path"], i, [x0, y0, x1, y1],
                          state["assets_dir"], f"uncorrob_{bid}",
                          note="vector pair without vision corroboration")
                repo.add_question(run_id, "S3", "solid_line_suspect",
                                  f"Paired parallel lines on p{i + 1} form a beam-like run "
                                  f"({mark or bid}) but the vision model did not mark a beam "
                                  "here. Confirm beam or reject.", ev)
            overlay.append({"beam_id": bid, "page_index": i, "mark": mark,
                            "centerline": [x0, y0, x1, y1], "edge_gap_pt": c.edge_gap,
                            "status": status})

        # vision-identified beams with no vector pair -> uncertain beams for the overlay
        for k, v in enumerate(vis_dashed):
            if vis_matched[k]:
                continue
            cl = (v["x0"] * W, v["y0"] * H, v["x1"] * W, v["y1"] * H)
            mark = _nearest_mark(marks, (cl[0] + cl[2]) / 2, (cl[1] + cl[3]) / 2)
            bid = repo.add_beam(run_id, i, cl, "uncertain",
                               {"method": "vision_only"}, mark=mark, edge_gap=None)
            overlay.append({"beam_id": bid, "page_index": i, "mark": mark,
                            "centerline": list(cl), "edge_gap_pt": None,
                            "status": "uncertain"})

        # suspects and unknown hatches -> questions with evidence crops (capped)
        oddballs = [v for v in vis.get("candidates", [])
                    if v.get("kind") in ("solid_suspect", "hatch_unknown")][:10]
        for v in oddballs:
            bbox = [v["x0"] * W, v["y0"] * H, v["x1"] * W, v["y1"] * H]
            bbox = [min(bbox[0], bbox[2]), min(bbox[1], bbox[3]),
                    max(bbox[0], bbox[2]), max(bbox[1], bbox[3])]
            kind = ("solid_line_suspect" if v["kind"] == "solid_suspect"
                    else "unknown_hatch")
            ev = cite(repo, run_id, state["pdf_path"], i, bbox, state["assets_dir"],
                      f"{kind}_p{i}_{int(bbox[0])}_{int(bbox[1])}", note=v["kind"])
            text = ("Solid line where a beam is suspected" if kind == "solid_line_suspect"
                    else "Unknown hatch pattern")
            repo.add_question(run_id, "S3", kind,
                              f"{text} on p{i + 1} — confirm whether this is a beam.", ev)

        for s in [u for u in unpaired if u.length > 60][:8]:
            ev = cite(repo, run_id, state["pdf_path"], i, [s.x0, s.y0, s.x1, s.y1],
                      state["assets_dir"], f"unpaired_p{i}_{int(s.x0)}_{int(s.y0)}",
                      note="dashed run with no parallel partner")
            repo.add_question(run_id, "S3", "solid_line_suspect",
                              f"Dashed run on p{i + 1} has no parallel partner — single edge, "
                              "centerline-only beam, or not a beam? Confirm.", ev)

    _open_gate(repo, run_id, "GATE3",
               {"gate": "GATE3", "overlay": overlay,
                "questions": repo.open_questions(run_id, "S3")})
    return {}


def gate3(state: RunState) -> dict:
    repo = _repo(state)
    run_id = state["run_id"]
    response = interrupt(_gate_payload(repo, run_id, "GATE3")) or {}
    rejected = set(response.get("reject") or [])
    for b in repo.beams(run_id):
        if b["id"] in rejected:
            repo.update_beam(b["id"], status="rejected")
        elif b["status"] in ("candidate", "uncertain"):
            repo.update_beam(b["id"], status="confirmed")
    for add in response.get("add") or []:
        repo.add_beam(run_id, add["page_index"],
                      (add["x0"], add["y0"], add["x1"], add["y1"]),
                      "confirmed", {"method": "user"}, mark=add.get("mark"),
                      edge_gap=add.get("edge_gap"))
    _apply_answers(repo, response)
    repo.confirm_gate(run_id, "GATE3", response)
    repo.update_run(run_id, status="running", stage="S3:done")
    return {}


def _agentic_ctx(state: RunState, sheet: dict, runs: list[Segment]):
    """Build the AgenticContext for a layout sheet (None when the flag is off,
    so stub/manual/one-shot paths pay nothing)."""
    from vision.factory import agentic_enabled
    if not agentic_enabled():
        return None
    from agentic.context import AgenticContext

    i = sheet["page_index"]
    return AgenticContext(
        pdf_path=state["pdf_path"], page_index=i,
        scratch_dir=f"{state['assets_dir']}/agentic/scratch_p{i}",
        page_width=sheet["width"], page_height=sheet["height"],
        mm_per_pt=(gscale.mm_per_point(sheet["scale_denom"])
                   if sheet["scale_denom"] else None),
        extraction_db=state["db_path"],
        runs=[r for r in runs if r.length >= 40],
        trace_path=f"{state['assets_dir']}/agentic/trace_p{i}.jsonl",
    )


def _vis_match(v: dict, centerline: tuple, w: float, h: float,
               dist_tol: float = 30.0, ang_tol: float = 10.0) -> bool:
    """Does a vision candidate (image-fraction line) agree with a vector centerline?"""
    vx0, vy0, vx1, vy1 = v["x0"] * w, v["y0"] * h, v["x1"] * w, v["y1"] * h
    cx0, cy0, cx1, cy1 = centerline
    va = math.degrees(math.atan2(vy1 - vy0, vx1 - vx0)) % 180.0
    ca = math.degrees(math.atan2(cy1 - cy0, cx1 - cx0)) % 180.0
    d = abs(va - ca)
    if min(d, 180.0 - d) > ang_tol:
        return False
    vmx, vmy = (vx0 + vx1) / 2, (vy0 + vy1) / 2
    cmx, cmy = (cx0 + cx1) / 2, (cy0 + cy1) / 2
    return math.hypot(vmx - cmx, vmy - cmy) <= max(
        dist_tol, 0.35 * math.hypot(cx1 - cx0, cy1 - cy0))


def _end_caps(c: BeamCandidate) -> list[Segment]:
    e0, e1 = c.edges
    return [Segment(e0.x0, e0.y0, e1.x0, e1.y0), Segment(e0.x1, e0.y1, e1.x1, e1.y1)]


def _nearest_mark(marks: list[dict], x: float, y: float, max_d: float = 60.0) -> str | None:
    best, best_d = None, max_d
    for m in marks:
        mx, my = (m["x0"] + m["x1"]) / 2, (m["y0"] + m["y1"]) / 2
        d = math.hypot(mx - x, my - y)
        if d < best_d:
            best, best_d = m["text"], d
    return best


def _first_number_is_thickness(votes: list[bool]) -> bool:
    return sum(votes) >= len(votes) / 2 if votes else False


# ---------------------------------------------------------------------------- S4
def s4_dims(state: RunState) -> dict:
    repo, vision = _repo(state), _vision(state)
    run_id = state["run_id"]
    repo.update_run(run_id, stage="S4")
    _emit({"type": "stage", "stage": "S4", "message": "Reading beam dimensions"})

    schedule: dict[str, dict] = {}
    sched_ev = None
    for sheet in repo.sheets(run_id, category="beam_schedule"):
        i = sheet["page_index"]
        texts = repo.texts(run_id, i)
        result = vision.read_schedule(sheet["hires_path"], texts)
        for row in result["rows"]:
            schedule[row["mark"]] = row
        if result["rows"] and sched_ev is None:
            xs = [t["x0"] for t in texts] + [t["x1"] for t in texts]
            ys = [t["y0"] for t in texts] + [t["y1"] for t in texts]
            sched_ev = cite(repo, run_id, state["pdf_path"], i,
                            [min(xs), min(ys), max(xs), max(ys)], state["assets_dir"],
                            f"schedule_p{i}", note="beam schedule table")

    run = repo.get_run(run_id)
    imperial = run.get("unit_system") == "imperial"
    to_mm = IN_TO_MM if imperial else 1.0

    beams = repo.beams(run_id, status="confirmed")

    # late mark binding: S3 may have missed labels (format quirks); bind nearest here
    marks_by_page: dict[int, list[dict]] = {}
    for beam in beams:
        if beam["mark"]:
            continue
        i = beam["page_index"]
        if i not in marks_by_page:
            marks_by_page[i] = [t for t in repo.texts(run_id, i) if MARK_RE.match(t["text"])]
        mark = _nearest_mark(marks_by_page[i],
                             (beam["x0"] + beam["x1"]) / 2,
                             (beam["y0"] + beam["y1"]) / 2, max_d=90.0)
        if mark:
            repo.update_beam(beam["id"], mark=mark)
            beam["mark"] = mark

    # Method 1, systematized: beams with a measurable drawn gap vote on whether the
    # label's first number is the plan-width (thickness); the majority convention
    # then disambiguates labeled beams that have no measurable gap.
    votes = []
    for beam in beams:
        m = MARK_DIM_RE.match(beam["mark"]) if beam["mark"] else None
        if not m or not beam["edge_gap"]:
            continue
        sheet = next(s for s in repo.sheets(run_id) if s["page_index"] == beam["page_index"])
        if not sheet["scale_denom"]:
            continue
        drawn_mm = beam["edge_gap"] * gscale.mm_per_point(sheet["scale_denom"])
        a_mm, b_mm = float(m.group(1)) * IN_TO_MM, float(m.group(2)) * IN_TO_MM
        votes.append(abs(a_mm - drawn_mm) <= abs(b_mm - drawn_mm))
    # Beam marks conventionally state depth × width (for example 36" × 9").
    # Only reverse that convention when measurable plan gaps provide evidence
    # that this particular drawing package writes width first.
    first_is_thickness = _first_number_is_thickness(votes)

    rows = []
    for beam in beams:
        sheet = next(s for s in repo.sheets(run_id) if s["page_index"] == beam["page_index"])
        mm_pt = gscale.mm_per_point(sheet["scale_denom"]) if sheet["scale_denom"] else None
        resolved = None

        mark_dims = MARK_DIM_RE.match(beam["mark"]) if beam["mark"] else None
        if beam["mark"] and beam["mark"] in schedule:
            r = schedule[beam["mark"]]
            resolved = (r["height_mm"], r["thickness_mm"], "schedule", "direct", sched_ev)
        elif mark_dims:
            # mark itself carries the size, e.g. B-32"x18": disambiguate H vs T
            # against the drawn edge gap (Method 1); inches on imperial drawings
            a, b = float(mark_dims.group(1)) * IN_TO_MM, float(mark_dims.group(2)) * IN_TO_MM
            if mm_pt and beam["edge_gap"]:
                drawn_mm = beam["edge_gap"] * mm_pt
                thickness = a if abs(a - drawn_mm) <= abs(b - drawn_mm) else b
                height = b if thickness == a else a
                ev = cite(repo, run_id, state["pdf_path"], beam["page_index"],
                          [beam["x0"], beam["y0"], beam["x1"], beam["y1"]],
                          state["assets_dir"], f"markdim_{beam['id']}",
                          note=f"mark {beam['mark']}; drawn gap {drawn_mm:.0f}mm "
                               f"-> thickness={thickness:.0f}mm")
                resolved = (height, thickness, "mark_label", "method1", ev)
            else:
                # no measurable gap: apply the Method-1 convention learned from
                # gap-measurable beams on this package
                thickness, height = (a, b) if first_is_thickness else (b, a)
                ev = cite(repo, run_id, state["pdf_path"], beam["page_index"],
                          [beam["x0"], beam["y0"], beam["x1"], beam["y1"]],
                          state["assets_dir"], f"markdim_{beam['id']}",
                          note=f"mark {beam['mark']}; convention from {len(votes)} "
                               f"measured beams -> thickness={thickness:.0f}mm")
                resolved = (height, thickness, "mark_label", "method1_convention", ev)
        if resolved is None:
            # adjacent 'A x B' dimension: disambiguate via drawn edge gap (Method 1 basis)
            pair = _nearest_dim_pair(repo.texts(run_id, beam["page_index"]),
                                     (beam["x0"] + beam["x1"]) / 2,
                                     (beam["y0"] + beam["y1"]) / 2,
                                     imperial=imperial)
            if pair and mm_pt and beam["edge_gap"]:
                a, b, hit = pair
                a, b = a * to_mm, b * to_mm
                drawn_mm = beam["edge_gap"] * mm_pt
                thickness = a if abs(a - drawn_mm) <= abs(b - drawn_mm) else b
                height = b if thickness == a else a
                ev = cite(repo, run_id, state["pdf_path"], beam["page_index"],
                          [hit["x0"], hit["y0"], hit["x1"], hit["y1"]], state["assets_dir"],
                          f"dim_{beam['id']}",
                          note=f"drawn gap {drawn_mm:.0f}mm -> thickness={thickness:g}")
                resolved = (height, thickness, "adjacent_dim", "method1", ev)

        if resolved:
            h, t, kind, method, ev = resolved
            repo.set_beam_dims(beam["id"], h, t, kind, method, ev)
            rows.append({"beam_id": beam["id"], "mark": beam["mark"], "height_mm": h,
                         "thickness_mm": t, "source_kind": kind, "method": method,
                         "evidence_id": ev, "status": "proposed"})
        else:
            repo.set_beam_dims(beam["id"], None, None, "none", "unresolved", None)
            ev = cite(repo, run_id, state["pdf_path"], beam["page_index"],
                      [beam["x0"], beam["y0"], beam["x1"], beam["y1"]],
                      state["assets_dir"], f"ht_{beam['id']}",
                      note="unresolved H×T — highlighted centerline")
            label = beam["mark"] or beam["id"]
            repo.add_question(
                run_id, "S4", "ht_unconfirmed",
                f"Beam {label}: no height/thickness from schedule, adjacent "
                f"dimension, or section (page {beam['page_index'] + 1}). "
                "Enter height_mm and thickness_mm for the highlighted line.",
                ev)
            rows.append({"beam_id": beam["id"], "mark": beam["mark"], "height_mm": None,
                         "thickness_mm": None, "source_kind": "none",
                         "method": "unresolved", "evidence_id": ev, "status": "open",
                         "page_index": beam["page_index"],
                         "centerline": [beam["x0"], beam["y0"], beam["x1"], beam["y1"]]})

    _open_gate(repo, run_id, "GATE4",
               {"gate": "GATE4", "rows": rows,
                "questions": repo.open_questions(run_id, "S4")})
    return {}


def gate4(state: RunState) -> dict:
    repo = _repo(state)
    run_id = state["run_id"]
    response = interrupt(_gate_payload(repo, run_id, "GATE4")) or {}
    for beam_id, dims in (response.get("overrides") or {}).items():
        repo.set_beam_dims(beam_id, dims["height_mm"], dims["thickness_mm"],
                           "user", "user", None, status="overridden")
    _apply_answers(repo, response)
    for d in repo.beam_dims(run_id):
        if d["status"] == "proposed" and d["height_mm"] is not None:
            repo.set_beam_dims(d["beam_id"], d["height_mm"], d["thickness_mm"],
                               d["source_kind"], d["method"], d["evidence_id"],
                               status="confirmed")
    repo.confirm_gate(run_id, "GATE4", response)
    repo.update_run(run_id, status="running", stage="S4:done")
    return {}


def _nearest_dim_pair(texts: list[dict], x: float, y: float,
                      max_d: float = 80.0,
                      imperial: bool = False) -> tuple[float, float, dict] | None:
    best = None
    best_d = max_d
    regex = DIM_PAIR_IN_RE if imperial else DIM_PAIR_RE
    for t in texts:
        m = regex.search(t["text"])
        if not m:
            continue
        mx, my = (t["x0"] + t["x1"]) / 2, (t["y0"] + t["y1"]) / 2
        d = math.hypot(mx - x, my - y)
        if d < best_d:
            best = (float(m.group(1)), float(m.group(2)), t)
            best_d = d
    return best


# ---------------------------------------------------------------------------- S5
def s5_lengths(state: RunState) -> dict:
    repo = _repo(state)
    run_id = state["run_id"]
    repo.update_run(run_id, stage="S5")
    _emit({"type": "stage", "stage": "S5", "message": "Measuring lengths and junctions"})

    dims = {d["beam_id"]: d for d in repo.beam_dims(run_id)}
    beams = repo.beams(run_id, status="confirmed")
    sheets_by_page = {s["page_index"]: s for s in repo.sheets(run_id)}

    ix_rows: list[dict] = []
    length_rows: list[dict] = []
    dedup_rows: list[dict] = []
    clean = True
    # junction networks are per sheet — beams on different pages never intersect
    for pi in sorted({b["page_index"] for b in beams}):
        sheet = sheets_by_page[pi]
        mm_pt = gscale.mm_per_point(sheet["scale_denom"])
        nets = []
        for b in [x for x in beams if x["page_index"] == pi]:
            d = dims.get(b["id"]) or {}
            nets.append(NetBeam(b["id"], b["x0"], b["y0"], b["x1"], b["y1"],
                                d.get("thickness_mm"), d.get("height_mm")))
        # vector runs on this sheet: real dashed lines + runs reconstructed from
        # exploded strokes — used to recover each beam's two drawn edge lines
        runs = [Segment(r["x0"], r["y0"], r["x1"], r["y1"])
                for r in repo.paths(run_id, pi, dashed=True)]
        runs += reconstruct_dashed_runs(
            [Segment(r["x0"], r["y0"], r["x1"], r["y1"])
             for r in repo.paths(run_id, pi, dashed=False)])

        net = build_page_network(nets, runs, mm_pt)
        for kept_id, dropped_id in net["dropped"]:
            repo.update_beam(dropped_id, status="rejected")
            dedup_rows.append({"kept": kept_id, "dropped": dropped_id, "page_index": pi,
                               "why": "duplicate"})
        for kept_id, merged_id in net["merges"]:
            repo.update_beam(merged_id, status="rejected")
            dedup_rows.append({"kept": kept_id, "dropped": merged_id, "page_index": pi,
                               "why": "collinear_chain"})
        nets, resolutions, broken = net["nets"], net["resolutions"], net["broken"]
        for v in net["violations"]:
            clean = False
            repo.add_question(run_id, "S5", "intersection_unresolved",
                              f"Network invariant violated on p{pi + 1}: segments of "
                              f"{_mk(repo, run_id, v['a'])} and {_mk(repo, run_id, v['b'])} "
                              f"still cross at ({v['x']:.0f},{v['y']:.0f}).")

        for res in resolutions:
            n = res.node
            others = [b for b in n.beam_ids if b != res.owner]
            ev = cite(repo, run_id, state["pdf_path"], pi,
                      [n.x - 15, n.y - 15, n.x + 15, n.y + 15], state["assets_dir"],
                      f"node_{pi}_{int(n.x)}_{int(n.y)}",
                      note=f"rule={res.rule}; beams={','.join(n.beam_ids)}")
            iid = repo.add_intersection(run_id, res.owner or n.beam_ids[0],
                                        "+".join(others) or n.beam_ids[-1],
                                        n.x, n.y, res.owner, res.rule, ev)
            if res.owner is None:
                names = ", ".join(_mk(repo, run_id, b) for b in n.beam_ids)
                repo.add_question(run_id, "S5", "intersection_unresolved",
                                  f"Junction of {names} on p{pi + 1} cannot be owned by "
                                  "rule (geometry silent, no section match). State which "
                                  "beam owns the intersection.", ev)
            ix_rows.append({"id": iid, "beams": n.beam_ids, "x": n.x, "y": n.y,
                            "owner": res.owner, "rule": res.rule, "evidence_id": ev,
                            "page_index": pi})

        for n in nets:
            gross_m = round(n.length * mm_pt / 1000.0, 4)
            b = broken[n.beam_id]
            deds = [{"node": d["node"], "owner": d["owner"], "metres": d["metres"]}
                    for d in b["deductions"]]
            repo.set_beam_length(n.beam_id, gross_m, b["net_m"], deds)
            length_rows.append({"beam_id": n.beam_id, "mark": _mk(repo, run_id, n.beam_id),
                                "gross_m": gross_m, "net_m": b["net_m"],
                                "deductions": deds, "page_index": pi})

    _open_gate(repo, run_id, "GATE5",
               {"gate": "GATE5", "lengths": length_rows, "intersections": ix_rows,
                "deduplicated": dedup_rows, "network_clean": clean,
                "questions": repo.open_questions(run_id, "S5")})
    return {}


def gate5(state: RunState) -> dict:
    repo = _repo(state)
    run_id = state["run_id"]
    payload = _gate_payload(repo, run_id, "GATE5")
    response = interrupt(payload) or {}
    for iid, owner in (response.get("owners") or {}).items():
        repo.update_intersection(iid, owner=owner, rule="user", status="confirmed")
    for beam_id, net in (response.get("net_overrides") or {}).items():
        row = next(r for r in payload["lengths"] if r["beam_id"] == beam_id)
        repo.set_beam_length(beam_id, row["gross_m"], float(net), row["deductions"])
    _apply_answers(repo, response)
    repo.confirm_gate(run_id, "GATE5", response)
    repo.update_run(run_id, status="running", stage="S5:done")
    return {}


def _mk(repo: Repo, run_id: str, beam_id: str) -> str:
    b = next((b for b in repo.beams(run_id) if b["id"] == beam_id), None)
    return (b.get("mark") or beam_id) if b else beam_id


# ---------------------------------------------------------------------------- S6
def s6_workbook(state: RunState) -> dict:
    repo = _repo(state)
    run_id = state["run_id"]
    repo.update_run(run_id, stage="S6")
    _emit({"type": "stage", "stage": "S6", "message": "Building workbook rows"})
    run = repo.get_run(run_id)

    dims = {d["beam_id"]: d for d in repo.beam_dims(run_id)}
    lengths = {r["beam_id"]: r for r in repo.beam_lengths(run_id)}

    groups: dict[tuple[float, float], list[dict]] = {}
    for beam in repo.beams(run_id, status="confirmed"):
        d, ln = dims.get(beam["id"]), lengths.get(beam["id"])
        if not d or not ln or d["height_mm"] is None:
            continue
        groups.setdefault((d["height_mm"], d["thickness_mm"]), []).append(
            {"beam": beam, "dims": d, "len": ln})

    for (h, t), members in sorted(groups.items()):
        vol = sum(m["len"]["net_m"] * (h / 1000.0) * (t / 1000.0) for m in members)
        band = "<=300mm" if t <= 300 else ">300mm"
        calc = " + ".join(
            f"{m['len']['net_m']:.2f}m x {h/1000:.2f}m x {t/1000:.2f}m" for m in members)
        status = ("User-overridden"
                  if any(m["dims"]["status"] == "overridden" for m in members)
                  else "Confirmed")
        source = {
            "beams": [{"id": m["beam"]["id"], "mark": m["beam"]["mark"],
                       "page_index": m["beam"]["page_index"]} for m in members],
            "evidence": [m["dims"]["evidence_id"] for m in members if m["dims"]["evidence_id"]],
            "grade": run.get("grade"),
            "thickness_band": band,
        }
        repo.add_workbook_row(
            run_id, family="Beam",
            scope=f"{NRM2_SCOPE}; grade {run.get('grade') or 'TBC'}; thickness {band}",
            calc=calc, qty=round(vol, 3), unit="m3", status=status, source=source)

    _open_gate(repo, run_id, "FINAL",
               {"gate": "FINAL", "workbook": repo.workbook(run_id)})
    return {}


def final_gate(state: RunState) -> dict:
    repo = _repo(state)
    run_id = state["run_id"]
    response = interrupt(_gate_payload(repo, run_id, "FINAL")) or {}
    repo.confirm_gate(run_id, "FINAL", response or {"ok": True})
    repo.update_run(run_id, status="done", stage="S6:done")
    return {}
