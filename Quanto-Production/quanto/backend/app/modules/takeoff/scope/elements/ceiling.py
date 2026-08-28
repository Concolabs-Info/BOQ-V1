from ..models import ElementScopeSpec

SCOPE_SPEC = ElementScopeSpec(
    key="ceiling",
    label="Ceiling",
    primary_subjects=("ceiling",),
    primary_view_kinds=("plan",),
    primary_disciplines=("architectural", "mixed"),
    supporting_subjects=("ceiling", "finish", "slab", "stair"),
    schedule_subjects=("ceiling", "finish"),
    detail_subjects=("ceiling", "finish"),
    evidence_keywords=("ceiling", "soffit", "bulkhead", "rcp", "reflected"),
    legacy_name_patterns=("ceiling", "reflected", "rcp"),
    require_vertical_evidence=True,
    require_storey_height=True,
    floor_geometry_fallback=True,
)
