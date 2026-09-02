from ..models import ElementScopeSpec, FactDependency

SCOPE_SPEC = ElementScopeSpec(
    key="walls",
    label="Walls",
    primary_subjects=("wall", "structural_wall", "retaining_wall"),
    primary_view_kinds=("plan",),
    primary_disciplines=("architectural", "structural", "mixed"),
    supporting_subjects=("wall", "structural_wall", "retaining_wall", "door", "window"),
    schedule_subjects=("wall", "structural_wall", "retaining_wall"),
    detail_subjects=("wall", "structural_wall", "retaining_wall"),
    evidence_keywords=("wall", "partition", "masonry", "blockwork", "brickwork"),
    require_vertical_evidence=True,
    dependencies=(
        FactDependency("opening_area", "doors-windows", required=False),
        FactDependency("instance_position", "columns", required=False),
        FactDependency("beam_solid", "beams", required=False),
    ),
)
