from __future__ import annotations

from types import SimpleNamespace

from app.core.config import get_settings
from app.modules.takeoff.common import model_for_quality
from app.modules.pre.schemas import ScaleReading
from app.services.ai import model_client
from app.services.ai.model_client import GeminiModelClient, OpenAIModelClient, _gemini_json_schema


def test_structured_model_retries_twice(tmp_path, monkeypatch):
    monkeypatch.setenv("MODEL_RETRIES", "2")
    get_settings.cache_clear()
    image = tmp_path / "crop.png"
    image.write_bytes(b"not-a-real-image-needed-by-the-fake-client")

    class Responses:
        def __init__(self):
            self.calls = 0

        def parse(self, **kwargs):
            self.calls += 1
            if self.calls < 3:
                raise ValueError("schema mismatch")
            return SimpleNamespace(output_parsed=ScaleReading(x_line=None, y_line=None))

    model = OpenAIModelClient.__new__(OpenAIModelClient)
    model.client = SimpleNamespace(responses=Responses())
    model.model = "test-model"

    try:
        result = model.parse_image(image, "read scale", ScaleReading, system="system")
        assert result.x_line is None
        assert model.client.responses.calls == 3
    finally:
        get_settings.cache_clear()


def test_gemini_structured_model_retries_twice(tmp_path, monkeypatch):
    monkeypatch.setenv("MODEL_RETRIES", "2")
    get_settings.cache_clear()
    image = tmp_path / "crop.png"
    image.write_bytes(b"not-a-real-image-needed-by-the-fake-client")

    class Models:
        def __init__(self):
            self.calls = 0

        def generate_content(self, **kwargs):
            self.calls += 1
            if self.calls < 3:
                raise ValueError("schema mismatch")
            return SimpleNamespace(parsed=ScaleReading(x_line=None, y_line=None), text=None)

    model = GeminiModelClient.__new__(GeminiModelClient)
    model.client = SimpleNamespace(models=Models())
    model.model = "test-model"

    try:
        result = model.parse_image(image, "read scale", ScaleReading, system="system")
        assert result.x_line is None
        assert model.client.models.calls == 3
    finally:
        get_settings.cache_clear()


def test_gemini_schema_removes_unsupported_additional_properties():
    schema = _gemini_json_schema(ScaleReading)

    def contains_unsupported(value):
        if isinstance(value, dict):
            return "additionalProperties" in value or any(contains_unsupported(item) for item in value.values())
        if isinstance(value, list):
            return any(contains_unsupported(item) for item in value)
        return False

    assert not contains_unsupported(schema)
    assert schema["type"] == "object"


def test_pre_gemini_provider_selection(monkeypatch):
    sentinel = object()
    monkeypatch.setenv("PRE_AI_PROVIDER", "gemini")
    monkeypatch.setattr(model_client, "GeminiModelClient", lambda: sentinel)
    get_settings.cache_clear()
    try:
        assert model_client.get_model_client("pre") is sentinel
    finally:
        get_settings.cache_clear()


def test_takeoff_openai_provider_selection_is_independent(monkeypatch):
    pre_sentinel = object()
    takeoff_sentinel = object()
    monkeypatch.setenv("PRE_AI_PROVIDER", "gemini")
    monkeypatch.setenv("TAKEOFF_AI_PROVIDER", "openai")
    monkeypatch.setattr(model_client, "GeminiModelClient", lambda: pre_sentinel)
    monkeypatch.setattr(model_client, "OpenAIModelClient", lambda: takeoff_sentinel)
    get_settings.cache_clear()
    try:
        assert model_client.get_model_client("pre") is pre_sentinel
        assert model_client.get_model_client("takeoff") is takeoff_sentinel
    finally:
        get_settings.cache_clear()


def test_takeoff_quality_mapping(monkeypatch):
    monkeypatch.setenv("TAKEOFF_AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-5.6-terra")
    get_settings.cache_clear()
    try:
        assert model_for_quality("easy") == "gpt-5.6-luna"
        assert model_for_quality("medium") == "gpt-5.6-terra"
        assert model_for_quality("expert") == "gpt-5.6-sol"
        assert model_for_quality("maximum") == "gpt-5.6-sol"
    finally:
        get_settings.cache_clear()


def test_gemini_requires_api_key(monkeypatch):
    monkeypatch.setenv("PRE_AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    get_settings.cache_clear()
    try:
        try:
            GeminiModelClient()
        except RuntimeError as error:
            assert "GEMINI_API_KEY" in str(error)
        else:
            raise AssertionError("GeminiModelClient accepted a missing API key")
    finally:
        get_settings.cache_clear()


def test_roof_can_disable_hidden_schema_retries(tmp_path, monkeypatch):
    monkeypatch.setenv("MODEL_RETRIES", "2")
    get_settings.cache_clear()
    image = tmp_path / "crop.png"
    image.write_bytes(b"fake")

    class Responses:
        def __init__(self): self.calls = 0
        def parse(self, **kwargs):
            self.calls += 1
            raise ValueError("schema mismatch")

    model = OpenAIModelClient.__new__(OpenAIModelClient)
    model.client = SimpleNamespace(responses=Responses())
    model.model = "test-model"
    try:
        try:
            model.parse_image(image, "roof", ScaleReading, system="system", max_schema_retries=0)
        except RuntimeError:
            pass
        else:
            raise AssertionError("Roof call unexpectedly succeeded")
        assert model.client.responses.calls == 1
    finally:
        get_settings.cache_clear()
