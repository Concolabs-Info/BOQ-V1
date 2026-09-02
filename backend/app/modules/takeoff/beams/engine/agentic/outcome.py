"""Typed outcomes — the only three ways an agentic call ends."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Trace:
    """Digest-only record of one agentic call (crops re-renderable from region+dpi)."""
    events: list[dict] = field(default_factory=list)
    turns: int = 0
    tokens_in: int = 0
    tokens_out: int = 0

    def add(self, kind: str, **data) -> None:
        self.events.append({"kind": kind, **data})

    def summary(self) -> dict:
        from collections import Counter
        return {"turns": self.turns, "tokens_in": self.tokens_in,
                "tokens_out": self.tokens_out,
                "events": dict(Counter(e["kind"] for e in self.events))}


@dataclass
class Answer:
    payload: dict
    trace: Trace


@dataclass
class AnswerWithFlags:
    payload: dict
    failures: list[str]
    trace: Trace


@dataclass
class Failure:
    reason: str            # no_answer | token_budget | turn_budget | api_error
    partial_draft: dict | None
    trace: Trace


AgenticOutcome = Answer | AnswerWithFlags | Failure
