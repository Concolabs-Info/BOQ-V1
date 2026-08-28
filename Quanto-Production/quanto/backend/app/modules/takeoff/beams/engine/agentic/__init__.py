"""Agentic vision harness — the inner tool loop inside one VisionClient call.

Contract (the invariant on the wall): exactly three structured exits —
Answer | AnswerWithFlags | Failure. No prose exit, no infinite path, no silent
truncation. See docs/agentic-harness-plan.md.
"""
from agentic.outcome import AgenticOutcome, Answer, AnswerWithFlags, Failure

__all__ = ["AgenticOutcome", "Answer", "AnswerWithFlags", "Failure"]
