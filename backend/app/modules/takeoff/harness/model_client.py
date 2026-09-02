from __future__ import annotations

import hashlib
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from ....services.ai.codex_account import CodexAccountModelClient
from .prompt_builder import compose_prompt, compose_system
from .runtime import emit

T = TypeVar("T", bound=BaseModel)


class HarnessModelClient:
    """Account-backed structured model client used by the new element harnesses.

    It deliberately uses the same ChatGPT/Codex authentication as the existing Beam
    experience. It adds expert prompts, model-call audit events and one bounded structured
    repair attempt. Semantic geometry repair remains element-specific (Roof already has a
    targeted geometry repair path).
    """

    provider = "codex-account"

    def __init__(self, element: str, project_id: str | None = None):
        self.element = element
        self.project_id = project_id
        self._client = CodexAccountModelClient()

    def parse_image(
        self,
        image_path: Path,
        prompt: str,
        schema: type[T],
        *,
        system: str = "",
        model: str | None = None,
        quality: str = "medium",
    ) -> T:
        full_prompt = compose_prompt(self.element, prompt, schema_name=schema.__name__)
        full_system = compose_system(self.element, system)
        image_hash = hashlib.sha256(Path(image_path).read_bytes()).hexdigest()
        emit("model_call", f"ChatGPT/Codex vision · {schema.__name__}", {
            "schema": schema.__name__, "image_sha256": image_hash, "prompt_sha256": hashlib.sha256(full_prompt.encode()).hexdigest(),
        }, stage="detect")
        try:
            result = self._client.parse_image(image_path, full_prompt, schema, system=full_system, model=model, quality=quality)
            emit("model_result", f"Structured vision accepted · {schema.__name__}", {"attempt": 1}, stage="detect")
            return result
        except RuntimeError as exc:
            text = str(exc).lower()
            # Retry only malformed/empty structured responses. A semantic or project
            # evidence error must be handled by deterministic validators, not hidden by retries.
            if not any(token in text for token in ("structured", "invalid structured", "without a structured")):
                raise
            emit("model_retry", f"Structured response repair · {schema.__name__}", {"reason": str(exc)[:800]}, stage="resolve")
            repair_prompt = compose_prompt(
                self.element,
                prompt,
                schema_name=schema.__name__,
                repair_reason=str(exc),
            )
            result = self._client.parse_image(image_path, repair_prompt, schema, system=full_system, model=model, quality=quality)
            emit("model_result", f"Structured vision repair accepted · {schema.__name__}", {"attempt": 2}, stage="resolve")
            return result

    def parse_text(
        self,
        prompt: str,
        schema: type[T],
        *,
        system: str = "",
        model: str | None = None,
        quality: str = "medium",
    ) -> T:
        full_prompt = compose_prompt(self.element, prompt, schema_name=schema.__name__)
        full_system = compose_system(self.element, system)
        emit("model_call", f"ChatGPT/Codex evidence resolution · {schema.__name__}", {
            "schema": schema.__name__, "prompt_sha256": hashlib.sha256(full_prompt.encode()).hexdigest(),
        }, stage="resolve")
        try:
            result = self._client.parse_text(full_prompt, schema, system=full_system, model=model, quality=quality)
            emit("model_result", f"Structured evidence accepted · {schema.__name__}", {"attempt": 1}, stage="resolve")
            return result
        except RuntimeError as exc:
            text = str(exc).lower()
            if not any(token in text for token in ("structured", "invalid structured", "without a structured")):
                raise
            emit("model_retry", f"Structured evidence repair · {schema.__name__}", {"reason": str(exc)[:800]}, stage="resolve")
            repair_prompt = compose_prompt(self.element, prompt, schema_name=schema.__name__, repair_reason=str(exc))
            result = self._client.parse_text(repair_prompt, schema, system=full_system, model=model, quality=quality)
            emit("model_result", f"Structured evidence repair accepted · {schema.__name__}", {"attempt": 2}, stage="resolve")
            return result
