from __future__ import annotations

from app.modules.takeoff import floor_wall_geometry as wall_geometry
from app.modules.takeoff.model_schemas import FloorGeometryOutput


def _output(points: list[dict[str, int]]) -> FloorGeometryOutput:
    return FloorGeometryOutput.model_validate({
        "source_width_px": 160,
        "source_height_px": 160,
        "spaces": [{
            "name": "Bedroom",
            "normalized_type": "bedroom",
            "environment": "internal",
            "polygon": points,
            "geometry_confidence": .9,
            "semantic_confidence": .9,
        }],
    })


def _vectors() -> dict[str, object]:
    segments = []
    for y in (10, 14, 110, 114):
        segments.append({"x0": 10, "y0": y, "x1": 114, "y1": y, "dashed": False})
    for x in (10, 14, 110, 114):
        segments.append({"x0": x, "y0": 10, "x1": x, "y1": 114, "dashed": False})
    return {"segments": segments}


def test_wall_audit_snaps_nearby_edges_to_one_supported_vector_face(monkeypatch):
    monkeypatch.setattr(wall_geometry, "viewport_vector_segments", lambda *_args, **_kwargs: _vectors())
    wall_geometry._axis_segments.cache_clear()
    wall_geometry._wall_union.cache_clear()
    output = _output([
        {"x": 17, "y": 16}, {"x": 108, "y": 16},
        {"x": 108, "y": 108}, {"x": 17, "y": 108},
    ])

    audits = wall_geometry.audit_and_snap_floor_spaces(output, "viewport-test")

    assert audits[0]["status"] == "wall_verified"
    assert audits[0]["support_ratio"] == 1
    assert audits[0]["snapped_edges"] == 4
    assert [(point.x, point.y) for point in output.spaces[0].polygon] == [
        (14, 14), (110, 14), (110, 110), (14, 110),
    ]


def test_wall_audit_keeps_unsupported_room_visible_but_marks_review(monkeypatch):
    monkeypatch.setattr(wall_geometry, "viewport_vector_segments", lambda *_args, **_kwargs: _vectors())
    wall_geometry._axis_segments.cache_clear()
    wall_geometry._wall_union.cache_clear()
    output = _output([
        {"x": 35, "y": 35}, {"x": 85, "y": 35},
        {"x": 85, "y": 85}, {"x": 35, "y": 85},
    ])

    audits = wall_geometry.audit_and_snap_floor_spaces(output, "viewport-unsupported")

    assert audits[0]["status"] == "boundary_review"
    assert audits[0]["support_ratio"] == 0
    assert wall_geometry.wall_audit_failures(audits)

