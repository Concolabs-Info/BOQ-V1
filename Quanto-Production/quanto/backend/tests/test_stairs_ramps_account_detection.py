from __future__ import annotations

import math

from app.modules.takeoff import stairs_ramps
from app.modules.takeoff.model_schemas import (
    StairRampCatalogOutput,
    StairRampGeometryOutput,
    StairRampVerticalOutput,
)


def _stair_geometry() -> StairRampGeometryOutput:
    return StairRampGeometryOutput.model_validate({
        "schema_version": "stairs-ramps-detection-v1",
        "source_width_px": 600,
        "source_height_px": 500,
        "level_label": "Ground Floor",
        "items": [{
            "item_id": "ST-01",
            "kind": "stair",
            "type_mark": "S1",
            "outer_boundary": [
                {"x": 10, "y": 10}, {"x": 110, "y": 10},
                {"x": 110, "y": 410}, {"x": 10, "y": 410},
            ],
            "runs": [{
                "run_id": "FL-01",
                "run_kind": "stair_flight",
                "polygon": [
                    {"x": 10, "y": 10}, {"x": 110, "y": 10},
                    {"x": 110, "y": 310}, {"x": 10, "y": 310},
                ],
                "centerline": [{"x": 60, "y": 10}, {"x": 60, "y": 310}],
                "width_px": 100,
                "visible_riser_count": 10,
                "visible_tread_count": 10,
                "evidence": [],
                "confidence": 0.98,
            }],
            "landings": [{
                "landing_id": "L-01",
                "landing_type": "intermediate",
                "include_in_element": True,
                "polygon": [
                    {"x": 10, "y": 310}, {"x": 110, "y": 310},
                    {"x": 110, "y": 410}, {"x": 10, "y": 410},
                ],
                "evidence": [],
                "confidence": 0.96,
            }],
            "rail_segments": [{
                "rail_id": "R-01",
                "line": [{"x": 10, "y": 10}, {"x": 10, "y": 310}],
                "host_run_id": "FL-01",
                "segment_kind": "sloping",
                "evidence": [],
                "confidence": 0.95,
            }],
            "connects_adjacent_storey": True,
            "evidence": [],
            "confidence": 0.97,
        }],
    })


def _ramp_geometry() -> StairRampGeometryOutput:
    return StairRampGeometryOutput.model_validate({
        "schema_version": "stairs-ramps-detection-v1",
        "source_width_px": 700,
        "source_height_px": 300,
        "items": [{
            "item_id": "RP-01",
            "kind": "ramp",
            "outer_boundary": [
                {"x": 10, "y": 10}, {"x": 110, "y": 10},
                {"x": 110, "y": 510}, {"x": 10, "y": 510},
            ],
            "runs": [{
                "run_id": "RUN-01",
                "run_kind": "ramp_run",
                "polygon": [
                    {"x": 10, "y": 10}, {"x": 110, "y": 10},
                    {"x": 110, "y": 510}, {"x": 10, "y": 510},
                ],
                "centerline": [{"x": 60, "y": 10}, {"x": 60, "y": 510}],
                "width_px": 100,
                "evidence": [],
                "confidence": 0.96,
            }],
            "evidence": [],
            "confidence": 0.96,
        }],
    })


def test_stair_geometry_cache_round_trips_across_repeated_storeys(monkeypatch, tmp_path):
    monkeypatch.setattr(stairs_ramps, "project_root", lambda _project_id: tmp_path)
    geometry = _stair_geometry()
    stairs_ramps._save_geometry_cache("p1", "floor-ground", "vp-a", "same-source", "expert", geometry)
    cached = stairs_ramps._load_geometry_cache("p1", "floor-typical", "vp-b", "same-source")
    assert cached is not None
    assert cached.items[0].item_id == "ST-01"
    payload = stairs_ramps._read_json(stairs_ramps._result_path("p1", "floor-ground", "vp-a"), {})
    assert payload["provider"] == "codex-account"


def test_stair_catalog_and_vertical_caches_are_independent(monkeypatch, tmp_path):
    monkeypatch.setattr(stairs_ramps, "project_root", lambda _project_id: tmp_path)
    stairs_ramps._save_catalog_cache("p1", "catalog-1", "medium", StairRampCatalogOutput())
    stairs_ramps._save_vertical_cache("p1", "section-a", "vertical-1", "medium", StairRampVerticalOutput())
    assert stairs_ramps._load_catalog_cache("p1", "catalog-1") is not None
    assert stairs_ramps._load_catalog_cache("p1", "catalog-2") is None
    assert stairs_ramps._load_vertical_cache("p1", "section-a", "vertical-1") is not None
    assert stairs_ramps._load_vertical_cache("p1", "section-a", "vertical-2") is None


def test_in_situ_stair_quantities_use_true_slope_and_owned_landing_only():
    item = _stair_geometry().items[0]
    values, reviews = stairs_ramps.calculate_stair_ramp_quantities(item, 10.0, {
        "width_mm": 1000,
        "rise_mm": 1500,
        "riser_mm": 150,
        "tread_mm": 300,
        "waist_mm": 150,
        "landing_thickness_mm": 150,
        "construction_type": "in_situ_concrete",
        "support_condition": "suspended",
        "concrete_profile": "waist_slab_with_steps",
        "tread_finish_code": "F-TREAD",
        "riser_finish_code": "F-RISER",
        "string_finish_code": None,
        "ramp_finish_code": None,
    })
    expected_angle = math.degrees(math.atan(0.5))
    expected_surface = 3.0 / math.cos(math.radians(expected_angle))
    expected_concrete = expected_surface * 0.15 + 0.5 * 3.0 * 0.15 + 1.0 * 0.15
    assert values["plan_area_m2"] == 4.0
    assert values["intermediate_landing_area_m2"] == 1.0
    assert values["sloping_surface_area_m2"] == round(expected_surface, 4)
    assert values["concrete_volume_m3"] == round(expected_concrete, 4)
    assert values["formwork_soffit_m2"] == round(expected_surface + 1.0, 4)
    assert values["tread_finish_area_m2"] == 4.0
    assert values["riser_finish_area_m2"] == 1.5
    assert values["balustrade_length_m"] == round(3.0 / math.cos(math.radians(expected_angle)), 4)
    assert values["riser_count"] == 10
    assert values["tread_count"] == 10
    assert values["quantity_status"] == "ready"
    assert reviews == []


def test_ground_bearing_ramp_does_not_invent_soffit_formwork():
    item = _ramp_geometry().items[0]
    values, reviews = stairs_ramps.calculate_stair_ramp_quantities(item, 10.0, {
        "width_mm": 1000,
        "rise_mm": 500,
        "riser_mm": None,
        "tread_mm": None,
        "waist_mm": 150,
        "landing_thickness_mm": None,
        "slope_degrees": None,
        "slope_percent": None,
        "construction_type": "in_situ_concrete",
        "support_condition": "ground_bearing",
        "concrete_profile": "waist_slab",
        "tread_finish_code": None,
        "riser_finish_code": None,
        "string_finish_code": None,
        "ramp_finish_code": "R-FINISH",
    })
    expected_angle = math.degrees(math.atan(0.5 / 5.0))
    expected_surface = 5.0 / math.cos(math.radians(expected_angle))
    assert values["sloping_surface_area_m2"] == round(expected_surface, 4)
    assert values["concrete_volume_m3"] == round(expected_surface * 0.15, 4)
    assert values["formwork_soffit_m2"] == 0.0
    assert values["ramp_finish_area_m2"] == round(expected_surface, 4)
    assert not any(code == "ramp_formwork_basis_unresolved" for code, _ in reviews)


def test_unknown_ramp_slope_and_construction_stay_review_items():
    item = _ramp_geometry().items[0]
    values, reviews = stairs_ramps.calculate_stair_ramp_quantities(item, 10.0, {
        "width_mm": 1000,
        "rise_mm": None,
        "riser_mm": None,
        "tread_mm": None,
        "waist_mm": None,
        "landing_thickness_mm": None,
        "slope_degrees": None,
        "slope_percent": None,
        "construction_type": "unknown",
        "support_condition": "unknown",
        "concrete_profile": "unknown",
        "tread_finish_code": None,
        "riser_finish_code": None,
        "string_finish_code": None,
        "ramp_finish_code": "R-FINISH",
    })
    assert values["sloping_surface_area_m2"] is None
    assert values["concrete_volume_m3"] is None
    assert values["formwork_soffit_m2"] is None
    assert values["ramp_finish_area_m2"] is None
    assert values["quantity_status"] == "needs_review"
    codes = {code for code, _ in reviews}
    assert "ramp_slope_unresolved" in codes
    assert "construction_unresolved" in codes
    assert "ramp_finish_slope_unresolved" in codes


def test_geometry_rejects_points_outside_exact_source_crop():
    geometry = _stair_geometry()
    geometry.items[0].runs[0].centerline[-1].x = 900
    try:
        stairs_ramps._validate_geometry(geometry)
    except RuntimeError as exc:
        assert "outside the source crop" in str(exc)
    else:
        raise AssertionError("out-of-source stair/ramp coordinate should be rejected")
