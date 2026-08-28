import math

from app.modules.takeoff.model_schemas import RoofGeometryOutput, RoofSystemResolutionOutput
from app.modules.takeoff.roofs import nrm_section_for_covering, nrm_section_for_layer, surface_area_from_projected


def test_pitched_roof_surface_area_is_deterministic():
    area, status = surface_area_from_projected(100.0, "sloped_planar", 30.0)
    assert status == "measured"
    assert math.isclose(area, 115.4701, abs_tol=0.0001)


def test_curved_roof_needs_profile_not_invented_area():
    area, status = surface_area_from_projected(100.0, "curved", None)
    assert area is None
    assert status == "profile_required"


def test_roof_nrm_routes_covering_layers():
    assert nrm_section_for_covering("sheet") == "17"
    assert nrm_section_for_covering("tile_slate") == "18"
    assert nrm_section_for_covering("waterproofed_flat") == "19"
    assert nrm_section_for_layer("insulation") == "31"
    assert nrm_section_for_layer("waterproofing") == "19"


def test_roof_geometry_schema_supports_topology_openings_and_drainage():
    result = RoofGeometryOutput.model_validate({
        "schema_version": "roof-detection-v1",
        "source_width_px": 1200,
        "source_height_px": 900,
        "roof_regions": [{
            "roof_id": "RF-01",
            "name": "Main roof",
            "roof_type": "gable",
            "outer_boundary": [{"x": 100, "y": 100}, {"x": 1100, "y": 100}, {"x": 1100, "y": 800}, {"x": 100, "y": 800}],
            "planes": [{
                "plane_id": "P-01", "surface_type": "sloped_planar",
                "polygon": [{"x": 100, "y": 100}, {"x": 600, "y": 100}, {"x": 600, "y": 800}, {"x": 100, "y": 800}],
                "pitch": {"value": 30, "unit": "degrees", "raw_text": "30°", "source_kind": "roof note"},
                "slope_direction": "west", "material_evidence": [], "confidence": 0.95,
            }],
            "edges": [{"edge_id": "E-01", "plane_ids": ["P-01"], "edge_type": "ridge", "line": [{"x": 600, "y": 100}, {"x": 600, "y": 800}], "evidence": [], "confidence": 0.9}],
            "openings": [{"opening_id": "O-01", "plane_id": "P-01", "opening_type": "skylight", "polygon": [{"x": 300, "y": 300}, {"x": 360, "y": 300}, {"x": 360, "y": 360}, {"x": 300, "y": 360}], "deduct_from_area": True, "evidence": [], "confidence": 0.9}],
            "drainage": [{"drainage_id": "D-01", "plane_id": "P-01", "drainage_type": "gutter", "line": [{"x": 100, "y": 800}, {"x": 600, "y": 800}], "evidence": [], "confidence": 0.9}],
            "confidence": 0.95,
        }],
    })
    assert result.roof_regions[0].planes[0].pitch.value == 30
    assert result.roof_regions[0].openings[0].opening_type == "skylight"
    assert result.roof_regions[0].drainage[0].drainage_type == "gutter"


def test_roof_system_schema_keeps_evidence_and_assignment():
    result = RoofSystemResolutionOutput.model_validate({
        "schema_version": "roof-system-resolution-v1",
        "system_definitions": [{
            "system_id": "SYS-1", "mark": "R01", "name": "Tile roof", "covering_class": "tile_slate",
            "layers": [{"category": "covering", "name": "Clay tiles", "factor_per_m2": 1, "measurement_unit": "m²", "source_text": "R01 clay tiles", "confidence": 0.9}],
            "source_text": "R01 clay tiles", "confidence": 0.9,
        }],
        "assignments": [{"roof_id": "RF-01", "plane_ids": ["P-01"], "system_id": "SYS-1", "method": "drawing_tag", "evidence": [], "confidence": 0.9, "status": "resolved"}],
    })
    assert result.assignments[0].plane_ids == ["P-01"]
