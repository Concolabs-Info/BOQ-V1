from ...harness.contracts import ElementExpertSpec
SPEC = ElementExpertSpec(
    key="roof", runtime_key="roof", display_name="Roofs", scope_key="roof", prompt_files=("roof.md",),
    publishes=("roof_geometry",), consumes=("slab_solid",),
    boq_ownership=("roof_covering","roof_waterproofing","roof_insulation","roof_falls","roof_flashings","roof_edges","roof_drainage"),
    strategies=("flat_roof","pitched_planes","mixed_roof","canopy","curved_profile","roof_terrace"),
    validation_focus=("plane_coverage","overlap","pitch","ridge_hip_valley_topology","openings","boq_ownership"),
)
