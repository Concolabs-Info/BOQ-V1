from ..models import ElementScopeSpec, FactDependency

SCOPE_SPEC = ElementScopeSpec(
    key="floor",
    label="Floor",
    primary_subjects=("floor", "finish"),
    primary_view_kinds=("plan",),
    primary_disciplines=("architectural", "mixed"),
    supporting_subjects=("finish", "floor", "stair"),
    schedule_subjects=("finish", "floor"),
    detail_subjects=("finish", "floor"),
    evidence_keywords=("floor", "finish", "room", "screed", "skirting", "waterproof"),
    legacy_name_patterns=("floor plan", "general arrangement", "apartment plan", "layout"),
    use_storey_source=True,
    dependencies=(FactDependency("opening_area", "doors-windows", required=False),),
)
