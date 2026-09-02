from __future__ import annotations

"""Method-level entry points: build the context, compose the done-checklist
prompt, run the loop, and map the typed outcome onto the dict shape the
pipeline nodes already consume (plus `_flags` for the HITL mapping)."""

from agentic.context import AgenticContext
from agentic.harness import run_agentic_call
from agentic.outcome import Answer, AnswerWithFlags, Failure
from agentic.validators import validate_identify_beams

IDENTIFY_BEAMS_SCHEMA = {
    "type": "object",
    "properties": {
        "candidates": {"type": "array"},
        "unmatched_runs": {"type": "array"},
        "known_issues": {"type": "array"},
        "notes": {"type": "string"},
    },
    "required": ["candidates", "notes"],
}

IDENTIFY_BEAMS_PROMPT = """You are performing beam identification on a structural \
layout drawing for a quantity takeoff. The seed image is the full sheet.

Find every beam line on the principal plan(s). Beams are usually dotted/dashed \
(hidden from above). Mark each as kind "dashed" with endpoints as fractions of \
the full image (x0,y0,x1,y1). Flag solid lines that look like beams as \
"solid_suspect" and unknown hatch regions as "hatch_unknown" — never assume.

Tools: `crop` to magnify regions; `run_python` to measure — paths()/texts() give \
the vector index, snap(x0,y0,x1,y1) aligns a line to exact vector geometry; \
`preview_answer` shows your draft drawn on the sheet plus the validator report; \
`answer` submits.

You are DONE when all of these hold — then call answer:
1. every vector dashed run is covered by a candidate or declared in \
unmatched_runs (with x,y midpoint fractions and a reason),
2. all coordinates are inside the sheet (0..1),
3. no duplicate candidates,
4. preview_answer reports ALL CHECKS PASS (or remaining failures are listed in \
known_issues with justification).
Work efficiently: survey, crop the dense regions, verify with snap, preview, \
answer."""


def run_identify_beams(client, ctx: AgenticContext, n_vector_runs: int,
                       seed_image: str, model: str) -> dict:
    prompt = (IDENTIFY_BEAMS_PROMPT
              + f"\n(The vector index holds {n_vector_runs} reconstructed dashed "
                "runs on this sheet.)")
    outcome = run_agentic_call(
        client, prompt, [seed_image], IDENTIFY_BEAMS_SCHEMA, ctx,
        validator=validate_identify_beams, model=model)

    if isinstance(outcome, Answer):
        return {**outcome.payload, "_flags": [], "_agentic": outcome.trace.summary()}
    if isinstance(outcome, AnswerWithFlags):
        return {**outcome.payload, "_flags": outcome.failures,
                "_agentic": outcome.trace.summary()}
    # Failure: return an empty-but-well-formed result; the node converts the
    # flag into a blocking human question and falls back to vector-only ID.
    assert isinstance(outcome, Failure)
    partial = outcome.partial_draft or {}
    flag = (f"agentic identify_beams failed ({outcome.reason}); vector-only "
            "identification used — review this sheet's overlay carefully")
    return {"candidates": partial.get("candidates", []),
            "notes": f"agentic call failed: {outcome.reason}",
            "_flags": [flag],
            "_agentic": outcome.trace.summary()}
