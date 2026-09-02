"""Tool schemas + host-side executors for the agentic loop (plan §2).

crop           -> image tool_result (region-deduped, budgeted)
run_python     -> sandboxed compute; preloaded paths()/texts()/snap() helpers
preview_answer -> validators + rendered overlay of the draft (the done-signal)
answer         -> the only successful exit (validated in harness.py)
"""
from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path

from agentic.context import AgenticContext
from agentic.sandbox import run_python as sandbox_run

MAX_CROP_DPI = 400


def tool_schemas(answer_schema: dict) -> list[dict]:
    return [
        {
            "name": "crop",
            "description": (
                "View a region of the drawing sheet at higher magnification, "
                "rendered sharp from the vector PDF. Coordinates are fractions of "
                "page width/height (0..1). The crop is also saved to your "
                "scratchpad as crop_NN.png for run_python."),
            "input_schema": {
                "type": "object",
                "properties": {
                    "x0": {"type": "number"}, "y0": {"type": "number"},
                    "x1": {"type": "number"}, "y1": {"type": "number"},
                    "dpi": {"type": "integer"},
                },
                "required": ["x0", "y0", "x1", "y1"],
            },
        },
        {
            "name": "run_python",
            "description": (
                "Execute Python in a sandbox (cwd = your scratchpad). Preloaded "
                "helpers: paths() and texts() return this sheet's vector segments "
                "and text spans (display-space points); snap(x0,y0,x1,y1) snaps a "
                "line (fractions) to the nearest vector dashed run and returns its "
                "exact endpoints; MM_PER_PT and UNIT_SYSTEM are constants. PIL is "
                "available for crops you saved. Print what you want to see."),
            "input_schema": {
                "type": "object",
                "properties": {"code": {"type": "string"}},
                "required": ["code"],
            },
        },
        {
            "name": "preview_answer",
            "description": (
                "Dry-run your draft answer (same schema as `answer`). Returns the "
                "deterministic validator report plus an image of your draft drawn "
                "over the sheet, WITHOUT ending the task. A clean report means you "
                "are done — call answer with the same payload."),
            "input_schema": answer_schema,
        },
        {
            "name": "answer",
            "description": (
                "Submit your final structured answer. The only way to finish. The "
                "payload is validated; failures are returned for you to fix."),
            "input_schema": answer_schema,
        },
    ]


def exec_crop(ctx: AgenticContext, x0: float, y0: float, x1: float, y1: float,
              dpi: int = 300) -> dict:
    key = (round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4), int(dpi or 300))
    if key in ctx.seen_crops:
        return {"type": "text",
                "text": f"[harness] cached — you already viewed this exact region "
                        f"({ctx.seen_crops[key]}). Use run_python on the saved file "
                        "or crop a different region."}
    ctx.crop_count += 1
    if ctx.crop_count > ctx.max_crops:
        return {"type": "text",
                "text": f"[harness] crop budget exhausted ({ctx.max_crops}). "
                        "Work with the crops you have, then preview_answer."}
    import pymupdf
    dpi = min(int(dpi or 300), MAX_CROP_DPI)
    doc = pymupdf.open(ctx.pdf_path)
    page = doc[ctx.page_index]
    w, h = page.rect.width, page.rect.height
    clip = pymupdf.Rect(min(x0, x1) * w, min(y0, y1) * h,
                     max(x0, x1) * w, max(y0, y1) * h) & page.rect
    if clip.is_empty or clip.width < 2 or clip.height < 2:
        doc.close()
        return {"type": "text", "text": "[harness] empty crop region"}
    png = page.get_pixmap(dpi=dpi, clip=clip).tobytes("png")
    doc.close()
    out = ctx.scratch() / f"crop_{ctx.crop_count:02d}.png"
    out.write_bytes(png)
    ctx.seen_crops[key] = out.name
    return {"type": "image",
            "source": {"type": "base64", "media_type": "image/png",
                       "data": base64.standard_b64encode(png).decode()}}


_PREAMBLE = """
import json, sqlite3, math
DB = __DB__; PAGE = __PAGE__; MM_PER_PT = __MM_PER_PT__; UNIT_SYSTEM = __UNIT__
W, H = __W__, __H__
def _q(sql, args=()):
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
    rows = [dict(r) for r in con.execute(sql, args)]; con.close(); return rows
def paths(page=PAGE):
    return _q("SELECT layer,dashed,x0,y0,x1,y1,length FROM paths WHERE page_index=?", (page,))
def texts(page=PAGE):
    return _q("SELECT text,x0,y0,x1,y1 FROM texts WHERE page_index=?", (page,))
_RUNS_FILE = __RUNS_FILE__
_RUNS = json.load(open(_RUNS_FILE)) if _RUNS_FILE else []
def snap(x0, y0, x1, y1):
    '''Snap a line given as page fractions to the nearest vector dashed run.
    Returns dict with exact endpoints (fractions) + offset_pt, or None.'''
    ax0, ay0, ax1, ay1 = x0*W, y0*H, x1*W, y1*H
    ang = math.degrees(math.atan2(ay1-ay0, ax1-ax0)) % 180.0
    mx, my = (ax0+ax1)/2, (ay0+ay1)/2
    best, best_d = None, 14.0
    for r in _RUNS:
        ra = math.degrees(math.atan2(r[3]-r[1], r[2]-r[0])) % 180.0
        d = abs(ra-ang)
        if min(d, 180.0-d) > 8.0:
            continue
        dx, dy = r[2]-r[0], r[3]-r[1]
        n2 = dx*dx+dy*dy
        t = max(0.0, min(1.0, ((mx-r[0])*dx+(my-r[1])*dy)/n2)) if n2 else 0.0
        dist = math.hypot(mx-(r[0]+t*dx), my-(r[1]+t*dy))
        if dist < best_d:
            best, best_d = r, dist
    if best is None:
        return None
    return {"x0": best[0]/W, "y0": best[1]/H, "x1": best[2]/W, "y1": best[3]/H,
            "offset_pt": round(best_d, 2)}
"""


def exec_run_python(ctx: AgenticContext, code: str) -> dict:
    digest = hashlib.sha1(code.encode()).hexdigest()
    if digest in ctx.seen_code:
        return {"type": "text",
                "text": "[harness] cached — you already ran this exact code; "
                        "its output is above."}
    ctx.python_count += 1
    if ctx.python_count > ctx.max_python:
        return {"type": "text",
                "text": f"[harness] python budget exhausted ({ctx.max_python}). "
                        "Finalize: preview_answer, then answer."}
    runs_file = ""
    if ctx.runs:
        runs_file = str(ctx.scratch() / "vector_runs.json")
        if not Path(runs_file).exists():
            Path(runs_file).write_text(json.dumps(
                [[r.x0, r.y0, r.x1, r.y1] for r in ctx.runs]))
    preamble = (_PREAMBLE
                .replace("__DB__", repr(ctx.extraction_db or ""))
                .replace("__PAGE__", str(ctx.page_index))
                .replace("__MM_PER_PT__", repr(ctx.mm_per_pt))
                .replace("__UNIT__", repr(ctx.unit_system))
                .replace("__W__", repr(ctx.page_width))
                .replace("__H__", repr(ctx.page_height))
                .replace("__RUNS_FILE__", repr(runs_file)))
    out = sandbox_run(code, ctx.scratch_dir, preamble=preamble)
    ctx.seen_code.add(digest)
    return {"type": "text", "text": out}
