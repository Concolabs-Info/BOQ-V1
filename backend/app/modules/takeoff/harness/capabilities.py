from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class Capability:
    name: str
    purpose: str
    deterministic: bool
    callable: Callable[..., Any] | None = None


def capability_registry() -> dict[str, Capability]:
    # Lazy imports keep pure unit tests independent of PostgreSQL/PyMuPDF runtime setup.
    from ..common import extract_viewport_text, project_text_evidence, source_mm_per_pixel
    from ..scope.engine import get_scope

    return {
        "scope.get": Capability("scope.get", "Read the deterministic frozen-Pre Scope manifest for an element.", True, get_scope),
        "pdf.native_text": Capability("pdf.native_text", "Read native PDF text in exact viewport crop coordinates.", True, extract_viewport_text),
        "project.spec_evidence": Capability("project.spec_evidence", "Read confirmed specification/schedule evidence for resolution.", True, project_text_evidence),
        "scale.confirmed": Capability("scale.confirmed", "Read the confirmed scale calibration for a viewport.", True, source_mm_per_pixel),
        "vision.structured": Capability("vision.structured", "Account-backed ChatGPT/Codex structured visual interpretation.", False, None),
        "geometry.validate": Capability("geometry.validate", "Element-specific deterministic bounds/topology/overlap validation.", True, None),
        "measurement.calculate": Capability("measurement.calculate", "Official deterministic length/area/slope/volume calculation.", True, None),
        "facts.publish": Capability("facts.publish", "Publish reusable cross-element facts with frame-version provenance.", True, None),
        "evaluator.check": Capability("evaluator.check", "Independent post-run completeness/review evaluation.", True, None),
    }
