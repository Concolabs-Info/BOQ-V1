from __future__ import annotations

from app.modules.takeoff import doors_windows
from app.modules.takeoff.model_schemas import OpeningCatalogOutput, OpeningDetailOutput, OpeningGeometryOutput


def _geometry() -> OpeningGeometryOutput:
    return OpeningGeometryOutput.model_validate({
        "schema_version": "opening-detection-v1",
        "source_width_px": 800,
        "source_height_px": 600,
        "level_label": "Ground Floor",
        "openings": [
            {
                "opening_id": "D-LOC-01",
                "kind": "door",
                "center": {"x": 220, "y": 180},
                "bbox": [195, 160, 50, 40],
                "tag": "D1",
                "visible_width_px": 45,
                "operation_hint": "single swing",
                "evidence": [],
                "confidence": 0.97,
            },
            {
                "opening_id": "W-LOC-01",
                "kind": "window",
                "center": {"x": 520, "y": 210},
                "bbox": [495, 196, 50, 28],
                "tag": "W2",
                "visible_width_px": 48,
                "evidence": [],
                "confidence": 0.94,
            },
        ],
    })


def test_opening_geometry_cache_round_trips_and_reuses_same_source(monkeypatch, tmp_path):
    monkeypatch.setattr(doors_windows, "project_root", lambda _project_id: tmp_path)
    geometry = _geometry()
    doors_windows._save_geometry_cache("p1", "floor-ground", "vp-ground", "same-source", "expert", geometry)
    cached = doors_windows._load_geometry_cache("p1", "floor-typical", "vp-typical", "same-source")
    assert cached is not None
    assert [item.tag for item in cached.openings] == ["D1", "W2"]
    payload = doors_windows._read_json(doors_windows._result_path("p1", "floor-ground", "vp-ground"), {})
    assert payload["provider"] == "codex-account"
    assert doors_windows._load_geometry_cache("p1", "floor-ground", "vp-ground", "changed-source") is None


def test_opening_catalog_and_detail_caches_invalidate_independently(monkeypatch, tmp_path):
    monkeypatch.setattr(doors_windows, "project_root", lambda _project_id: tmp_path)
    doors_windows._save_catalog_cache("p1", "catalog-1", "medium", OpeningCatalogOutput())
    doors_windows._save_detail_cache("p1", "schedule-vp", "detail-1", "medium", OpeningDetailOutput())
    assert doors_windows._load_catalog_cache("p1", "catalog-1") is not None
    assert doors_windows._load_catalog_cache("p1", "catalog-2") is None
    assert doors_windows._load_detail_cache("p1", "schedule-vp", "detail-1") is not None
    assert doors_windows._load_detail_cache("p1", "schedule-vp", "detail-2") is None


def test_opening_geometry_rejects_out_of_source_bbox():
    geometry = _geometry()
    geometry.openings[0].bbox = [790, 160, 50, 40]
    try:
        doors_windows._validate_geometry(geometry)
    except RuntimeError as exc:
        assert "outside source image" in str(exc)
    else:
        raise AssertionError("out-of-source opening bbox should be rejected")


def test_opening_metrics_require_both_dimensions_and_use_correct_frame_perimeter():
    assert doors_windows._opening_metrics(900, None, "door") == (None, None)
    door_area, door_frame = doors_windows._opening_metrics(900, 2100, "door")
    window_area, window_frame = doors_windows._opening_metrics(1200, 1500, "window")
    assert door_area == 1.89
    assert door_frame == 5.1  # head + two jambs, no threshold
    assert window_area == 1.8
    assert window_frame == 5.4  # four sides


def test_detail_evidence_only_enriches_exact_matching_schedule_code():
    catalog = OpeningCatalogOutput.model_validate({
        "definitions": [{
            "code": "D1",
            "kind": "door",
            "name": "Door D1",
            "width_mm": 900,
            "height_mm": 2100,
            "source_text": "Door schedule D1 900x2100",
            "confidence": 0.95,
        }]
    })
    detail = OpeningDetailOutput.model_validate({
        "observations": [
            {
                "code": "D1",
                "kind": "door",
                "observation_type": "frame",
                "frame_material": "Powder-coated aluminium",
                "fire_rating": "FD30",
                "evidence": [],
                "confidence": 0.92,
            },
            {
                "code": "D9",
                "kind": "door",
                "observation_type": "frame",
                "frame_material": "Timber",
                "evidence": [],
                "confidence": 0.99,
            },
        ]
    })
    result = doors_windows._definition_payloads(catalog, [detail])
    assert len(result) == 1
    assert result[0]["code"] == "D1"
    assert result[0]["frame_material"] == "Powder-coated aluminium"
    assert result[0]["fire_rating"] == "FD30"


def test_only_supported_opening_area_is_deductible():
    resolved, _ = doors_windows._opening_metrics(900, 2100, "door")
    unresolved, _ = doors_windows._opening_metrics(900, None, "door")
    small, _ = doors_windows._opening_metrics(400, 1000, "window")
    assert resolved is not None and resolved > 0.5
    assert unresolved is None
    assert small is not None and small <= 0.5
