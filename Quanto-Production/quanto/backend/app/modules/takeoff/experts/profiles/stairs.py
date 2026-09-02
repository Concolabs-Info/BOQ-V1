from ...harness.contracts import ElementExpertSpec
SPEC = ElementExpertSpec(
    key="stairs", runtime_key="stairs", display_name="Stairs", scope_key="stairs-ramps", prompt_files=("stairs.md",),
    publishes=("stair_geometry",), consumes=("floor_geometry","slab_solid"),
    boq_ownership=("stair_concrete","stair_formwork","stair_reinforcement","tread_finish","riser_finish","landing_finish","stair_apron","stair_nosing"),
    strategies=("plan_instance","plan_section_multiview","level_resolution","flight_landing_geometry","finish_derivation"),
    validation_focus=("level_connection","riser_arithmetic","flight_continuity","landing_geometry","quantity_completeness"),
)
