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
