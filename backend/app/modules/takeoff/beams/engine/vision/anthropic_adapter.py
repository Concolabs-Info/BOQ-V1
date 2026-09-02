"""Anthropic Messages adapter behind ModelClient."""
from __future__ import annotations

from agentic.model import ModelTurn, ToolCall


class AnthropicModelClient:
    def complete(
        self,
        *,
        model: str,
        messages: list[dict],
        tools: list[dict],
        max_tokens: int = 4000,
        on_event=None,
    ) -> ModelTurn:
        import anthropic

        client = anthropic.Anthropic()
        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
        msg = client.messages.create(**kwargs)
        text_parts: list[str] = []
        calls: list[ToolCall] = []
        for block in msg.content:
            btype = getattr(block, "type", None)
            if btype == "text":
                t = getattr(block, "text", "") or ""
                text_parts.append(t)
                if on_event and t:
                    on_event({"type": "assistant_delta", "text": t})
            elif btype == "tool_use":
                calls.append(ToolCall(
                    id=block.id,
                    name=block.name,
                    arguments=block.input if isinstance(block.input, dict) else {},
                ))
                if on_event:
                    on_event({"type": "tool_start", "name": block.name})
        usage = getattr(msg, "usage", None)
        return ModelTurn(
            text="\n".join(text_parts),
            tool_calls=calls,
            usage_in=int(getattr(usage, "input_tokens", 0) or 0),
            usage_out=int(getattr(usage, "output_tokens", 0) or 0),
        )
