"""OpenAI API adapter for the embedded Beam engine.

It implements the Beam project's provider-neutral ModelClient protocol while using
Quanto's backend OPENAI_API_KEY. The Beam prompts, tool loop and result schemas stay
unchanged; only credential transport is adapted for the production application.
"""
from __future__ import annotations

import os

from agentic.model import ModelTurn, ToolCall
from vision.codex_convert import to_openai_tools, to_responses_input

INSTRUCTIONS = (
    "You are a structural quantity-takeoff agent working from construction drawings. "
    "Use tools when they are provided. When asked for JSON only, respond with JSON "
    "and nothing else."
)


class QuantoOpenAIModelClient:
    def __init__(self) -> None:
        from openai import OpenAI

        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            raise RuntimeError("OPENAI_API_KEY is required for automatic Beam analysis")
        self.client = OpenAI(api_key=key)

    def complete(
        self,
        *,
        model: str,
        messages: list[dict],
        tools: list[dict],
        max_tokens: int = 4000,
        on_event=None,
    ) -> ModelTurn:
        kwargs: dict = {
            "model": model,
            "store": False,
            "instructions": INSTRUCTIONS,
            "input": to_responses_input(messages),
            "max_output_tokens": max_tokens,
        }
        if tools:
            kwargs["tools"] = to_openai_tools(tools)
            kwargs["tool_choice"] = "auto"
        effort = os.environ.get("BEAM_REASONING", os.environ.get("CODEX_REASONING", "high"))
        if effort and effort != "none":
            kwargs["reasoning"] = {"effort": effort}

        response = self.client.responses.create(**kwargs)
        raw_items = []
        for item in getattr(response, "output", []) or []:
            if hasattr(item, "model_dump"):
                raw_items.append(item.model_dump())
            elif isinstance(item, dict):
                raw_items.append(item)

        text = getattr(response, "output_text", "") or ""
        calls: list[ToolCall] = []
        for item in raw_items:
            if item.get("type") != "function_call":
                continue
            import json

            raw_args = item.get("arguments") or "{}"
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
            except (ValueError, TypeError):
                args = {}
            calls.append(
                ToolCall(
                    id=item.get("call_id") or item.get("id") or "call",
                    name=item.get("name") or "",
                    arguments=args if isinstance(args, dict) else {},
                    item_id=item.get("id"),
                )
            )
            if on_event:
                on_event({"type": "tool_start", "name": item.get("name") or "tool"})

        usage = getattr(response, "usage", None)
        usage_in = int(getattr(usage, "input_tokens", 0) or 0) if usage else 0
        usage_out = int(getattr(usage, "output_tokens", 0) or 0) if usage else 0
        if on_event and text:
            on_event({"type": "assistant_delta", "text": text})
        return ModelTurn(
            text=text,
            tool_calls=calls,
            usage_in=usage_in,
            usage_out=usage_out,
            raw_output_items=raw_items,
        )
