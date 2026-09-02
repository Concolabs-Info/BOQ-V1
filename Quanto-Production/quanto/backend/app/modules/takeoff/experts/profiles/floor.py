from ...harness.contracts import ElementExpertSpec
SPEC = ElementExpertSpec(
    key="floor", runtime_key="floor", display_name="Floors", scope_key="floor", prompt_files=("floor.md",),
    publishes=("floor_geometry","floor_finish_basis","skirting_basis"), consumes=("opening_area",),
    boq_ownership=("floor_finish","screed","waterproofing","underlay","insulation","membrane","sealer","skirting"),
    strategies=("room_space_geometry","finish_zone_partition","doorway_connectors","under_stair_exception","external_floor_exception"),
    validation_focus=("coverage","non_overlap","void_exclusion","connector_continuity","finish_assignment"),
)
