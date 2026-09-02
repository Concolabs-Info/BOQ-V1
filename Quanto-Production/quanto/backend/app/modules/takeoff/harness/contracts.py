from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

HarnessStage = Literal[
    "scope",
    "bind",
    "detect",
    "verify",
    "resolve",
    "dimension",
    "quantify",
    "check",
]

HARNESS_STAGES: tuple[HarnessStage, ...] = (
    "scope",
    "bind",
    "detect",
    "verify",
    "resolve",
    "dimension",
    "quantify",
    "check",
)


@dataclass(frozen=True)
class ElementExpertSpec:
    key: str
    runtime_key: str
    display_name: str
    scope_key: str
    prompt_files: tuple[str, ...]
    publishes: tuple[str, ...] = field(default_factory=tuple)
    consumes: tuple[str, ...] = field(default_factory=tuple)
    boq_ownership: tuple[str, ...] = field(default_factory=tuple)
    strategies: tuple[str, ...] = field(default_factory=tuple)
    validation_focus: tuple[str, ...] = field(default_factory=tuple)
    geometry_is_boq: bool = False
    max_model_attempts: int = 2


@dataclass(frozen=True)
class EvaluationIssue:
    code: str
    message: str
    severity: Literal["info", "warning", "error"] = "warning"
    entity_refs: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class EvaluationReport:
    element: str
    status: Literal["pass", "pass_with_flags", "fail"]
    issues: tuple[EvaluationIssue, ...] = field(default_factory=tuple)
    stats: dict[str, object] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.status != "fail"
