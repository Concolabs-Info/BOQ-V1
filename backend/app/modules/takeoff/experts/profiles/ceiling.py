from ...harness.contracts import ElementExpertSpec
SPEC = ElementExpertSpec(
    key="ceiling", runtime_key="ceiling", display_name="Ceilings", scope_key="ceiling", prompt_files=("ceiling.md",),
    publishes=("ceiling_geometry",), consumes=("floor_geometry",),
    boq_ownership=("ceiling_finish","suspended_ceiling","ceiling_lining","bulkhead","external_soffit","ceiling_insulation"),
    strategies=("inherit_confirmed_floor","review_only_floor_candidate","rcp_override","bulkhead_override","sloped_surface","no_ceiling_exception"),
    validation_focus=("source_authority","coverage","surface_area","vertical_profile","override_conflicts"),
)
