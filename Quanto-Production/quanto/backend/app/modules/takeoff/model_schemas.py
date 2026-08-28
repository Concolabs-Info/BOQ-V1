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
