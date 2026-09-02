from ..models import ElementScopeSpec, FactDependency

SCOPE_SPEC = ElementScopeSpec(
    key="columns",
    label="Columns",
    primary_subjects=("column",),
    primary_view_kinds=("plan",),
    primary_disciplines=("structural", "mixed"),
    supporting_subjects=("column", "foundation", "beam", "slab"),
    schedule_subjects=("column",),
    detail_subjects=("column", "foundation", "footing", "pile_cap"),
    evidence_keywords=("column", "pedestal"),
    require_vertical_evidence=True,
    prefer_explicit_subject_in_name=True,
    dependencies=(
        FactDependency("beam_solid", "beams", required=True),
        FactDependency("slab_solid", "slab", required=True),
        FactDependency("pad_top_level", "foundation", required=False),
    ),
)
