from __future__ import annotations

import base64
from pathlib import Path
from typing import Literal, TypeVar

from pydantic import BaseModel

from ...core.config import get_settings
from ...modules.pre.schemas import (
    Box,
    HeightReading,
    ScaleReading,
    SpecReading,
    TitleBlock,
    TriageOutput,
    ViewportDiscipline,
    ViewportProposal,
    ViewportViewKind,
)

T = TypeVar("T", bound=BaseModel)


def _gemini_json_schema(schema: type[BaseModel]) -> dict:
    """Return the Pydantic schema using only Gemini-supported JSON Schema fields.

    Strict Pydantic models emit ``additionalProperties: false`` at every object
    level. Gemini's structured-output endpoint rejects that keyword before the
    model runs, so strictness is enforced after the response by Pydantic instead.
    """

    def clean(value):
        if isinstance(value, dict):
            return {key: clean(item) for key, item in value.items() if key != "additionalProperties"}
        if isinstance(value, list):
            return [clean(item) for item in value]
        return value

    return clean(schema.model_json_schema())


class ModelClient:
    def parse_image(self, image_path: Path, prompt: str, schema: type[T], *, system: str, model: str | None = None, max_schema_retries: int | None = None) -> T:
        raise NotImplementedError

    def parse_text(self, prompt: str, schema: type[T], *, system: str, model: str | None = None, max_schema_retries: int | None = None) -> T:
        raise NotImplementedError


class OpenAIModelClient(ModelClient):
    def __init__(self) -> None:
        from openai import OpenAI

        settings = get_settings()
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required when the selected AI provider is openai")
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model
        if not self.model:
            raise RuntimeError("OPENAI_MODEL is required when the selected AI provider is openai")

    def parse_image(self, image_path: Path, prompt: str, schema: type[T], *, system: str, model: str | None = None, max_schema_retries: int | None = None) -> T:
        mime = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
        encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
        settings = get_settings()
        working_prompt = prompt
        last_error: Exception | None = None

        retry_count = settings.model_retries if max_schema_retries is None else max(0, max_schema_retries)
        # Most Pre/Takeoff calls use the configured schema retry policy. Roof geometry
        # explicitly passes zero here so its separate targeted repair remains the only
        # second visual call allowed by the Roof plan.
        for attempt in range(retry_count + 1):
            try:
                response = self.client.responses.parse(
                    model=model or self.model,
                    input=[
                        {"role": "system", "content": system},
                        {
                            "role": "user",
                            "content": [
                                {"type": "input_text", "text": working_prompt},
                                {
                                    "type": "input_image",
                                    "image_url": f"data:{mime};base64,{encoded}",
                                    "detail": "auto",
                                },
                            ],
                        },
                    ],
                    text_format=schema,
                )
                if response.output_parsed is None:
                    raise RuntimeError("Model returned no parsed structured output")
                return response.output_parsed
            except Exception as exc:  # noqa: BLE001 - provider and schema errors use one bounded retry policy
                last_error = exc
                if attempt >= retry_count:
                    break
                message = str(exc).replace("\n", " ")[:500]
                working_prompt = (
                    f"{prompt}\n\nYour previous response could not be accepted by the required schema: {message}. "
                    "Review every required field and enum, then return one corrected structured response only."
                )

        raise RuntimeError(
            f"Model output failed schema validation after {retry_count + 1} attempts"
        ) from last_error

    def parse_text(self, prompt: str, schema: type[T], *, system: str, model: str | None = None, max_schema_retries: int | None = None) -> T:
        settings = get_settings()
        last_error: Exception | None = None
        working_prompt = prompt
        retry_count = settings.model_retries if max_schema_retries is None else max(0, max_schema_retries)
        for attempt in range(retry_count + 1):
            try:
                response = self.client.responses.parse(
                    model=model or self.model,
                    input=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": working_prompt},
                    ],
                    text_format=schema,
                )
                if response.output_parsed is None:
                    raise RuntimeError("Model returned no parsed structured output")
                return response.output_parsed
            except Exception as exc:
                last_error = exc
                if attempt >= retry_count:
                    break
                working_prompt = f"{prompt}\n\nRepair the structured response to match the required schema exactly. Previous error: {str(exc)[:500]}"
        raise RuntimeError(f"Model output failed schema validation after {retry_count + 1} attempts") from last_error




def _gemini_types():
    """Import Gemini request types lazily; tests can exercise retry logic without the optional SDK."""
    try:
        from google.genai import types
        return types
    except (ModuleNotFoundError, ImportError):  # dependency-light unit tests only
        class _Part:
            @staticmethod
            def from_bytes(*, data: bytes, mime_type: str):
                return {"data": data, "mime_type": mime_type}
        class _GenerateContentConfig:
            def __init__(self, **kwargs):
                self.kwargs = kwargs
        class _Types:
            Part = _Part
            GenerateContentConfig = _GenerateContentConfig
        return _Types


class GeminiModelClient(ModelClient):
    """Gemini vision adapter used by the production Pre pipeline."""

    def __init__(self) -> None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is required when the selected AI provider is gemini")
        if not settings.gemini_model:
            raise RuntimeError("GEMINI_MODEL is required when the selected AI provider is gemini")
        from google import genai
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = settings.gemini_model

    def parse_image(self, image_path: Path, prompt: str, schema: type[T], *, system: str, model: str | None = None, max_schema_retries: int | None = None) -> T:
        types = _gemini_types()

        mime = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
        image = types.Part.from_bytes(data=image_path.read_bytes(), mime_type=mime)
        settings = get_settings()
        working_prompt = prompt
        last_error: Exception | None = None
        retry_count = settings.model_retries if max_schema_retries is None else max(0, max_schema_retries)

        for attempt in range(retry_count + 1):
            try:
                response = self.client.models.generate_content(
                    model=model or self.model,
                    contents=[working_prompt, image],
                    config=types.GenerateContentConfig(
                        system_instruction=system,
                        response_mime_type="application/json",
                        response_json_schema=_gemini_json_schema(schema),
                    ),
                )
                parsed = getattr(response, "parsed", None)
                if isinstance(parsed, schema):
                    return parsed
                if parsed is not None:
                    return schema.model_validate(parsed)
                text = getattr(response, "text", None)
                if not text:
                    raise RuntimeError("Model returned no structured output")
                return schema.model_validate_json(text)
            except Exception as exc:  # noqa: BLE001 - provider and schema errors use one bounded retry policy
                last_error = exc
                if attempt >= retry_count:
                    break
                message = str(exc).replace("\n", " ")[:500]
                working_prompt = (
                    f"{prompt}\n\nYour previous response could not be accepted by the required schema: {message}. "
                    "Review every required field and enum, then return one corrected structured response only."
                )

        raise RuntimeError(
            f"Model output failed schema validation after {retry_count + 1} attempts"
        ) from last_error

    def parse_text(self, prompt: str, schema: type[T], *, system: str, model: str | None = None, max_schema_retries: int | None = None) -> T:
        types = _gemini_types()
        response = self.client.models.generate_content(
            model=model or self.model,
            contents=[prompt],
            config=types.GenerateContentConfig(
                system_instruction=system,
                response_mime_type="application/json",
                response_json_schema=_gemini_json_schema(schema),
            ),
        )
        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, schema):
            return parsed
        if parsed is not None:
            return schema.model_validate(parsed)
        return schema.model_validate_json(response.text)


class LocalReviewModelClient(ModelClient):
    """Conservative fallback for scale/height when no external vision provider is configured."""

    def parse_image(self, image_path: Path, prompt: str, schema: type[T], *, system: str, model: str | None = None, max_schema_retries: int | None = None) -> T:
        if schema is TriageOutput:
            return TriageOutput(
                sheet_disciplines=[ViewportDiscipline.UNKNOWN],
                sheet_discipline_evidence=[],
                unknown_reason="Local mode does not perform visual viewport detection",
                title_block=TitleBlock(
                    sheet_no=None,
                    title=None,
                    discipline=None,
                    revision=None,
                    issue_date=None,
                    scale=None,
                    evidence=[],
                ),
                viewports=[
                    ViewportProposal(
                        name="Full-page manual review",
                        discipline=ViewportDiscipline.UNKNOWN,
                        view_kind=ViewportViewKind.UNKNOWN,
                        subjects=[],
                        box=Box(x1=25, y1=25, x2=975, y2=975),
                        stated_scale=None,
                        level_label=None,
                        relevant=True,
                        why="Local mode proposal; adjust this box manually",
                    )
                ],
            )  # type: ignore[return-value]
        if schema is ScaleReading:
            return ScaleReading(x_line=None, y_line=None)  # type: ignore[return-value]
        if schema is HeightReading:
            return HeightReading(bands=[])  # type: ignore[return-value]
        if schema is SpecReading:
            return SpecReading(items=[])  # type: ignore[return-value]
        raise TypeError(f"Local provider cannot automatically extract {schema.__name__}; configure the appropriate AI provider")

    def parse_text(self, prompt: str, schema: type[T], *, system: str, model: str | None = None, max_schema_retries: int | None = None) -> T:
        raise TypeError(f"Local provider cannot automatically extract {schema.__name__}; configure the appropriate AI provider")


def get_model_client(scope: Literal["pre", "takeoff"]) -> ModelClient:
    settings = get_settings()
    provider = (
        settings.pre_ai_provider if scope == "pre" else settings.takeoff_ai_provider
    ).lower().strip()
    if provider in {"gemini", "google", "google_genai"}:
        return GeminiModelClient()
    if provider == "openai":
        return OpenAIModelClient()
    if provider in {"local", "manual"}:
        return LocalReviewModelClient()
    setting_name = "PRE_AI_PROVIDER" if scope == "pre" else "TAKEOFF_AI_PROVIDER"
    raise RuntimeError(f"Unsupported {setting_name}={provider}")
