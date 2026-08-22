from __future__ import annotations

import base64
from pathlib import Path
from typing import TypeVar

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
    def parse_image(self, image_path: Path, prompt: str, schema: type[T], *, system: str) -> T:
        raise NotImplementedError


class OpenAIModelClient(ModelClient):
    def __init__(self) -> None:
        from openai import OpenAI

        settings = get_settings()
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required when AI_PROVIDER=openai")
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model
        if not self.model:
            raise RuntimeError("OPENAI_MODEL is required when AI_PROVIDER=openai")

    def parse_image(self, image_path: Path, prompt: str, schema: type[T], *, system: str) -> T:
        mime = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
        encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
        settings = get_settings()
        working_prompt = prompt
        last_error: Exception | None = None

        # A malformed structured response is retried twice, as required by the Pre plan.
        # The image stays identical; only concise schema-repair feedback is appended.
        for attempt in range(settings.model_retries + 1):
            try:
                response = self.client.responses.parse(
                    model=self.model,
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
                if attempt >= settings.model_retries:
                    break
                message = str(exc).replace("\n", " ")[:500]
                working_prompt = (
                    f"{prompt}\n\nYour previous response could not be accepted by the required schema: {message}. "
                    "Review every required field and enum, then return one corrected structured response only."
                )

        raise RuntimeError(
            f"Model output failed schema validation after {settings.model_retries + 1} attempts"
        ) from last_error


class GeminiModelClient(ModelClient):
    """Gemini vision adapter used by the production Pre pipeline."""

    def __init__(self) -> None:
        from google import genai

        settings = get_settings()
        if not settings.gemini_api_key:
            raise RuntimeError("GEMINI_API_KEY is required when AI_PROVIDER=gemini")
        if not settings.gemini_model:
            raise RuntimeError("GEMINI_MODEL is required when AI_PROVIDER=gemini")
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model = settings.gemini_model

    def parse_image(self, image_path: Path, prompt: str, schema: type[T], *, system: str) -> T:
        from google.genai import types

        mime = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
        image = types.Part.from_bytes(data=image_path.read_bytes(), mime_type=mime)
        settings = get_settings()
        working_prompt = prompt
        last_error: Exception | None = None

        for attempt in range(settings.model_retries + 1):
            try:
                response = self.client.models.generate_content(
                    model=self.model,
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
                if attempt >= settings.model_retries:
                    break
                message = str(exc).replace("\n", " ")[:500]
                working_prompt = (
                    f"{prompt}\n\nYour previous response could not be accepted by the required schema: {message}. "
                    "Review every required field and enum, then return one corrected structured response only."
                )

        raise RuntimeError(
            f"Model output failed schema validation after {settings.model_retries + 1} attempts"
        ) from last_error


class LocalReviewModelClient(ModelClient):
    """Conservative fallback for scale/height when no external vision provider is configured."""

    def parse_image(self, image_path: Path, prompt: str, schema: type[T], *, system: str) -> T:
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
        raise TypeError(f"Mock provider has no fixture for {schema.__name__}")


def get_model_client() -> ModelClient:
    provider = get_settings().ai_provider.lower().strip()
    if provider in {"gemini", "google", "google_genai"}:
        return GeminiModelClient()
    if provider == "openai":
        return OpenAIModelClient()
    if provider in {"local", "manual"}:
        return LocalReviewModelClient()
    raise RuntimeError(f"Unsupported AI_PROVIDER={provider}")
