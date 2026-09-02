"""Vision wrapper. Modes via VISION_MODE env:
  - live: Codex (default) or Anthropic, selected by VISION_PROVIDER
  - manual: writes each request to a file queue and blocks until a response
            file appears. Used to have a human-or-agent play the model.
  - stub: deterministic heuristics over the extraction index — no API, used for
          tests/CI and as the code-side fallback
Structured JSON in/out; every live call logged with model + token cost.
"""
from __future__ import annotations

import base64
import json
import os
import re
import time
from pathlib import Path

from vision.factory import (
    agentic_enabled,
    get_model_client,
    vision_mode,
    vision_model,
    vision_model_for,
    vision_provider,
)

MODEL = vision_model()
MANUAL_TIMEOUT_S = 3600

CATEGORY_KEYWORDS = [
    ("general_beam_layout", ["BEAM LAYOUT", "BEAM PLAN", "FRAMING PLAN", "TRANSFER FLOOR"]),
    ("beam_schedule", ["BEAM SCHEDULE", "SCHEDULE OF BEAMS"]),
    ("beam_sections", ["BEAM SECTION", "TYPICAL SECTION", "SECTION A", "SECTION B",
                       "DETAIL -", "DETAIL-X", "DETAIL-Y"]),
    ("reinforcement_details", ["REINFORCEMENT", "REBAR", "BAR BENDING"]),
    ("notes_spec", ["NOTES", "SPECIFICATION", "GENERAL NOTES", "UNLESS OTHERWISE"]),
    ("structural_floor_plan", ["COLUMNS & WALLS", "COLUMN LAYOUT", "FLOOR PLAN",
                               "STRUCTURAL PLAN"]),
    ("architectural_floor_plan", ["ARCHITECTURAL", "TYPICAL FLOOR PLAN"]),
]
KIND_PRIORITY = [
    "general_beam_layout", "beam_schedule", "beam_sections", "notes_spec",
    "structural_floor_plan", "architectural_floor_plan", "reinforcement_details",
]
GRADE_RE = re.compile(r"\bC\d{2}\s*/\s*\d{2}\b")
SHEET_NO_RE = re.compile(r"\b([A-Z]{1,3}-\d{2,4})\b")

CATEGORIES = ("general_beam_layout, structural_floor_plan, architectural_floor_plan, "
              "beam_sections, reinforcement_details, notes_spec, beam_schedule, irrelevant")
FULL_PAGE = [0.0, 0.0, 1.0, 1.0]


def primary_kind(viewports: list[dict]) -> str:
    kinds = {v.get("kind") for v in viewports}
    for k in KIND_PRIORITY:
        if k in kinds:
            return k
    return "irrelevant"


def _clamp_bbox(bbox) -> list[float]:
    if not isinstance(bbox, (list, tuple)) or len(bbox) != 4:
        return list(FULL_PAGE)
    vals = [max(0.0, min(1.0, float(x))) for x in bbox]
    x0, y0, x1, y1 = min(vals[0], vals[2]), min(vals[1], vals[3]), max(vals[0], vals[2]), max(vals[1], vals[3])
    if x1 - x0 < 0.04 or y1 - y0 < 0.04:
        return list(FULL_PAGE)
    return [x0, y0, x1, y1]


def mode() -> str:
    return vision_mode()


def _emit(event: dict) -> None:
    try:
        from app.progress import emit
        emit(event)
    except Exception:  # noqa: BLE001, S110
        pass


class VisionClient:
    """One instance per run. In live mode wraps Codex or Anthropic with image input."""

    def __init__(self, log_path: str | Path | None = None):
        self.log_path = Path(log_path) if log_path else None
        self.tokens_in = 0
        self.tokens_out = 0

    def _call(self, method: str, prompt: str, image_paths: list[str],
              schema_hint: str) -> dict:
        if mode() == "manual":
            return self._manual_call(method, prompt, image_paths, schema_hint)
        return self._live_call(prompt, image_paths, schema_hint, method=method)

    # ---------------------------------------------------------------- live core
    def _live_call(self, prompt: str, image_paths: list[str], schema_hint: str,
                    method: str = "call") -> dict:
        content: list[dict] = []
        for p in image_paths:
            data = base64.standard_b64encode(Path(p).read_bytes()).decode()
            content.append({"type": "image",
                            "source": {"type": "base64", "media_type": "image/png",
                                       "data": data}})
        content.append({"type": "text",
                        "text": f"{prompt}\n\nRespond ONLY with JSON matching: {schema_hint}"})
        model = vision_model_for(method)
        _emit({"type": "status", "message": f"{model}: {method.replace('_', ' ')}"})
        client = get_model_client()
        from vision.codex_convert import extract_json

        retries = max(0, int(os.environ.get("BEAM_MODEL_RETRIES", "2")))
        last_error: Exception | None = None
        for attempt in range(retries + 1):
            retry_content = content if attempt == 0 else [*content, {
                "type": "text",
                "text": "The previous response was empty or invalid. Return the requested JSON object now, with no commentary.",
            }]
            turn = client.complete(
                model=model,
                messages=[{"role": "user", "content": retry_content}],
                tools=[],
                max_tokens=8000 if method == "classify_sheets" else 6000,
                on_event=_emit,
            )
            self.tokens_in += turn.usage_in
            self.tokens_out += turn.usage_out
            try:
                result = extract_json(turn.text or "")
                if not isinstance(result, dict):
                    raise TypeError(f"Model JSON for {method} was not an object: {type(result).__name__}")
                if self.log_path:
                    with open(self.log_path, "a") as f:
                        f.write(json.dumps({"model": model, "provider": vision_provider(),
                                            "prompt": prompt[:200], "attempt": attempt + 1,
                                            "in": turn.usage_in, "out": turn.usage_out}) + "\n")
                return result
            except (json.JSONDecodeError, TypeError) as exc:
                last_error = exc
                if self.log_path:
                    with open(self.log_path, "a") as f:
                        f.write(json.dumps({"model": model, "provider": vision_provider(),
                                            "method": method, "attempt": attempt + 1,
                                            "error": "empty_or_invalid_json",
                                            "in": turn.usage_in, "out": turn.usage_out}) + "\n")
        raise RuntimeError(
            f"Model did not return valid JSON for {method} after {retries + 1} attempts"
        ) from last_error

    # -------------------------------------------------------------- manual core
    def _manual_call(self, method: str, prompt: str, image_paths: list[str],
                     schema_hint: str) -> dict:
        """Write the exact request the API would receive; block until a response
        file is written by whoever is playing the model."""
        base = self.log_path.parent if self.log_path else Path(".")
        qdir = base / "vision_queue"
        qdir.mkdir(parents=True, exist_ok=True)
        n = len(list(qdir.glob("req_*.json")))
        req_path = qdir / f"req_{n:03d}.json"
        resp_path = qdir / f"resp_{n:03d}.json"
        req_path.write_text(json.dumps({
            "model": MODEL, "method": method, "prompt": prompt,
            "images": image_paths, "respond_with_json_matching": schema_hint,
        }, indent=2))
        deadline = time.time() + MANUAL_TIMEOUT_S
        while time.time() < deadline:
            if resp_path.exists():
                try:
                    return json.loads(resp_path.read_text())
                except json.JSONDecodeError:
                    time.sleep(0.5)  # partially written
                    continue
            time.sleep(1.0)
        raise TimeoutError(f"manual vision response never arrived: {resp_path}")

    # ------------------------------------------------------------- sheet triage
    def classify_sheets(self, sheets: list[dict], chunk: int = 20) -> list[dict]:
        """sheets: [{page_index, thumb_path, hires_path?, title_texts, layer_names}]
        -> one result per page with primary `category` plus `viewports` (a page may
        hold a GA, sections, details, and notes at once).
        """
        if mode() in ("live", "manual"):
            out: list[dict] = []
            live_chunk = min(chunk, 4)
            for start in range(0, len(sheets), live_chunk):
                group = sheets[start:start + live_chunk]
                lines = []
                images = []
                for k, s in enumerate(group):
                    lines.append(
                        f"Image {k + 1} = PDF page {s['page_index'] + 1} (page_index="
                        f"{s['page_index']}). Extracted text (may be split across spans): "
                        f"{s['title_texts'][:80]}. Layers: {s['layer_names']}.")
                    images.append(s.get("hires_path") or s["thumb_path"])
                prompt = (
                    "You are triaging construction drawings for a BEAM quantity takeoff.\n"
                    "A SINGLE page often contains MULTIPLE viewports: a general-arrangement "
                    "beam plan, typical sections, details, notes, AND a title block. "
                    "Do not assign one category to the whole page when more than one "
                    "drawing is present.\n"
                    "For EACH distinct drawing/viewport return a bbox as fractions of image "
                    "width/height (0-1). Classify that viewport as one of: "
                    f"{CATEGORIES}.\n"
                    "Title block is metadata only — not a viewport. Columns-and-walls GA "
                    "without beams is structural_floor_plan. Beam/transfer/typical floor GA "
                    "is general_beam_layout. Typical sections and details are beam_sections.\n"
                    "Read scale labels NEXT TO each viewport (e.g. Scale: 1/8\" = 1'-0\" or "
                    "Scale: 1/2\" = 1'-0\") as well as any scale in the title block. Put the "
                    "label text in scale_text when you see it.\n"
                    "Also read sheet_no and the main sheet title from the title block.\n\n"
                    + "\n".join(lines)
                )
                schema = (
                    '{"results": [{"page_index": int, "sheet_no": str|null, "title": str|null,'
                    ' "viewports": [{"kind": str, "title": str|null,'
                    ' "bbox": [x0,y0,x1,y1] fractions 0-1, "scale_text": str|null,'
                    ' "confidence": float}]}]} — one entry per image, one viewport per drawing'
                )
                result = self._call("classify_sheets", prompt, images, schema)
                for raw in result.get("results") or []:
                    out.append(self._normalize_classify(raw))
            return out
        return [self._classify_stub(s) for s in sheets]

    def _normalize_classify(self, raw: dict) -> dict:
        page_index = int(raw.get("page_index") if raw.get("page_index") is not None else -1)
        viewports = []
        for vp in raw.get("viewports") or []:
            kind = vp.get("kind") or vp.get("category") or "irrelevant"
            viewports.append({
                "kind": kind,
                "title": vp.get("title"),
                "bbox": _clamp_bbox(vp.get("bbox")),
                "scale_text": vp.get("scale_text"),
                "confidence": float(vp.get("confidence") or 0.0),
            })
        if not viewports and raw.get("category"):
            viewports.append({
                "kind": raw["category"], "title": raw.get("title"),
                "bbox": list(FULL_PAGE), "scale_text": raw.get("scale_text"),
                "confidence": float(raw.get("confidence") or 0.0),
            })
        if not viewports:
            viewports.append({
                "kind": "irrelevant", "title": raw.get("title"),
                "bbox": list(FULL_PAGE), "scale_text": None, "confidence": 0.0,
            })
        primary = raw.get("category") or primary_kind(viewports)
        confs = [v["confidence"] for v in viewports if v["kind"] == primary] or [0.0]
        return {
            "page_index": page_index,
            "category": primary,
            "confidence": max(confs),
            "sheet_no": raw.get("sheet_no"),
            "title": raw.get("title"),
            "viewports": viewports,
        }

    def _classify_stub(self, s: dict) -> dict:
        title_texts, layer_names = s["title_texts"], s["layer_names"]
        joined = " ".join(title_texts).upper()
        sheet_no = None
        m = SHEET_NO_RE.search(joined)
        if m:
            sheet_no = m.group(1)
        hits: list[tuple[str, str, float]] = []
        for cat, kws in CATEGORY_KEYWORDS:
            for kw in kws:
                if kw in joined:
                    title = next((t for t in title_texts if kw in t.upper()),
                                 title_texts[0] if title_texts else None)
                    boost = 0.1 if any("BEAM" in ln.upper() for ln in layer_names) else 0.0
                    hits.append((cat, title or "", min(0.9 + boost, 1.0)))
                    break
        if not hits:
            if "GENERAL ARRANGEMENT" in joined and "COLUMN" not in joined:
                hits.append(("general_beam_layout",
                             title_texts[0] if title_texts else "", 0.85))
            elif "COLUMN" in joined:
                hits.append(("structural_floor_plan",
                             title_texts[0] if title_texts else "", 0.85))
        if not hits:
            return {"page_index": s["page_index"], "category": "irrelevant",
                    "confidence": 0.6, "sheet_no": sheet_no,
                    "title": title_texts[0] if title_texts else None,
                    "viewports": [{"kind": "irrelevant",
                                   "title": title_texts[0] if title_texts else None,
                                   "bbox": list(FULL_PAGE), "scale_text": None,
                                   "confidence": 0.6}]}
        # One full-page viewport per distinct kind (stub has no bbox detector).
        seen: set[str] = set()
        viewports = []
        for cat, title, conf in hits:
            if cat in seen:
                continue
            seen.add(cat)
            viewports.append({"kind": cat, "title": title or None, "bbox": list(FULL_PAGE),
                              "scale_text": None, "confidence": conf})
        primary = primary_kind(viewports)
        primary_hit = next(v for v in viewports if v["kind"] == primary)
        return {"page_index": s["page_index"], "category": primary,
                "confidence": primary_hit["confidence"], "sheet_no": sheet_no,
                "title": primary_hit["title"], "viewports": viewports}

    # ------------------------------------------------------------------- grade
    def find_grade(self, hires_path: str, texts: list[str]) -> dict:
        """-> {grade: str|null, snippet: str|null}"""
        if mode() in ("live", "manual"):
            prompt = ("Find the concrete grade specified for BEAMS in this notes/"
                      "specification sheet (e.g. C32/40 or fcu 30). Return the exact "
                      "text snippet stating it.")
            return self._call("find_grade", prompt, [hires_path],
                              '{"grade": str|null, "snippet": str|null}')
        for t in texts:
            m = GRADE_RE.search(t)
            if m:
                return {"grade": m.group(0).replace(" ", ""), "snippet": t}
        return {"grade": None, "snippet": None}

    # ------------------------------------------------------- beam candidates ID
    def identify_beams(self, hires_path: str, n_dashed_paths: int,
                       agentic_ctx=None) -> dict:
        """Vision pass over a layout sheet. Vector clustering in the S3 node is
        authoritative; this corroborates and flags suspects. -> {candidates, notes}

        With VISION_AGENTIC=1 (live mode + agentic_ctx supplied) the call runs
        the full tool loop: crop / run_python / preview_answer / answer."""
        if mode() == "live" and agentic_ctx is not None and agentic_enabled():
            from agentic.runner import run_identify_beams
            _emit({"type": "status",
                   "message": f"{vision_model()}: identifying beams (agentic loop)"})
            return run_identify_beams(get_model_client(), agentic_ctx,
                                      len(agentic_ctx.runs), hires_path, vision_model())
        if mode() in ("live", "manual"):
            prompt = (
                "Identify beam lines on this structural layout drawing. Beams are "
                "usually dotted/dashed (hidden from above). A straight SOLID line where "
                "a beam is suspected should be flagged as solid_suspect, not assumed a "
                "beam. Unknown hatch patterns must be flagged as hatch_unknown. "
                "Coordinates as fractions of image width/height. "
                f"(The vector index found {n_dashed_paths} dashed segments on this sheet.)"
            )
            return self._call("identify_beams", prompt, [hires_path],
                              '{"candidates": [{"x0":f,"y0":f,"x1":f,"y1":f,'
                              '"kind":"dashed|solid_suspect|hatch_unknown"}], "notes": str}')
        return {"candidates": [],
                "notes": f"stub: vector clustering over {n_dashed_paths} dashed paths"}

    # --------------------------------------------------------- schedule reading
    def read_schedule(self, hires_path: str, texts: list[dict]) -> dict:
        """-> {rows: [{mark, thickness_mm, height_mm}]}
        Stub parses text lines shaped 'B1 300 600' or 'B1 300x600'."""
        if mode() in ("live", "manual"):
            prompt = ("Read this beam schedule table. For each beam mark give "
                      "width/thickness (mm) and depth/height (mm). Empty rows list if "
                      "this sheet has no beam schedule.")
            return self._call("read_schedule", prompt, [hires_path],
                              '{"rows": [{"mark": str, "thickness_mm": f, "height_mm": f}]}')
        rows = []
        # group extracted spans into lines by y, then parse
        by_y: dict[int, list[dict]] = {}
        for t in texts:
            by_y.setdefault(int(t["y0"] // 5), []).append(t)
        for _, spans in sorted(by_y.items()):
            line = " ".join(s["text"] for s in sorted(spans, key=lambda s: s["x0"]))
            m = re.match(r"^\s*(B\d+)\s+(\d{2,4})\s*[xX ]\s*(\d{2,4})\s*$", line)
            if m:
                rows.append({"mark": m.group(1), "thickness_mm": float(m.group(2)),
                             "height_mm": float(m.group(3))})
        return {"rows": rows}
