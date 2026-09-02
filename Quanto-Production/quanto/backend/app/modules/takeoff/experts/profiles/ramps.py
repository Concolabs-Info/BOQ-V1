from ...harness.contracts import ElementExpertSpec
SPEC = ElementExpertSpec(
    key="ramps", runtime_key="ramps", display_name="Ramps", scope_key="stairs-ramps", prompt_files=("ramps.md",),
    publishes=("ramp_geometry",), consumes=("floor_geometry","slab_solid"),
    boq_ownership=("ramp_concrete","ramp_formwork","ramp_reinforcement","ramp_finish","ramp_kerb"),
    strategies=("plan_instance","plan_section_multiview","level_resolution","run_gradient_geometry","landing_kerb_geometry"),
    validation_focus=("rise_run_gradient","true_length","width","landing_geometry","quantity_completeness"),
)
