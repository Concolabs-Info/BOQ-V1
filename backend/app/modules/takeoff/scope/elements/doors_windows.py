from ..models import ElementScopeSpec, FactDependency

SCOPE_SPEC = ElementScopeSpec(
    key="doors-windows",
    label="Doors & Windows",
    primary_subjects=("door", "window"),
    primary_view_kinds=("plan",),
    primary_disciplines=("architectural", "mixed"),
    supporting_subjects=("door", "window", "wall"),
    schedule_subjects=("door", "window"),
    detail_subjects=("door", "window"),
    evidence_keywords=("door", "window", "opening", "ironmongery", "glazing"),
    require_vertical_evidence=False,
    dependencies=(FactDependency("wall_geometry", "walls", required=False),),
)
