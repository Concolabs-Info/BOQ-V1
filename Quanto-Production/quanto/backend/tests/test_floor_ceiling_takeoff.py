from app.modules.takeoff.common import area_m2, perimeter_m
from app.modules.takeoff.model_schemas import CeilingGeometryOutput, FloorGeometryOutput


def test_floor_area_is_deterministic_from_pixels_and_scale():
    points = [{"x": 0, "y": 0}, {"x": 1000, "y": 0}, {"x": 1000, "y": 500}, {"x": 0, "y": 500}]
    assert area_m2(points, 10.0) == 50.0
    assert perimeter_m(points, 10.0) == 30.0


def test_floor_schema_supports_holes_and_finish_subzones():
    payload = {
        "source_width_px": 1000,
        "source_height_px": 1000,
        "spaces": [{
            "raw_label": "LIVING/DINING & PANTRY",
            "name": "Living / dining / pantry",
            "normalized_type": "living dining pantry",
            "environment": "internal",
            "polygon": [{"x": 0, "y": 0}, {"x": 900, "y": 0}, {"x": 900, "y": 900}, {"x": 0, "y": 900}],
            "holes": [[{"x": 400, "y": 400}, {"x": 500, "y": 400}, {"x": 500, "y": 500}, {"x": 400, "y": 500}]],
            "functional_zones": [{
                "name": "Pantry", "normalized_type": "pantry",
                "polygon": [{"x": 600, "y": 0}, {"x": 900, "y": 0}, {"x": 900, "y": 250}, {"x": 600, "y": 250}],
                "finish_code": "F02", "evidence": [],
            }],
            "evidence": [], "geometry_confidence": 0.9, "semantic_confidence": 0.9,
        }],
    }
    result = FloorGeometryOutput.model_validate(payload)
    assert len(result.spaces[0].holes) == 1
    assert result.spaces[0].functional_zones[0].finish_code == "F02"


def test_ceiling_schema_supports_void_holes_and_special_profiles():
    payload = {
        "source_width_px": 1000, "source_height_px": 1000,
        "zones": [{
            "name": "Raked ceiling", "room_labels": ["Living"],
            "polygon": [{"x": 0, "y": 0}, {"x": 900, "y": 0}, {"x": 900, "y": 900}, {"x": 0, "y": 900}],
            "holes": [[{"x": 400, "y": 400}, {"x": 500, "y": 400}, {"x": 500, "y": 500}, {"x": 400, "y": 500}]],
            "special_type": "raked", "evidence": [], "confidence": 0.92,
        }],
    }
    result = CeilingGeometryOutput.model_validate(payload)
    assert result.zones[0].special_type == "raked"
    assert len(result.zones[0].holes) == 1
