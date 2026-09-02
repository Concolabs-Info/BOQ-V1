"""Resolve which model client to use from Quanto/Beam environment settings."""
from __future__ import annotations

import os

from agentic.model import ModelClient


def vision_mode() -> str:
    explicit = os.environ.get("BEAM_VISION_MODE") or os.environ.get("VISION_MODE")
    if explicit:
        return explicit
    return "live" if os.environ.get("OPENAI_API_KEY") else "stub"


def vision_provider() -> str:
    return os.environ.get("BEAM_VISION_PROVIDER") or os.environ.get("VISION_PROVIDER", "quanto-openai")


def vision_model() -> str:
    return (
        os.environ.get("BEAM_MODEL")
        or os.environ.get("VISION_MODEL")
        or os.environ.get("OPENAI_MODEL")
        or "gpt-5.6-sol"
    )


def vision_model_for(method: str) -> str:
    if method in ("classify_sheets", "find_grade", "read_schedule"):
        return os.environ.get("BEAM_MODEL_TRIAGE") or os.environ.get("VISION_MODEL_TRIAGE") or vision_model()
    return vision_model()


def agentic_enabled() -> bool:
    flag = os.environ.get("BEAM_AGENTIC") or os.environ.get("VISION_AGENTIC")
    if flag == "1":
        return True
    if flag == "0":
        return False
    return vision_mode() == "live" and vision_provider() in {"openai-codex", "quanto-openai"}


def get_model_client() -> ModelClient:
    provider = vision_provider()
    if provider == "anthropic":
        from vision.anthropic_adapter import AnthropicModelClient
        return AnthropicModelClient()
    if provider == "openai-codex":
        from vision.codex import CodexModelClient
        return CodexModelClient()
    from vision.quanto_openai import QuantoOpenAIModelClient
    return QuantoOpenAIModelClient()
