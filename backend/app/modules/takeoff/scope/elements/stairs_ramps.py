from ..models import ElementScopeSpec

SCOPE_SPEC = ElementScopeSpec(
    key="stairs-ramps",
    label="Stairs & Ramps",
    primary_subjects=("stair", "ramp"),
    primary_view_kinds=("plan",),
    primary_disciplines=("architectural", "structural", "mixed"),
    supporting_subjects=("stair", "ramp", "slab"),
    schedule_subjects=("stair", "ramp"),
    detail_subjects=("stair", "ramp"),
    evidence_keywords=("stair", "staircase", "ramp", "flight", "landing", "balustrade"),
    legacy_name_patterns=("stair", "ramp"),
    one_primary_per_group=False,
    require_every_level=False,
    allow_multiple_unmapped=True,
    require_vertical_evidence=True,
)
