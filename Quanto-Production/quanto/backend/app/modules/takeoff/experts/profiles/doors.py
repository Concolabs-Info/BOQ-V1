from ...harness.contracts import ElementExpertSpec
SPEC = ElementExpertSpec(
    key="doors", runtime_key="doors", display_name="Doors", scope_key="doors-windows", prompt_files=("doors.md",),
    publishes=("door_openings",), consumes=("wall_geometry",),
    boq_ownership=("door_set","door_leaf","door_frame","door_glazing","door_ironmongery","door_threshold"),
    strategies=("plan_symbol_location","opening_tag_binding","schedule_binding","host_wall_binding","plan_schedule_reconciliation"),
    validation_focus=("duplicate_instances","host_wall","mark_resolution","size","schedule_variance"),
)
