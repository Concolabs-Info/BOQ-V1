from ..models import ElementScopeSpec

SCOPE_SPEC = ElementScopeSpec(
    key="roof",
    label="Roof",
    primary_subjects=("roof", "roof_structure"),
    primary_view_kinds=("plan",),
    primary_disciplines=("architectural", "structural", "mixed"),
    supporting_subjects=("roof", "roof_structure", "slab", "finish"),
    schedule_subjects=("roof", "roof_structure", "finish"),
    detail_subjects=("roof", "roof_structure"),
    evidence_keywords=("roof", "terrace", "canopy", "waterproof", "covering", "ridge", "valley", "gutter"),
    legacy_name_patterns=("roof", "roof terrace", "roof deck", "canopy"),
    group_mode="roof_scope",
    require_vertical_evidence=True,
)
