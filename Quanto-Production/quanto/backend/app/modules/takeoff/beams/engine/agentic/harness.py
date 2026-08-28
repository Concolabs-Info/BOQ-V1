"""The agentic loop (plan §3): seed → tool calls → tool results (may be images)
→ … → validated answer. Termination is a checkable contract enforced in four
layers; exactly three structured exits (Answer | AnswerWithFlags | Failure).

The model client is injected so tests drive the loop with a scripted fake.
"""
from __future__ import annotations

import base64
import hashlib
import json
import math
from pathlib import Path

from agentic.context import AgenticContext
from agentic.model import ModelTurn
from agentic.outcome import AgenticOutcome, Answer, AnswerWithFlags, Failure, Trace
from agentic.render import render_draft_overlay
from agentic.tools import exec_crop, exec_run_python, tool_schemas

DEFAULT_MODEL = "gpt-5.6-sol"
MAX_TURNS = 24
MAX_TOKENS_PER_REPLY = 4000
TOKEN_BUDGET = 500_000
MAX_ANSWER_BOUNCES = 3
NO_PROGRESS_FUSE = 2
DEADLINE_FRACTION = 0.7


def _seed_content(seed_image_paths: list[str], prompt: str) -> list[dict]:
    content: list[dict] = []
    for p in seed_image_paths:
        content.append({
            "type": "image",
            "source": {"type": "base64", "media_type": "image/png",
                       "data": base64.standard_b64encode(Path(p).read_bytes()).decode()},
            "cache_control": {"type": "ephemeral"},
        })
    content.append({"type": "text", "text": prompt})
    return content


def _schema_errors(payload: dict, schema: dict) -> list[str]:
    """Minimal structural validation: required keys + basic types. Deliberately
    dependency-free; validators do the semantic work."""
    errs = []
    if not isinstance(payload, dict):
        return ["payload must be a JSON object"]
    for key in schema.get("required", []):
        if key not in payload:
            errs.append(f"missing required field '{key}'")
    for key, spec in (schema.get("properties") or {}).items():
        if key in payload and spec.get("type") == "array" and not isinstance(payload[key], list):
            errs.append(f"field '{key}' must be an array")
    return errs


def _emit(event: dict) -> None:
    try:
        from app.progress import emit
        emit(event)
    except Exception:  # noqa: BLE001, S110
        pass


def _asset_url(ctx: AgenticContext, name: str) -> str | None:
    scratch = Path(ctx.scratch_dir).resolve()
    for parent in [scratch, *scratch.parents]:
        if parent.name.startswith("run_"):
            rel = (scratch / name).resolve().relative_to(parent)
            return f"/assets/{parent.name}/{rel.as_posix()}"
    return None


def run_agentic_call(client, prompt: str, seed_image_paths: list[str],
                     answer_schema: dict, ctx: AgenticContext,
                     validator=None, model: str = DEFAULT_MODEL,
                     max_turns: int = MAX_TURNS,
                     token_budget: int = TOKEN_BUDGET) -> AgenticOutcome:
    trace = Trace()
    tools = tool_schemas(answer_schema)
    messages = [{"role": "user", "content": _seed_content(seed_image_paths, prompt)}]
    bounce_count = 0
    fuse = NO_PROGRESS_FUSE
    last_draft: dict | None = None
    last_failures: list[str] = []

    def finish(outcome: AgenticOutcome) -> AgenticOutcome:
        _write_trace(ctx, trace, outcome)
        return outcome

    def on_event(event: dict) -> None:
        _emit(event)

    for turn in range(1, max_turns + 1):
        trace.turns = turn
        turns_left = max_turns - turn
        try:
            result: ModelTurn = client.complete(
                model=model, messages=messages, tools=tools,
                max_tokens=MAX_TOKENS_PER_REPLY, on_event=on_event)
        except Exception as e:  # noqa: BLE001 — API errors become typed failures
            trace.add("api_error", error=str(e)[:300])
            _emit({"type": "error", "message": str(e)[:400]})
            return finish(Failure("api_error", last_draft, trace))
        trace.tokens_in += result.usage_in
        trace.tokens_out += result.usage_out
        if result.usage_in or result.usage_out:
            _emit({"type": "usage", "input": result.usage_in, "output": result.usage_out,
                   "total_in": trace.tokens_in, "total_out": trace.tokens_out})

        asst_content: list[dict] = []
        if result.text:
            asst_content.append({"type": "text", "text": result.text})
        for tc in result.tool_calls:
            block = {"type": "tool_use", "id": tc.id, "name": tc.name, "input": tc.arguments}
            if tc.item_id:
                block["item_id"] = tc.item_id
            asst_content.append(block)
        asst_msg: dict = {"role": "assistant", "content": asst_content}
        if result.raw_output_items:
            asst_msg["codex_output"] = result.raw_output_items
        messages.append(asst_msg)

        if trace.tokens_in + trace.tokens_out > token_budget:
            trace.add("budget", which="token", used=trace.tokens_in + trace.tokens_out)
            return finish(Failure("token_budget", last_draft, trace))

        results = []
        progressed = False
        for tc in result.tool_calls:
            name, args, tid = tc.name, tc.arguments or {}, tc.id

            if name == "answer":
                errs = _schema_errors(args, answer_schema)
                normalized, failures = dict(args), []
                if not errs and validator:
                    rep = validator(args, ctx)
                    normalized, failures = rep.normalized, rep.failures
                    trace.add("answer_attempt", failures=failures[:6],
                              stats=rep.stats)
                else:
                    trace.add("answer_attempt", schema_errors=errs[:6])
                if not errs and not failures:
                    _emit({"type": "status", "message": "Answer accepted"})
                    return finish(Answer(normalized, trace))
                last_draft, last_failures = normalized, errs + failures
                bounce_count += 1
                _emit({"type": "status", "message": "Answer rejected: "
                       + "; ".join((errs + failures)[:3])})
                if not errs and bounce_count > MAX_ANSWER_BOUNCES:
                    return finish(AnswerWithFlags(normalized, failures, trace))
                results.append({"type": "tool_result", "tool_use_id": tid,
                                "is_error": True,
                                "content": "answer rejected:\n- "
                                           + "\n- ".join((errs + failures)[:8])
                                           + f"\n(bounce {bounce_count}/{MAX_ANSWER_BOUNCES}"
                                             " — fix and call answer again)"})
                progressed = True

            elif name == "preview_answer":
                ctx.preview_count += 1
                _emit({"type": "tool_start", "name": "preview_answer"})
                if ctx.preview_count > ctx.max_previews:
                    results.append({"type": "tool_result", "tool_use_id": tid,
                                    "content": "[harness] preview budget exhausted — "
                                               "call answer now."})
                    continue
                rep = validator(args, ctx) if validator else None
                report = ("ALL CHECKS PASS — you are done; call answer with this "
                          "payload." if rep and rep.ok else
                          "Failed checks:\n- " + "\n- ".join(rep.failures[:8])
                          if rep else "no validator configured")
                content = [{"type": "text", "text": report}]
                overlay_url = None
                try:
                    img = render_draft_overlay(
                        rep.normalized if rep else args, ctx,
                        f"preview_{ctx.preview_count:02d}")
                    content.append(img)
                    overlay_url = _asset_url(ctx, f"preview_{ctx.preview_count:02d}.png")
                except Exception as e:  # noqa: BLE001 — preview render must not kill the loop
                    content.append({"type": "text",
                                    "text": f"[harness] overlay render failed: {e}"})
                trace.add("preview", ok=bool(rep and rep.ok),
                          failures=(rep.failures[:6] if rep else []))
                last_draft = rep.normalized if rep else dict(args)
                _emit({"type": "tool_result", "name": "preview_answer",
                       "detail": report[:240], "image_url": overlay_url})
                results.append({"type": "tool_result", "tool_use_id": tid,
                                "content": content})
                progressed = True

            elif name == "crop":
                _emit({"type": "tool_start", "name": "crop", "args": {
                    k: args.get(k) for k in ("x0", "y0", "x1", "y1", "dpi")}})
                r = exec_crop(
                    ctx,
                    x0=float(args["x0"]), y0=float(args["y0"]),
                    x1=float(args["x1"]), y1=float(args["y1"]),
                    dpi=int(args.get("dpi") or 300),
                )
                cached = r.get("type") == "text" and "cached" in r.get("text", "")
                trace.add("crop", region=[args.get(k) for k in ("x0", "y0", "x1", "y1")],
                          dpi=args.get("dpi", 300), cached=cached)
                progressed = progressed or not cached
                crop_name = None
                if not cached:
                    crop_name = f"crop_{ctx.crop_count:02d}.png"
                _emit({"type": "tool_result", "name": "crop", "cached": cached,
                       "image_url": _asset_url(ctx, crop_name) if crop_name else None,
                       "detail": r.get("text", "")[:200] if r.get("type") == "text" else None})
                results.append({"type": "tool_result", "tool_use_id": tid,
                                "content": [r]})

            elif name == "run_python":
                code = args.get("code", "")
                _emit({"type": "tool_start", "name": "run_python",
                       "detail": code[:240]})
                r = exec_run_python(ctx, code=str(args.get("code") or ""))
                cached = "cached" in r.get("text", "")[:40]
                trace.add("run_python",
                          code_sha=hashlib.sha1(code.encode()).hexdigest()[:10],
                          code_head=code[:200], out_head=r.get("text", "")[:300],
                          cached=cached)
                progressed = progressed or not cached
                _emit({"type": "tool_result", "name": "run_python",
                       "detail": (r.get("text") or "")[:800], "cached": cached})
                results.append({"type": "tool_result", "tool_use_id": tid,
                                "content": [r]})

        if not results:
            fuse -= 1
            trace.add("no_tools", fuse=fuse)
            if fuse <= 0:
                messages.append({"role": "user",
                                 "content": "Finalize NOW: call preview_answer, then "
                                            "answer. No more analysis without tools."})
            else:
                messages.append({"role": "user",
                                 "content": "Use the tools. When finished, call "
                                            "`answer` with the structured result."})
            continue
        if not progressed:
            fuse -= 1
            trace.add("no_progress", fuse=fuse)
            if fuse <= 0:
                results.append({"type": "text",
                                "text": "[harness] no new information in this turn — "
                                        "finalize: preview_answer, then answer."})
        if turns_left <= math.ceil((1 - DEADLINE_FRACTION) * max_turns):
            results.append({"type": "text",
                            "text": f"[harness] {turns_left} turn(s) remain."})
        messages.append({"role": "user", "content": results})

    trace.add("budget", which="turns", max=max_turns)
    if last_draft is not None and not _schema_errors(last_draft, answer_schema):
        return finish(AnswerWithFlags(last_draft,
                                      last_failures or ["turn budget exhausted"],
                                      trace))
    return finish(Failure("no_answer", last_draft, trace))


def _write_trace(ctx: AgenticContext, trace: Trace, outcome: AgenticOutcome) -> None:
    if not ctx.trace_path:
        return
    path = Path(ctx.trace_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a") as f:
        f.write(json.dumps({"summary": trace.summary(),
                            "outcome": type(outcome).__name__}) + "\n")
        f.writelines(json.dumps(e) + "\n" for e in trace.events)
