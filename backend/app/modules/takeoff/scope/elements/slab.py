from ..models import ElementScopeSpec, FactDependency

SCOPE_SPEC = ElementScopeSpec(
    key="slab",
    label="Slab",
    primary_subjects=("slab",),
    primary_view_kinds=("plan",),
    primary_disciplines=("structural", "mixed"),
    supporting_subjects=("slab", "beam"),
    schedule_subjects=("slab",),
    detail_subjects=("slab", "beam", "connection"),
    evidence_keywords=("slab", "deck", "soffit", "drop", "precast", "ribbed", "coffered"),
    require_vertical_evidence=True,
    dependencies=(FactDependency("beam_solid", "beams", required=True),),
)
