from __future__ import annotations

import math

from app.modules.takeoff import columns
from app.modules.takeoff.model_schemas import ColumnCatalogOutput, ColumnGeometryOutput, ColumnVerticalOutput


def _geometry() -> ColumnGeometryOutput:
    return ColumnGeometryOutput.model_validate({
        "schema_version": "column-detection-v1",
        "source_width_px": 1000,
        "source_height_px": 800,
        "level_label": "Ground Floor",
        "columns": [
            {
                "column_id": "COL-LOC-01",
                "center": {"x": 220, "y": 180},
                "bbox": [200, 150, 40, 60],
                "footprint": [
                    {"x": 200, "y": 150}, {"x": 240, "y": 150},
                    {"x": 240, "y": 210}, {"x": 200, "y": 210},
                ],
                "mark": "C1",
                "shape": "rectangular",
                "section_width_px": 40,
                "section_depth_px": 60,
                "spans_full_storey": True,
                "construction_hint": "RCC column",
                "evidence": [],
                "confidence": 0.97,
            }
        ],
    })


def test_column_geometry_cache_round_trips_and_reuses_same_source(monkeypatch, tmp_path):
    monkeypatch.setattr(columns, "project_root", lambda _project_id: tmp_path)
    geometry = _geometry()
    columns._save_geometry_cache("p1", "floor-ground", "vp-ground", "same-source", "expert", geometry)
    cached = columns._load_geometry_cache("p1", "floor-typical", "vp-typical", "same-source")
    assert cached is not None
    assert cached.columns[0].mark == "C1"
    payload = columns._read_json(columns._result_path("p1", "floor-ground", "vp-ground"), {})
    assert payload["provider"] == "codex-account"
    assert columns._load_geometry_cache("p1", "floor-ground", "vp-ground", "changed-source") is None


def test_column_catalog_and_vertical_caches_invalidate_independently(monkeypatch, tmp_path):
    monkeypatch.setattr(columns, "project_root", lambda _project_id: tmp_path)
    columns._save_catalog_cache("p1", "catalog-1", "medium", ColumnCatalogOutput())
    columns._save_vertical_cache("p1", "section-a", "vertical-1", "medium", ColumnVerticalOutput())
    assert columns._load_catalog_cache("p1", "catalog-1") is not None
    assert columns._load_catalog_cache("p1", "catalog-2") is None
    assert columns._load_vertical_cache("p1", "section-a", "vertical-1") is not None
    assert columns._load_vertical_cache("p1", "section-a", "vertical-2") is None


def test_column_geometry_rejects_out_of_source_bbox():
    geometry = _geometry()
    geometry.columns[0].bbox = [980, 150, 40, 60]
    try:
        columns._validate_geometry(geometry)
    except RuntimeError as exc:
        assert "outside source image" in str(exc)
    else:
        raise AssertionError("out-of-source column bbox should be rejected")


def test_rectangular_column_section_quantities_are_deterministic():
    area = columns._section_area_m2("rectangular", 300, 500, None)
    perimeter = columns._section_perimeter_m("rectangular", 300, 500, None)
    assert area == 0.15
    assert perimeter == 1.6
    assert round(area * 3.0, 3) == 0.45
    assert round(perimeter * 3.0, 3) == 4.8


def test_circular_column_section_quantities_are_deterministic():
    area = columns._section_area_m2("circular", None, None, 400)
    perimeter = columns._section_perimeter_m("circular", None, None, 400)
    assert area == math.pi * 0.2**2
    assert perimeter == math.pi * 0.4


def test_storey_height_fallback_requires_explicit_full_storey(monkeypatch):
    monkeypatch.setattr(columns, "fetch_one", lambda *args, **kwargs: {"height_mm": 3200})
    item = _geometry().columns[0]
    item.height_mm_visible = None
    item.spans_full_storey = False
    assert columns._height_for(item, None, {"storey_id": "s1"}, []) == (None, "unresolved")
    item.spans_full_storey = None
    assert columns._height_for(item, None, {"storey_id": "s1"}, []) == (None, "unresolved")
    item.spans_full_storey = True
    assert columns._height_for(item, None, {"storey_id": "s1"}, []) == (3200.0, "confirmed_storey_height")


def test_generic_unmapped_vertical_detail_is_not_broadcast_to_every_column():
    output = ColumnVerticalOutput.model_validate({
        "observations": [{
            "observation_type": "height",
            "height_mm": 3600,
            "source_text": "Generic typical column detail",
            "confidence": 0.99,
        }]
    })
    item = _geometry().columns[0]
    assert columns._vertical_for(item, {"storey_id": None}, [output]) == []


def test_reinforcement_only_quantifies_explicit_supported_basis():
    concrete_volume = 0.45
    assert columns._resolved_reinforcement_kg({"reinforcement_rate_kg_per_m3": 120}, [], concrete_volume) == (54.0, "explicit_kg_per_m3")
    assert columns._resolved_reinforcement_kg({"reinforcement_description": "8T20 + R10 links"}, [], concrete_volume) == (None, "information_required")


def test_concrete_classification_does_not_assume_unknown_rectangular_column():
    item = _geometry().columns[0]
    item.construction_hint = None
    assert columns._is_concrete_column(item, {"material": None, "concrete_grade": None, "description": "Column C1", "name": "C1"}, []) is False
    assert columns._is_concrete_column(item, {"material": "reinforced concrete", "concrete_grade": "C30", "description": "C1", "name": "C1"}, []) is True


def test_polygonal_column_uses_exact_scaled_footprint_not_bbox_rectangle():
    item = _geometry().columns[0]
    item.shape = "polygonal"
    item.footprint = [
        {"x": 200, "y": 150}, {"x": 240, "y": 150}, {"x": 240, "y": 170},
        {"x": 220, "y": 170}, {"x": 220, "y": 210}, {"x": 200, "y": 210},
    ]
    area, perimeter = columns._polygon_section_metrics(item, 5.0)
    assert area == 0.04
    assert perimeter == 1.0
    assert columns._section_area_m2("polygonal", 200, 300, None) is None
    assert columns._section_perimeter_m("polygonal", 200, 300, None) is None
