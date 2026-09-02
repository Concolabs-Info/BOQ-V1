from __future__ import annotations

from app.modules.takeoff import roofs
from app.modules.takeoff.model_schemas import RoofGeometryOutput, RoofSystemResolutionOutput


def _geometry() -> RoofGeometryOutput:
    return RoofGeometryOutput.model_validate({
        "schema_version": "roof-detection-v1",
        "source_width_px": 400,
        "source_height_px": 300,
        "roof_regions": [{
            "roof_id": "RF-01",
            "name": "Main roof",
            "roof_type": "flat",
            "outer_boundary": [
                {"x": 10, "y": 10}, {"x": 390, "y": 10},
                {"x": 390, "y": 290}, {"x": 10, "y": 290},
            ],
            "planes": [{
                "plane_id": "P-01",
                "name": "Main plane",
                "surface_type": "flat",
                "polygon": [
                    {"x": 10, "y": 10}, {"x": 390, "y": 10},
                    {"x": 390, "y": 290}, {"x": 10, "y": 290},
                ],
                "pitch": None,
                "slope_direction": None,
                "material_evidence": [],
                "confidence": 0.95,
            }],
            "edges": [],
            "openings": [],
            "drainage": [],
            "confidence": 0.95,
        }],
    })


def test_roof_raw_geometry_cache_round_trips_without_model(monkeypatch, tmp_path):
    monkeypatch.setattr(roofs, "project_root", lambda _project_id: tmp_path)
    geometry = _geometry()

    roofs._save_geometry_cache("p1", "r1", "source-1", "expert", geometry)
    cached = roofs._load_geometry_cache("p1", "r1", "source-1")

    assert cached is not None
    assert cached.roof_regions[0].planes[0].plane_id == "P-01"
    assert roofs._load_geometry_cache("p1", "r1", "source-2") is None


def test_roof_system_cache_is_independent_from_geometry_force(monkeypatch, tmp_path):
    monkeypatch.setattr(roofs, "project_root", lambda _project_id: tmp_path)
    systems = RoofSystemResolutionOutput()

    roofs._save_systems_cache("p1", "systems-1", "medium", systems)
    cached = roofs._load_systems_cache("p1", "systems-1")

    assert cached is not None
    assert cached.system_definitions == []
    assert roofs._load_systems_cache("p1", "systems-2") is None


def test_roof_cache_records_account_provider(monkeypatch, tmp_path):
    monkeypatch.setattr(roofs, "project_root", lambda _project_id: tmp_path)
    roofs._save_geometry_cache("p1", "r1", "source-1", "maximum", _geometry())

    payload = roofs._read_json(roofs._roof_result_path("p1", "r1"), {})
    assert payload["provider"] == "codex-account"
    assert payload["schema_version"] == roofs.ROOF_CACHE_VERSION
