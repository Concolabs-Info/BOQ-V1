from ..models import ElementScopeSpec

SCOPE_SPEC = ElementScopeSpec(
    key="beams",
    label="Beams",
    primary_subjects=("beam",),
    primary_view_kinds=("plan",),
    primary_disciplines=("structural", "mixed"),
    supporting_subjects=("beam", "slab", "column"),
    schedule_subjects=("beam",),
    detail_subjects=("beam", "connection"),
    evidence_keywords=("beam", "framing", "datum"),
    require_vertical_evidence=True,
    require_level_datum=True,
)
