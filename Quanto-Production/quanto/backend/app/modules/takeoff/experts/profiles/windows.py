from ...harness.contracts import ElementExpertSpec
SPEC = ElementExpertSpec(
    key="windows", runtime_key="windows", display_name="Windows", scope_key="doors-windows", prompt_files=("windows.md",),
    publishes=("window_openings",), consumes=("wall_geometry",),
    boq_ownership=("window_set","window_frame","window_glazing","window_sill"),
    strategies=("plan_symbol_location","opening_tag_binding","schedule_binding","elevation_binding","host_wall_binding","plan_schedule_reconciliation"),
    validation_focus=("duplicate_instances","host_wall","mark_resolution","size","sill_head_levels","schedule_variance"),
)
