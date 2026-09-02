from ..models import ElementScopeSpec

SCOPE_SPEC = ElementScopeSpec(
    key="foundation",
    label="Foundation",
    primary_subjects=("foundation", "footing", "raft", "pile", "pile_cap", "ground_beam"),
    primary_view_kinds=("plan",),
    primary_disciplines=("structural", "mixed"),
    supporting_subjects=("foundation", "footing", "raft", "pile", "pile_cap", "ground_beam", "column"),
    schedule_subjects=("foundation", "footing", "raft", "pile", "pile_cap"),
    detail_subjects=("foundation", "footing", "raft", "pile", "pile_cap", "ground_beam"),
    evidence_keywords=("foundation", "footing", "raft", "pile", "pile cap", "ground beam", "pad"),
    group_mode="foundation_scope",
    one_primary_per_group=True,
    allow_multiple_unmapped=True,
    require_vertical_evidence=True,
)
