from __future__ import annotations

import sys
import types

from pydantic import BaseModel

from app.services.ai import codex_account
from app.modules.takeoff import floors
from app.modules.takeoff.model_schemas import FloorCatalogOutput, FloorGeometryOutput


class SmallResult(BaseModel):
    ok: bool


class _FakeConfig:
    def __init__(self, *, env=None, **kwargs):
        self.env = env or {}
        self.kwargs = kwargs


class _FakeLocalImageInput:
    def __init__(self, *, path: str):
        self.path = path


class _FakeTextInput:
    def __init__(self, *, text: str):
        self.text = text


class _FakeSandbox:
    read_only = "read-only"


class _FakeThread:
    def __init__(self, owner):
        self.owner = owner

    def run(self, input_value, **kwargs):
        self.owner.last_input = input_value
        self.owner.last_run_kwargs = kwargs
        return types.SimpleNamespace(final_response='{"ok": true}')


class _FakeCodex:
    instances = []

    def __init__(self, config):
        self.config = config
        self.last_thread_kwargs = None
        self.last_input = None
        self.last_run_kwargs = None
        self.__class__.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def account(self):
        return types.SimpleNamespace(account={"type": "chatgpt"})

    def thread_start(self, **kwargs):
        self.last_thread_kwargs = kwargs
        return _FakeThread(self)


def _install_fake_sdk(monkeypatch):
    module = types.ModuleType("openai_codex")
    module.Codex = _FakeCodex
    module.CodexConfig = _FakeConfig
    module.LocalImageInput = _FakeLocalImageInput
    module.TextInput = _FakeTextInput
    module.Sandbox = _FakeSandbox
    monkeypatch.setitem(sys.modules, "openai_codex", module)
    _FakeCodex.instances.clear()


def test_floor_codex_child_environment_never_inherits_api_keys(monkeypatch, tmp_path):
    _install_fake_sdk(monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "must-not-leak")
    monkeypatch.setenv("CODEX_API_KEY", "must-not-leak-either")
    monkeypatch.setenv("HOME", str(tmp_path))

    image = tmp_path / "floor.png"
    image.write_bytes(b"not-a-real-image-needed-by-fake")
    result = codex_account.CodexAccountModelClient().parse_image(
        image,
        "Detect the floor",
        SmallResult,
        system="Floor system",
        quality="expert",
    )

    assert result.ok is True
    instance = _FakeCodex.instances[-1]
    assert "OPENAI_API_KEY" not in instance.config.env
    assert "CODEX_API_KEY" not in instance.config.env
    assert instance.config.env["HOME"] == str(tmp_path)
    assert instance.last_thread_kwargs["ephemeral"] is True
    assert instance.last_thread_kwargs["sandbox"] == _FakeSandbox.read_only
    assert instance.last_run_kwargs["effort"] == "high"
    assert instance.last_run_kwargs["output_schema"] == codex_account._codex_output_schema(SmallResult)
    assert any(isinstance(item, _FakeLocalImageInput) for item in instance.last_input)


def test_codex_output_schema_requires_every_nested_property():
    schema = codex_account._codex_output_schema(FloorGeometryOutput)

    def assert_strict_objects(value):
        if isinstance(value, list):
            for item in value:
                assert_strict_objects(item)
            return
        if not isinstance(value, dict):
            return
        properties = value.get("properties")
        if isinstance(properties, dict):
            assert value.get("required") == list(properties)
            assert value.get("additionalProperties") is False
        assert "default" not in value
        for item in value.values():
            assert_strict_objects(item)

    assert_strict_objects(schema)


def test_floor_raw_detection_cache_round_trips_without_model(monkeypatch, tmp_path):
    monkeypatch.setattr(floors, "project_root", lambda _project_id: tmp_path)
    geometry = FloorGeometryOutput.model_validate({
        "source_width_px": 100,
        "source_height_px": 100,
        "spaces": [{
            "raw_label": "BED",
            "name": "Bedroom",
            "normalized_type": "bedroom",
            "environment": "internal",
            "polygon": [
                {"x": 0, "y": 0}, {"x": 100, "y": 0},
                {"x": 100, "y": 100}, {"x": 0, "y": 100},
            ],
            "holes": [],
            "functional_zones": [],
            "evidence": [],
            "geometry_confidence": 0.95,
            "semantic_confidence": 0.95,
        }],
    })
    catalog = FloorCatalogOutput()

    floors._save_cached_detection("p1", "f1", "source-1", "medium", geometry, catalog)
    cached = floors._load_cached_detection("p1", "f1", "source-1")

    assert cached is not None
    cached_geometry, cached_catalog = cached
    assert cached_geometry.spaces[0].normalized_type == "bedroom"
    assert cached_catalog.finish_definitions == []
    assert floors._load_cached_detection("p1", "f1", "different-source") is None


def test_floor_viewport_cache_reuses_only_equal_or_better_quality(monkeypatch, tmp_path):
    monkeypatch.setattr(floors, "project_root", lambda _project_id: tmp_path)
    geometry = FloorGeometryOutput.model_validate({
        "source_width_px": 100, "source_height_px": 100,
        "spaces": [{
            "raw_label": "BED", "name": "Bedroom", "normalized_type": "bedroom",
            "environment": "internal",
            "polygon": [
                {"x": 0, "y": 0}, {"x": 100, "y": 0},
                {"x": 100, "y": 100}, {"x": 0, "y": 100},
            ],
            "holes": [], "functional_zones": [], "evidence": [],
            "geometry_confidence": 0.95, "semantic_confidence": 0.95,
        }],
    })
    ctx = {"viewport_id": "v1", "name": "SECOND FLOOR"}
    floors._save_viewport_detection("p1", ctx, "viewport-source", "expert", geometry, FloorCatalogOutput())

    shared = floors._load_viewport_detection("p1", "v1", "viewport-source", "expert")
    assert shared is not None
    assert shared[2] == "SECOND FLOOR"
    assert floors._load_viewport_detection("p1", "v1", "viewport-source", "maximum") is None
    assert floors._load_viewport_detection("p1", "v1", "wrong-source", "medium") is None


def test_floor_room_label_audit_flags_named_room_outside_detected_spaces():
    geometry = FloorGeometryOutput.model_validate({
        "source_width_px": 200,
        "source_height_px": 100,
        "spaces": [{
            "raw_label": "BED",
            "name": "Bedroom",
            "normalized_type": "bedroom",
            "environment": "internal",
            "polygon": [
                {"x": 0, "y": 0}, {"x": 90, "y": 0},
                {"x": 90, "y": 100}, {"x": 0, "y": 100},
            ],
            "holes": [],
            "functional_zones": [],
            "evidence": [],
            "geometry_confidence": 0.95,
            "semantic_confidence": 0.95,
        }, {
            "raw_label": "LIVING",
            "name": "Living room",
            "normalized_type": "living",
            "environment": "internal",
            "polygon": [
                {"x": 100, "y": 0}, {"x": 200, "y": 0},
                {"x": 200, "y": 100}, {"x": 100, "y": 100},
            ],
            "holes": [],
            "functional_zones": [],
            "evidence": [],
            "geometry_confidence": 0.95,
            "semantic_confidence": 0.95,
        }],
    })
    words = [
        {"text": "BED", "bbox": [20, 20, 40, 35]},
        {"text": "TOI.", "bbox": [140, 20, 165, 35]},
        {"text": "NOTE", "bbox": [150, 60, 180, 75]},
    ]

    assert floors._audit_room_label_coverage(geometry, words) == [
        "TOI. near (152, 28) must be inside a matching toilet/bath/wc/washroom space"
    ]


def test_floor_room_label_audit_accepts_matching_room_type():
    geometry = FloorGeometryOutput.model_validate({
        "source_width_px": 100,
        "source_height_px": 100,
        "spaces": [{
            "raw_label": "TOI.",
            "name": "West Bathroom",
            "normalized_type": "toilet",
            "environment": "internal",
            "polygon": [
                {"x": 0, "y": 0}, {"x": 100, "y": 0},
                {"x": 100, "y": 100}, {"x": 0, "y": 100},
            ],
            "holes": [],
            "functional_zones": [],
            "evidence": [],
            "geometry_confidence": 0.95,
            "semantic_confidence": 0.95,
        }],
    })

    assert floors._audit_room_label_coverage(
        geometry, [{"text": "TOI.", "bbox": [35, 35, 55, 50]}]
    ) == []


def test_floor_non_floor_regions_become_deterministic_holes():
    geometry = FloorGeometryOutput.model_validate({
        "source_width_px": 100,
        "source_height_px": 100,
        "spaces": [{
            "raw_label": "LOBBY", "name": "Lift lobby", "normalized_type": "lobby",
            "environment": "internal",
            "polygon": [
                {"x": 0, "y": 0}, {"x": 100, "y": 0},
                {"x": 100, "y": 100}, {"x": 0, "y": 100},
            ],
            "holes": [], "functional_zones": [], "evidence": [],
            "geometry_confidence": 0.9, "semantic_confidence": 0.9,
        }],
        "non_floor_regions": [{
            "name": "Lift shaft", "classification": "shaft",
            "polygon": [
                {"x": 40, "y": 40}, {"x": 60, "y": 40},
                {"x": 60, "y": 60}, {"x": 40, "y": 60},
            ],
            "evidence": [], "confidence": 0.95,
        }],
    })

    floors._subtract_non_floor_regions(geometry)
    floors._validate_floor_geometry(geometry)

    assert len(geometry.spaces) == 1
    assert len(geometry.spaces[0].holes) == 1
    assert floors._shape(
        [{"x": point.x, "y": point.y} for point in geometry.spaces[0].polygon],
        [[{"x": point.x, "y": point.y} for point in ring] for ring in geometry.spaces[0].holes],
    ).area == 9600
