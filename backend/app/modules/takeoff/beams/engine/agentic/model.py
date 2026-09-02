"""Provider-neutral model client used by the agentic loop.

The harness speaks a small Anthropic-shaped message list (role/content/tool_use
dicts). Adapters convert that to Anthropic Messages or Codex Responses.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict
    item_id: str | None = None


@dataclass
class ModelTurn:
    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage_in: int = 0
    usage_out: int = 0
    raw_output_items: list[dict] = field(default_factory=list)


EventCallback = Callable[[dict], None]


class ModelClient(Protocol):
    def complete(
        self,
        *,
        model: str,
        messages: list[dict],
        tools: list[dict],
        max_tokens: int = 4000,
        on_event: EventCallback | None = None,
    ) -> ModelTurn: ...
