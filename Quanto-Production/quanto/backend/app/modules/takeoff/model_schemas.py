from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PixelPoint(Strict):
    x: int = Field(ge=0)
    y: int = Field(ge=0)


class Evidence(Strict):
    kind: str
    text: str | None = None
    bbox: list[int] | None = None
    confidence: float = Field(ge=0, le=1)


class FunctionalZone(Strict):
    name: str
    normalized_type: str | None = None
    polygon: list[PixelPoint] | None = None
    finish_code: str | None = None
    finish_material_text: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)


class FloorFinishEvidence(Strict):
    code: str | None = None
    material_text: str | None = None
    colour_hint: str | None = None
    hatch_hint: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)


class FloorSpaceOut(Strict):
    raw_label: str | None = None
    name: str | None = None
    normalized_type: str
    environment: Literal["internal", "external", "semi_external"]
    polygon: list[PixelPoint]
    holes: list[list[PixelPoint]] = Field(default_factory=list)
    functional_zones: list[FunctionalZone] = Field(default_factory=list)
    finish_evidence: FloorFinishEvidence | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    geometry_confidence: float = Field(ge=0, le=1)
    semantic_confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def enough_points(self):
        if len(self.polygon) < 3:
            raise ValueError("floor space polygon needs >= 3 points")
        return self


class FloorRegionOut(Strict):
    name: str
    classification: str
    polygon: list[PixelPoint]
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class FloorGeometryOutput(Strict):
    source_width_px: int = Field(gt=0)
    source_height_px: int = Field(gt=0)
    floor_label: str | None = None
    typical_range: str | None = None
    spaces: list[FloorSpaceOut]
    connector_regions: list[FloorRegionOut] = Field(default_factory=list)
    special_regions: list[FloorRegionOut] = Field(default_factory=list)
    non_floor_regions: list[FloorRegionOut] = Field(default_factory=list)
    obstructions: list[FloorRegionOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)


class FinishDefinitionOut(Strict):
    code: str
    name: str
    description: str | None = None
    material_category: str | None = None
    material: str | None = None
    tile_width_mm: float | None = None
    tile_length_mm: float | None = None
    thickness_mm: float | None = None
    surface_finish: str | None = None
    bedding: str | None = None
    internal_external: Literal["internal", "external", "both"] = "both"
    waste_percent: float = 0
    source_text: str
    confidence: float = Field(ge=0, le=1)


class RoomFinishRuleOut(Strict):
    room_types: list[str]
    finish_code: str
    exceptions: list[str] = Field(default_factory=list)
    source_text: str
    confidence: float = Field(ge=0, le=1)


class FloorWorkDefinitionOut(Strict):
    code: str | None = None
    work_type: Literal["screed", "waterproofing", "underlay", "board_insulation", "quilt_insulation", "isolation_membrane", "sealer", "skirting"]
    name: str
    description: str | None = None
    material: str | None = None
    thickness_mm: float | None = None
    layer_count: int | None = None
    height_mm: float | None = None
    source_text: str
    confidence: float = Field(ge=0, le=1)


class FloorWorkRuleOut(Strict):
    room_types: list[str]
    finish_codes: list[str] = Field(default_factory=list)
    work_type: Literal["screed", "waterproofing", "underlay", "board_insulation", "quilt_insulation", "isolation_membrane", "sealer", "skirting"]
    required: bool
    definition_code: str | None = None
    upturn_height_mm: float | None = None
    source_text: str
    confidence: float = Field(ge=0, le=1)


class FloorCatalogOutput(Strict):
    finish_definitions: list[FinishDefinitionOut] = Field(default_factory=list)
    room_finish_rules: list[RoomFinishRuleOut] = Field(default_factory=list)
    work_definitions: list[FloorWorkDefinitionOut] = Field(default_factory=list)
    work_rules: list[FloorWorkRuleOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class CeilingFinishEvidenceOut(Strict):
    code: str | None = None
    material_text: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)


class CeilingZoneOut(Strict):
    name: str | None = None
    room_labels: list[str] = Field(default_factory=list)
    polygon: list[PixelPoint]
    holes: list[list[PixelPoint]] = Field(default_factory=list)
    special_type: Literal[
        "flat", "sloped", "raked", "vaulted", "multi_plane", "stepped", "dropped",
        "partial_suspended", "ceiling_island", "exposed_soffit", "external_soffit",
        "stair_soffit", "double_height", "open_to_sky", "no_ceiling", "unknown_special"
    ] = "flat"
    ceiling_level_text: str | None = None
    high_level_text: str | None = None
    low_level_text: str | None = None
    slope_direction_degrees: float | None = None
    finish_evidence: CeilingFinishEvidenceOut | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class CeilingFeatureOut(Strict):
    feature_type: Literal["bulkhead", "beam", "soffit", "isolated_strip", "upstand", "cornice", "cove", "moulding", "edge_trim", "angle_trim", "shadow_gap", "fire_barrier", "service_collar", "fitting", "insulation", "repair", "access_panel"]
    name: str | None = None
    polygon: list[PixelPoint] | None = None
    line: list[PixelPoint] | None = None
    width_mm: float | None = None
    height_mm: float | None = None
    depth_mm: float | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class CeilingGeometryOutput(Strict):
    source_width_px: int = Field(gt=0)
    source_height_px: int = Field(gt=0)
    floor_label: str | None = None
    zones: list[CeilingZoneOut]
    features: list[CeilingFeatureOut] = Field(default_factory=list)
    exclusions: list[FloorRegionOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)


class CeilingDefinitionOut(Strict):
    code: str
    name: str
    description: str | None = None
    system_type: Literal["applied_finish", "suspended_gypsum", "suspended_grid", "cement_plaster", "exposed_structure", "no_ceiling", "other"]
    material: str | None = None
    finish: str | None = None
    thickness_mm: float | None = None
    suspension_system: str | None = None
    moisture_rating: str | None = None
    source_text: str
    confidence: float = Field(ge=0, le=1)


class CeilingRoomRuleOut(Strict):
    room_types: list[str]
    ceiling_code: str
    exceptions: list[str] = Field(default_factory=list)
    source_text: str
    confidence: float = Field(ge=0, le=1)


class CeilingCatalogOutput(Strict):
    definitions: list[CeilingDefinitionOut] = Field(default_factory=list)
    room_rules: list[CeilingRoomRuleOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class SectionObservationOut(Strict):
    level_label: str | None = None
    room_label: str | None = None
    observation_type: Literal["sloped_ceiling", "bulkhead", "double_height", "stair_soffit", "dropped_ceiling", "vaulted_ceiling", "no_ceiling", "other"]
    high_level_text: str | None = None
    low_level_text: str | None = None
    height_text: str | None = None
    slope_direction_text: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class SectionObservationOutput(Strict):
    observations: list[SectionObservationOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Wall production schemas (wall-detection-v1 / wall-catalog-v1)
# ---------------------------------------------------------------------------


class WallOpeningCandidateOut(Strict):
    opening_id: str
    center: PixelPoint
    opening_type: Literal["door", "window", "opening", "unknown"] = "unknown"
    tag: str | None = None
    width_px: float | None = Field(default=None, gt=0)
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class WallRunOut(Strict):
    wall_id: str
    centerline: list[PixelPoint]
    wall_mark: str | None = None
    wall_kind: Literal[
        "full_height", "partition", "external_wall", "core_wall", "shaft_wall",
        "retaining_wall", "parapet", "guard_wall", "partial_height", "double_height", "curved_wall", "unknown"
    ] = "unknown"
    classification: Literal["internal", "external", "unknown"] = "unknown"
    thickness_px: float | None = Field(default=None, gt=0)
    thickness_mm_visible: float | None = Field(default=None, gt=0)
    height_mm_visible: float | None = Field(default=None, gt=0)
    adjacent_space_left: str | None = None
    adjacent_space_right: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def enough_points(self):
        if len(self.centerline) < 2:
            raise ValueError("wall centerline needs >= 2 points")
        return self


class WallGeometryOutput(Strict):
    schema_version: Literal["wall-detection-v1"] = "wall-detection-v1"
    source_width_px: int = Field(gt=0)
    source_height_px: int = Field(gt=0)
    floor_label: str | None = None
    walls: list[WallRunOut]
    opening_candidates: list[WallOpeningCandidateOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)


class WallTypeDefinitionOut(Strict):
    code: str
    name: str
    description: str | None = None
    wall_kind: Literal[
        "masonry", "concrete", "framed_partition", "drywall_partition", "timber_partition",
        "glazed_partition", "core_wall", "shaft_wall", "retaining_wall", "parapet", "other", "unknown"
    ] = "unknown"
    classification: Literal["internal", "external", "both", "unknown"] = "unknown"
    material: str | None = None
    thickness_mm: float | None = Field(default=None, gt=0)
    height_mm: float | None = Field(default=None, gt=0)
    construction: str | None = None
    structural_role: Literal["loadbearing", "non_loadbearing", "structural", "unknown"] = "unknown"
    nrm_work_section: str | None = None
    source_text: str
    confidence: float = Field(ge=0, le=1)


class WallFinishDefinitionOut(Strict):
    code: str
    name: str
    description: str | None = None
    material: str | None = None
    thickness_mm: float | None = Field(default=None, ge=0)
    internal_external: Literal["internal", "external", "both"] = "both"
    coverage_mode: Literal["full_height", "dado", "splashback", "partial_height", "unknown"] = "full_height"
    coverage_height_mm: float | None = Field(default=None, gt=0)
    source_text: str
    confidence: float = Field(ge=0, le=1)


class WallFinishRuleOut(Strict):
    room_types: list[str]
    finish_codes: list[str]
    side_scope: Literal["room_face", "external_face", "both_faces", "unknown"] = "room_face"
    exceptions: list[str] = Field(default_factory=list)
    source_text: str
    confidence: float = Field(ge=0, le=1)


class WallOpeningReferenceOut(Strict):
    code: str
    opening_type: Literal["door", "window", "opening", "unknown"] = "unknown"
    width_mm: float | None = Field(default=None, gt=0)
    height_mm: float | None = Field(default=None, gt=0)
    source_text: str
    confidence: float = Field(ge=0, le=1)


class WallCatalogOutput(Strict):
    wall_types: list[WallTypeDefinitionOut] = Field(default_factory=list)
    finish_definitions: list[WallFinishDefinitionOut] = Field(default_factory=list)
    finish_rules: list[WallFinishRuleOut] = Field(default_factory=list)
    opening_references: list[WallOpeningReferenceOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class WallVerticalObservationOut(Strict):
    level_label: str | None = None
    wall_code: str | None = None
    observation_type: Literal[
        "full_height", "parapet_height", "retaining_height", "partial_height", "double_height",
        "wall_top_level", "wall_base_level", "stepped_height", "other"
    ]
    height_mm: float | None = Field(default=None, gt=0)
    height_text: str | None = None
    base_level_text: str | None = None
    top_level_text: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class WallVerticalOutput(Strict):
    observations: list[WallVerticalObservationOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)



# ---------------------------------------------------------------------------
# Doors & windows production schemas (opening-detection-v1 / opening-catalog-v1)
# ---------------------------------------------------------------------------


class OpeningPlanItemOut(Strict):
    opening_id: str
    kind: Literal["door", "window"]
    center: PixelPoint
    bbox: list[int] = Field(min_length=4, max_length=4)
    tag: str | None = None
    orientation_degrees: float | None = Field(default=None, ge=0, lt=360)
    visible_width_px: float | None = Field(default=None, gt=0)
    operation_hint: str | None = None
    leaf_count_visible: int | None = Field(default=None, ge=1)
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def valid_bbox(self):
        if self.bbox[2] <= 0 or self.bbox[3] <= 0:
            raise ValueError("opening bbox width/height must be positive")
        return self


class OpeningGeometryOutput(Strict):
    schema_version: Literal["opening-detection-v1"] = "opening-detection-v1"
    source_width_px: int = Field(gt=0)
    source_height_px: int = Field(gt=0)
    level_label: str | None = None
    openings: list[OpeningPlanItemOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)


class OpeningDefinitionOut(Strict):
    code: str
    kind: Literal["door", "window"]
    name: str
    description: str | None = None
    width_mm: float | None = Field(default=None, gt=0)
    height_mm: float | None = Field(default=None, gt=0)
    thickness_mm: float | None = Field(default=None, ge=0)
    material: str | None = None
    frame_material: str | None = None
    leaf_material: str | None = None
    glazing: str | None = None
    operation: str | None = None
    leaf_count: int | None = Field(default=None, ge=1)
    fire_rating: str | None = None
    acoustic_rating: str | None = None
    smoke_rating: str | None = None
    security_rating: str | None = None
    finish: str | None = None
    ironmongery_set: str | None = None
    sill_height_mm: float | None = Field(default=None, ge=0)
    head_height_mm: float | None = Field(default=None, gt=0)
    nrm_work_section: str | None = None
    scheduled_quantity: float | None = Field(default=None, ge=0)
    location_text: str | None = None
    source_text: str
    confidence: float = Field(ge=0, le=1)


class OpeningCatalogOutput(Strict):
    definitions: list[OpeningDefinitionOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class OpeningDetailObservationOut(Strict):
    code: str | None = None
    kind: Literal["door", "window", "unknown"] = "unknown"
    observation_type: Literal[
        "size", "frame", "leaf_panel", "glazing", "operation", "sill_head", "fire_acoustic",
        "ironmongery", "finish", "section_detail", "other"
    ]
    width_mm: float | None = Field(default=None, gt=0)
    height_mm: float | None = Field(default=None, gt=0)
    thickness_mm: float | None = Field(default=None, ge=0)
    sill_height_mm: float | None = Field(default=None, ge=0)
    head_height_mm: float | None = Field(default=None, gt=0)
    frame_material: str | None = None
    leaf_material: str | None = None
    glazing: str | None = None
    operation: str | None = None
    fire_rating: str | None = None
    acoustic_rating: str | None = None
    ironmongery_set: str | None = None
    finish: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class OpeningDetailOutput(Strict):
    observations: list[OpeningDetailObservationOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

# ---------------------------------------------------------------------------
# Roof production schemas (roof-detection-v1 / roof-system-resolution-v1)
# ---------------------------------------------------------------------------


class RoofPitchOut(Strict):
    value: float | None = None
    unit: Literal["degrees", "percent", "ratio", "rise_run", "unknown"] = "unknown"
    raw_text: str | None = None
    source_kind: str | None = None


class RoofPlaneOut(Strict):
    plane_id: str
    name: str | None = None
    surface_type: Literal["flat", "sloped_planar", "curved", "unknown"]
    polygon: list[PixelPoint]
    pitch: RoofPitchOut | None = None
    slope_direction: str | None = None
    material_evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def enough_points(self):
        if len(self.polygon) < 3:
            raise ValueError("roof plane polygon needs >= 3 points")
        return self


class RoofEdgeOut(Strict):
    edge_id: str
    plane_ids: list[str] = Field(default_factory=list)
    edge_type: Literal[
        "ridge", "hip", "valley", "eave", "verge", "rake", "abutment", "parapet",
        "pitch_change", "level_change", "roof_step", "gutter", "valley_gutter",
        "internal_gutter", "unknown_roof_boundary"
    ]
    line: list[PixelPoint]
    height_mm: float | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class RoofOpeningOut(Strict):
    opening_id: str
    plane_id: str | None = None
    opening_type: Literal[
        "rooflight", "skylight", "lanternlight", "roof_hatch", "access_hatch", "smoke_vent",
        "chimney", "duct_penetration", "pipe_penetration", "roof_void", "open_courtyard",
        "plant_opening", "other"
    ]
    name: str | None = None
    polygon: list[PixelPoint]
    deduct_from_area: bool = True
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class RoofDrainageOut(Strict):
    drainage_id: str
    plane_id: str | None = None
    drainage_type: Literal[
        "gutter", "valley_gutter", "box_gutter", "internal_gutter", "roof_outlet", "rwp",
        "downpipe", "hopper", "scupper", "sump", "overflow"
    ]
    name: str | None = None
    line: list[PixelPoint] | None = None
    point: PixelPoint | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class RoofRegionOut(Strict):
    roof_id: str
    name: str | None = None
    roof_type: Literal[
        "flat", "concrete", "mono_pitch", "gable", "hip", "intersecting", "butterfly",
        "mansard", "gambrel", "saltbox", "sawtooth", "curved", "barrel", "dome", "conical",
        "glazed", "green", "terrace", "canopy", "plant_roof", "unknown"
    ] = "unknown"
    roof_level_text: str | None = None
    outer_boundary: list[PixelPoint]
    planes: list[RoofPlaneOut]
    edges: list[RoofEdgeOut] = Field(default_factory=list)
    openings: list[RoofOpeningOut] = Field(default_factory=list)
    drainage: list[RoofDrainageOut] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class RoofReferenceMarkerOut(Strict):
    marker_type: str
    text: str | None = None
    bbox: list[int] | None = None
    confidence: float = Field(ge=0, le=1)


class RoofReviewOut(Strict):
    severity: Literal["warning", "blocker"]
    code: str | None = None
    entity_kind: str | None = None
    entity_id: str | None = None
    message: str


class RoofGeometryOutput(Strict):
    schema_version: Literal["roof-detection-v1"] = "roof-detection-v1"
    source_width_px: int = Field(gt=0)
    source_height_px: int = Field(gt=0)
    drawing_scope: str | None = None
    roof_regions: list[RoofRegionOut]
    reference_markers: list[RoofReferenceMarkerOut] = Field(default_factory=list)
    review_items: list[RoofReviewOut] = Field(default_factory=list)


class RoofLayerDefinitionOut(Strict):
    category: Literal["covering", "waterproofing", "underlay", "insulation", "screed_falls", "protection", "finish", "other"]
    code: str | None = None
    name: str
    description: str | None = None
    material: str | None = None
    thickness_mm: float | None = None
    factor_per_m2: float = Field(default=1.0, gt=0)
    measurement_unit: str = "m²"
    nrm_work_section: str | None = None
    source_text: str
    confidence: float = Field(ge=0, le=1)


class RoofSystemDefinitionOut(Strict):
    system_id: str
    mark: str
    name: str
    description: str | None = None
    covering_class: Literal["sheet", "tile_slate", "waterproofed_flat", "glazed", "green", "concrete_exposed", "other", "unknown"]
    falls_text: str | None = None
    waste_percent: float = Field(default=0, ge=0, le=100)
    layers: list[RoofLayerDefinitionOut] = Field(default_factory=list)
    source_text: str
    confidence: float = Field(ge=0, le=1)


class RoofSystemAssignmentOut(Strict):
    roof_id: str
    plane_ids: list[str]
    system_id: str
    method: Literal["drawing_tag", "drawing_note", "legend", "schedule", "specification", "detail", "combined"]
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)
    status: Literal["resolved", "needs_review"] = "resolved"


class RoofSystemResolutionOutput(Strict):
    schema_version: Literal["roof-system-resolution-v1"] = "roof-system-resolution-v1"
    system_definitions: list[RoofSystemDefinitionOut] = Field(default_factory=list)
    assignments: list[RoofSystemAssignmentOut] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RoofGeometryRepairOutput(Strict):
    entity_kind: Literal["region", "plane", "opening", "edge"]
    entity_id: str
    polygon: list[PixelPoint] | None = None
    line: list[PixelPoint] | None = None
    explanation: str | None = None

# ---------------------------------------------------------------------------
# Stairs & ramps production schemas (stairs-ramps-detection-v1 / catalog-v1)
# ---------------------------------------------------------------------------


class StairRampRunOut(Strict):
    run_id: str
    run_kind: Literal["stair_flight", "ramp_run"]
    polygon: list[PixelPoint]
    centerline: list[PixelPoint]
    width_px: float | None = Field(default=None, gt=0)
    direction: Literal["up", "down", "unknown"] = "unknown"
    visible_riser_count: int | None = Field(default=None, ge=0)
    visible_tread_count: int | None = Field(default=None, ge=0)
    slope_text: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def enough_geometry(self):
        if len(self.polygon) < 3:
            raise ValueError("stair/ramp run polygon needs >= 3 points")
        if len(self.centerline) < 2:
            raise ValueError("stair/ramp run centerline needs >= 2 points")
        return self


class StairRampLandingOut(Strict):
    landing_id: str
    polygon: list[PixelPoint]
    landing_type: Literal["intermediate", "half_landing", "quarter_landing", "switchback_landing", "bottom", "top", "unknown"] = "unknown"
    include_in_element: bool = True
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def enough_points(self):
        if len(self.polygon) < 3:
            raise ValueError("landing polygon needs >= 3 points")
        return self


class StairRampRailSegmentOut(Strict):
    rail_id: str
    line: list[PixelPoint]
    host_run_id: str | None = None
    rail_mark: str | None = None
    segment_kind: Literal["sloping", "level", "unknown"] = "unknown"
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def enough_points(self):
        if len(self.line) < 2:
            raise ValueError("balustrade segment needs >= 2 points")
        return self


class StairRampAssemblyOut(Strict):
    item_id: str
    kind: Literal["stair", "ramp"]
    type_mark: str | None = None
    name: str | None = None
    outer_boundary: list[PixelPoint]
    holes: list[list[PixelPoint]] = Field(default_factory=list)
    runs: list[StairRampRunOut] = Field(default_factory=list)
    landings: list[StairRampLandingOut] = Field(default_factory=list)
    rail_segments: list[StairRampRailSegmentOut] = Field(default_factory=list)
    width_px: float | None = Field(default=None, gt=0)
    start_level_label: str | None = None
    end_level_label: str | None = None
    connects_adjacent_storey: bool | None = None
    measurement_role: Literal["quantity_owner", "arrival_evidence", "partial_evidence", "unknown"] = "unknown"
    include_in_quantity: bool = True
    rise_mm_visible: float | None = Field(default=None, gt=0)
    start_level_elevation_mm_visible: float | None = None
    end_level_elevation_mm_visible: float | None = None
    slope_degrees_visible: float | None = Field(default=None, gt=0, lt=90)
    slope_percent_visible: float | None = Field(default=None, gt=0)
    construction_hint: str | None = None
    finish_hint: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def valid_assembly(self):
        if len(self.outer_boundary) < 3:
            raise ValueError("stair/ramp outer boundary needs >= 3 points")
        if self.kind == "stair" and not any(x.run_kind == "stair_flight" for x in self.runs):
            raise ValueError("stair assembly needs at least one stair_flight run")
        if self.kind == "ramp" and not any(x.run_kind == "ramp_run" for x in self.runs):
            raise ValueError("ramp assembly needs at least one ramp_run")
        return self


class StairRampGeometryOutput(Strict):
    schema_version: Literal["stairs-ramps-detection-v1"] = "stairs-ramps-detection-v1"
    source_width_px: int = Field(gt=0)
    source_height_px: int = Field(gt=0)
    level_label: str | None = None
    items: list[StairRampAssemblyOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)


class StairRampFamilyDefinitionOut(Strict):
    code: str
    name: str
    kind: Literal["stair", "ramp"]
    description: str | None = None
    construction_type: Literal["in_situ_concrete", "precast_concrete", "steel", "timber", "masonry", "composite", "other", "unknown"] = "unknown"
    material: str | None = None
    width_mm: float | None = Field(default=None, gt=0)
    riser_mm: float | None = Field(default=None, gt=0)
    tread_mm: float | None = Field(default=None, gt=0)
    waist_mm: float | None = Field(default=None, gt=0)
    landing_thickness_mm: float | None = Field(default=None, gt=0)
    support_condition: Literal["suspended", "ground_bearing", "mixed", "unknown"] = "unknown"
    concrete_profile: Literal["waist_slab_with_steps", "waist_slab", "solid", "other", "unknown"] = "unknown"
    tread_finish_code: str | None = None
    riser_finish_code: str | None = None
    string_finish_code: str | None = None
    ramp_finish_code: str | None = None
    nrm_work_section: str | None = None
    source_text: str
    confidence: float = Field(ge=0, le=1)


class StairRampFamilyRuleOut(Strict):
    level_labels: list[str] = Field(default_factory=list)
    location_labels: list[str] = Field(default_factory=list)
    family_code: str
    source_text: str
    confidence: float = Field(ge=0, le=1)


class BalustradeDefinitionOut(Strict):
    code: str
    name: str
    description: str | None = None
    material: str | None = None
    height_mm: float | None = Field(default=None, gt=0)
    finish: str | None = None
    source_text: str
    confidence: float = Field(ge=0, le=1)


class StairRampCatalogOutput(Strict):
    families: list[StairRampFamilyDefinitionOut] = Field(default_factory=list)
    family_rules: list[StairRampFamilyRuleOut] = Field(default_factory=list)
    balustrades: list[BalustradeDefinitionOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class StairRampVerticalObservationOut(Strict):
    target_mark: str | None = None
    level_label: str | None = None
    kind: Literal["stair", "ramp", "unknown"] = "unknown"
    observation_type: Literal["dimensions", "rise", "slope", "construction", "landing", "balustrade", "finish", "other"]
    width_mm: float | None = Field(default=None, gt=0)
    rise_mm: float | None = Field(default=None, gt=0)
    start_level_elevation_mm: float | None = None
    end_level_elevation_mm: float | None = None
    riser_mm: float | None = Field(default=None, gt=0)
    tread_mm: float | None = Field(default=None, gt=0)
    waist_mm: float | None = Field(default=None, gt=0)
    landing_thickness_mm: float | None = Field(default=None, gt=0)
    slope_degrees: float | None = Field(default=None, gt=0, lt=90)
    slope_percent: float | None = Field(default=None, gt=0)
    flight_count: int | None = Field(default=None, ge=1)
    riser_count: int | None = Field(default=None, ge=1)
    tread_count: int | None = Field(default=None, ge=0)
    construction_type: Literal["in_situ_concrete", "precast_concrete", "steel", "timber", "masonry", "composite", "other", "unknown"] = "unknown"
    support_condition: Literal["suspended", "ground_bearing", "mixed", "unknown"] = "unknown"
    rail_mark: str | None = None
    rail_height_mm: float | None = Field(default=None, gt=0)
    tread_finish_code: str | None = None
    riser_finish_code: str | None = None
    string_finish_code: str | None = None
    ramp_finish_code: str | None = None
    source_text: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class StairRampVerticalOutput(Strict):
    observations: list[StairRampVerticalObservationOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)

# ---------------------------------------------------------------------------
# Columns production schemas (column-detection-v1 / column-catalog-v1)
# ---------------------------------------------------------------------------


class ColumnPlanItemOut(Strict):
    column_id: str
    center: PixelPoint
    bbox: list[int]
    footprint: list[PixelPoint] = Field(default_factory=list)
    mark: str | None = None
    shape: Literal["rectangular", "circular", "polygonal", "unknown"] = "unknown"
    rotation_degrees: float | None = None
    section_width_px: float | None = Field(default=None, gt=0)
    section_depth_px: float | None = Field(default=None, gt=0)
    diameter_px: float | None = Field(default=None, gt=0)
    width_mm_visible: float | None = Field(default=None, gt=0)
    depth_mm_visible: float | None = Field(default=None, gt=0)
    diameter_mm_visible: float | None = Field(default=None, gt=0)
    height_mm_visible: float | None = Field(default=None, gt=0)
    start_level_text: str | None = None
    end_level_text: str | None = None
    spans_full_storey: bool | None = None
    construction_hint: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def valid_bbox(self):
        if len(self.bbox) != 4 or self.bbox[2] <= 0 or self.bbox[3] <= 0:
            raise ValueError("column bbox must be [x,y,width,height] with positive size")
        if self.footprint and len(self.footprint) < 3:
            raise ValueError("column footprint needs >= 3 points when supplied")
        return self


class ColumnGeometryOutput(Strict):
    schema_version: Literal["column-detection-v1"] = "column-detection-v1"
    source_width_px: int = Field(gt=0)
    source_height_px: int = Field(gt=0)
    level_label: str | None = None
    columns: list[ColumnPlanItemOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    questions: list[str] = Field(default_factory=list)


class ColumnDefinitionOut(Strict):
    code: str
    name: str
    description: str | None = None
    shape: Literal["rectangular", "circular", "polygonal", "unknown"] = "unknown"
    width_mm: float | None = Field(default=None, gt=0)
    depth_mm: float | None = Field(default=None, gt=0)
    diameter_mm: float | None = Field(default=None, gt=0)
    material: str | None = None
    concrete_grade: str | None = None
    reinforcement_description: str | None = None
    reinforcement_rate_kg_per_m3: float | None = Field(default=None, gt=0)
    reinforcement_kg_per_column: float | None = Field(default=None, gt=0)
    cover_mm: float | None = Field(default=None, ge=0)
    fire_rating: str | None = None
    finish: str | None = None
    nrm_work_section: str | None = None
    level_labels: list[str] = Field(default_factory=list)
    location_labels: list[str] = Field(default_factory=list)
    source_text: str
    confidence: float = Field(ge=0, le=1)


class ColumnFamilyRuleOut(Strict):
    column_code: str
    level_labels: list[str] = Field(default_factory=list)
    location_labels: list[str] = Field(default_factory=list)
    source_text: str
    confidence: float = Field(ge=0, le=1)


class ColumnCatalogOutput(Strict):
    definitions: list[ColumnDefinitionOut] = Field(default_factory=list)
    family_rules: list[ColumnFamilyRuleOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class ColumnVerticalObservationOut(Strict):
    target_mark: str | None = None
    level_label: str | None = None
    observation_type: Literal[
        "height", "levels", "section", "pedestal", "capital", "reinforcement", "construction", "other"
    ]
    height_mm: float | None = Field(default=None, gt=0)
    start_level_elevation_mm: float | None = None
    end_level_elevation_mm: float | None = None
    width_mm: float | None = Field(default=None, gt=0)
    depth_mm: float | None = Field(default=None, gt=0)
    diameter_mm: float | None = Field(default=None, gt=0)
    concrete_grade: str | None = None
    reinforcement_description: str | None = None
    reinforcement_rate_kg_per_m3: float | None = Field(default=None, gt=0)
    reinforcement_kg_per_column: float | None = Field(default=None, gt=0)
    feature_type: Literal["none", "pedestal", "capital", "drop", "other"] = "none"
    feature_width_mm: float | None = Field(default=None, gt=0)
    feature_depth_mm: float | None = Field(default=None, gt=0)
    feature_height_mm: float | None = Field(default=None, gt=0)
    source_text: str | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    confidence: float = Field(ge=0, le=1)


class ColumnVerticalOutput(Strict):
    observations: list[ColumnVerticalObservationOut] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
