from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

ScopeGroupMode = Literal["level", "roof_scope", "foundation_scope", "candidate"]


@dataclass(frozen=True)
class FactDependency:
    fact_type: str
    publisher_element: str
    required: bool = True


@dataclass(frozen=True)
class ElementScopeSpec:
    key: str
    label: str
    primary_subjects: tuple[str, ...]
    primary_view_kinds: tuple[str, ...] = ("plan",)
    primary_disciplines: tuple[str, ...] = ()
    supporting_subjects: tuple[str, ...] = ()
    schedule_subjects: tuple[str, ...] = ()
    detail_subjects: tuple[str, ...] = ()
    evidence_keywords: tuple[str, ...] = ()
    legacy_name_patterns: tuple[str, ...] = ()
    group_mode: ScopeGroupMode = "level"
    use_storey_source: bool = False
    one_primary_per_group: bool = True
    require_every_level: bool = True
    allow_multiple_unmapped: bool = False
    require_vertical_evidence: bool = False
    require_storey_height: bool = False
    require_level_datum: bool = False
    floor_geometry_fallback: bool = False
    prefer_explicit_subject_in_name: bool = False
    dependencies: tuple[FactDependency, ...] = field(default_factory=tuple)
    primary_role: str = "primary_measurement"
