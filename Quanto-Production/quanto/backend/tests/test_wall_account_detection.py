from __future__ import annotations

from app.modules.takeoff import walls
from app.modules.takeoff.model_schemas import WallCatalogOutput, WallGeometryOutput, WallVerticalOutput


def _geometry() -> WallGeometryOutput:
    return WallGeometryOutput.model_validate({
        "schema_version": "wall-detection-v1",
        "source_width_px": 500,
        "source_height_px": 400,
        "floor_label": "Ground Floor",
        "walls": [{
            "wall_id": "W-RUN-01",
            "centerline": [{"x": 10, "y": 20}, {"x": 250, "y": 20}, {"x": 250, "y": 180}],
            "wall_mark": "W1",
            "wall_kind": "external_wall",
            "classification": "external",
            "thickness_px": 10,
            "evidence": [],
            "confidence": 0.96,
        }],
        "opening_candidates": [{
            "opening_id": "D-01",
            "center": {"x": 120, "y": 20},
            "opening_type": "door",
            "tag": "D1",
            "width_px": 45,
            "evidence": [],
            "confidence": 0.9,
        }],
    })


def test_wall_raw_geometry_cache_round_trips(monkeypatch, tmp_path):
    monkeypatch.setattr(walls, "project_root", lambda _project_id: tmp_path)
    geometry = _geometry()
    walls._save_geometry_cache("p1", "f1", "source-1", "expert", geometry)
    cached = walls._load_geometry_cache("p1", "f1", "source-1")
    assert cached is not None
    assert cached.walls[0].wall_mark == "W1"
    assert walls._load_geometry_cache("p1", "f1", "source-2") is None
    payload = walls._read_json(walls._result_path("p1", "f1"), {})
    assert payload["provider"] == "codex-account"


def test_wall_catalog_and_vertical_caches_invalidate_independently(monkeypatch, tmp_path):
    monkeypatch.setattr(walls, "project_root", lambda _project_id: tmp_path)
    catalog = WallCatalogOutput()
    vertical = WallVerticalOutput()
    walls._save_catalog_cache("p1", "catalog-1", "medium", catalog)
    walls._save_vertical_cache("p1", "vp-section", "vertical-1", "medium", vertical)
    assert walls._load_catalog_cache("p1", "catalog-1") is not None
    assert walls._load_catalog_cache("p1", "catalog-2") is None
    assert walls._load_vertical_cache("p1", "vp-section", "vertical-1") is not None
    assert walls._load_vertical_cache("p1", "vp-section", "vertical-2") is None


def test_wall_polyline_flattens_without_breaking_for_opening():
    geometry = _geometry()
    segments = walls._flatten_walls(geometry)
    assert len(segments) == 2
    assert segments[0]["parent_key"] == "W-RUN-01"
    assert segments[0]["end"] == segments[1]["start"]
    # The opening remains separate evidence; it does not split the host centreline.
    assert len(geometry.opening_candidates) == 1
    assert geometry.opening_candidates[0].tag == "D1"


def test_wall_geometry_rejects_out_of_source_coordinates():
    geometry = _geometry()
    geometry.walls[0].centerline[-1].x = 900
    try:
        walls._validate_geometry(geometry)
    except RuntimeError as exc:
        assert "outside the exact source crop" in str(exc)
    else:
        raise AssertionError("out-of-source wall coordinate should be rejected")


def test_wall_pieces_join_only_when_opening_bridges_gap():
    geometry = WallGeometryOutput.model_validate({
        "schema_version": "wall-detection-v1",
        "source_width_px": 400,
        "source_height_px": 200,
        "floor_label": "Ground Floor",
        "walls": [
            {"wall_id": "A", "centerline": [{"x": 10, "y": 50}, {"x": 100, "y": 50}], "wall_kind": "partition", "classification": "internal", "evidence": [], "confidence": 0.95},
            {"wall_id": "B", "centerline": [{"x": 140, "y": 50}, {"x": 260, "y": 50}], "wall_kind": "partition", "classification": "internal", "evidence": [], "confidence": 0.94},
        ],
        "opening_candidates": [{"opening_id": "D1", "center": {"x": 120, "y": 50}, "opening_type": "door", "evidence": [], "confidence": 0.9}],
    })
    merged = walls._merge_opening_gaps(walls._flatten_walls(geometry), geometry, 5.0)
    assert len(merged) == 1
    assert merged[0]["start"] == {"x": 10.0, "y": 50.0}
    assert merged[0]["end"] == {"x": 260.0, "y": 50.0}

    no_opening = geometry.model_copy(deep=True)
    no_opening.opening_candidates = []
    assert len(walls._merge_opening_gaps(walls._flatten_walls(no_opening), no_opening, 5.0)) == 2


def test_unknown_wall_never_inherits_storey_height(monkeypatch):
    monkeypatch.setattr(walls, "fetch_one", lambda *_args, **_kwargs: {"height_mm": 3200})
    segment = {"wall_kind": "unknown", "wall_mark": None}
    definition = {"height_mm": None}
    height, source = walls._height_for(segment, definition, {"storey_id": "00000000-0000-0000-0000-000000000001", "name": "Ground"}, [])
    assert height is None
    assert source == "unresolved"

    full_height = {"wall_kind": "full_height", "wall_mark": None}
    height, source = walls._height_for(full_height, definition, {"storey_id": "00000000-0000-0000-0000-000000000001", "name": "Ground"}, [])
    assert height == 3200
    assert source == "confirmed_storey_height"


def test_wall_finish_rule_preserves_multiple_layers():
    catalog = WallCatalogOutput.model_validate({
        "finish_rules": [{
            "room_types": ["Bathroom"],
            "finish_codes": ["PLASTER", "PAINT"],
            "side_scope": "room_face",
            "source_text": "Bathroom walls: plaster and paint",
            "confidence": 0.97,
        }]
    })
    finish_rows = {
        "plaster": {"id": "1", "code": "PLASTER"},
        "paint": {"id": "2", "code": "PAINT"},
        "unassigned wf": {"id": "0", "code": "UNASSIGNED-WF"},
    }
    resolved = walls._resolve_finishes("Bathroom 01", False, catalog, finish_rows)
    assert [item[0]["code"] for item in resolved] == ["PLASTER", "PAINT"]


def test_wall_geometry_cache_reuses_same_source_across_repeated_storeys(monkeypatch, tmp_path):
    monkeypatch.setattr(walls, "project_root", lambda _project_id: tmp_path)
    walls._save_geometry_cache("p1", "floor-ground", "same-wall-source", "expert", _geometry())
    cached = walls._load_geometry_cache("p1", "floor-typical", "same-wall-source")
    assert cached is not None
    assert cached.walls[0].wall_id == "W-RUN-01"


def test_in_situ_concrete_wall_detection_does_not_misclassify_concrete_block_masonry():
    assert walls._is_in_situ_concrete_definition({"wall_kind": "concrete", "name": "RC wall"}) is True
    assert walls._is_in_situ_concrete_definition({"wall_kind": "retaining_wall", "material": "reinforced concrete"}) is True
    assert walls._is_in_situ_concrete_definition({"wall_kind": "masonry", "material": "concrete blockwork"}) is False
