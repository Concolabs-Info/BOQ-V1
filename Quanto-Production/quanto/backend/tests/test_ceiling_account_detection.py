from __future__ import annotations

from app.modules.takeoff import ceilings
from app.modules.takeoff.model_schemas import CeilingCatalogOutput, CeilingGeometryOutput, SectionObservationOutput


def _geometry() -> CeilingGeometryOutput:
    return CeilingGeometryOutput.model_validate({
        "source_width_px": 200,
        "source_height_px": 100,
        "zones": [{
            "name": "Living ceiling",
            "room_labels": ["Living"],
            "polygon": [
                {"x": 0, "y": 0}, {"x": 200, "y": 0},
                {"x": 200, "y": 100}, {"x": 0, "y": 100},
            ],
            "holes": [],
            "special_type": "flat",
            "evidence": [],
            "confidence": 0.95,
        }],
    })


def test_ceiling_raw_rcp_cache_round_trips_without_model(monkeypatch, tmp_path):
    monkeypatch.setattr(ceilings, "project_root", lambda _project_id: tmp_path)
    geometry = _geometry()

    ceilings._save_rcp_cache("p1", "f1", "source-1", "medium", geometry)
    cached = ceilings._load_rcp_cache("p1", "f1", "source-1")

    assert cached is not None
    assert cached.zones[0].special_type == "flat"
    assert ceilings._load_rcp_cache("p1", "f1", "different-source") is None


def test_ceiling_catalog_cache_is_project_scoped(monkeypatch, tmp_path):
    monkeypatch.setattr(ceilings, "project_root", lambda _project_id: tmp_path)
    catalog = CeilingCatalogOutput()

    ceilings._save_catalog_cache("p1", "catalog-1", "expert", catalog)

    cached = ceilings._load_catalog_cache("p1", "catalog-1")
    assert cached is not None
    assert cached.definitions == []
    assert ceilings._load_catalog_cache("p1", "catalog-2") is None


def test_ceiling_section_cache_invalidates_when_source_changes(monkeypatch, tmp_path):
    monkeypatch.setattr(ceilings, "project_root", lambda _project_id: tmp_path)
    output = SectionObservationOutput.model_validate({
        "observations": [{
            "level_label": "First Floor",
            "room_label": "Living",
            "observation_type": "sloped_ceiling",
            "height_text": "2700-3300",
            "evidence": [],
            "confidence": 0.9,
        }],
    })

    ceilings._save_section_cache("p1", "v1", "section-source-1", "medium", output)

    cached = ceilings._load_section_cache("p1", "v1", "section-source-1")
    assert cached is not None
    assert cached.observations[0].observation_type == "sloped_ceiling"
    assert ceilings._load_section_cache("p1", "v1", "section-source-2") is None
