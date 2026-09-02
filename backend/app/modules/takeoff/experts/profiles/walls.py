from ...harness.contracts import ElementExpertSpec
SPEC = ElementExpertSpec(
    key="walls", runtime_key="walls", display_name="Walls", scope_key="walls", prompt_files=("walls.md",),
    publishes=("wall_geometry","wall_face_basis"), consumes=("opening_area","instance_position","beam_solid"),
    boq_ownership=("wall_body","wall_finish","render","plaster","wall_cladding","wall_insulation","wall_waterproofing"),
    strategies=("paired_faces","single_centreline","filled_poche","raster_vision","mixed_representation","vertical_height_resolution"),
    validation_focus=("wall_continuity","junctions","thickness","height","openings","false_positives"),
)
