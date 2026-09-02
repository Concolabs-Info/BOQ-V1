from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path
from typing import Any, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

_PROVIDER = "codex-account"
_LOGIN_GUARD = threading.Lock()
_LOGIN_STATE: dict[str, Any] = {
    "status": "idle",
    "authenticated": False,
    "verification_url": None,
    "user_code": None,
    "error": None,
}
_LOGIN_CLIENT: Any = None
_LOGIN_HANDLE: Any = None
_STATUS_CACHE_AT = 0.0
_STATUS_CACHE_VALUE: dict[str, Any] | None = None
_STATUS_CACHE_SECONDS = 10.0


def _codex_env() -> dict[str, str]:
    """Environment inherited by the Codex child process.

    Account-backed Takeoff detection is intentionally account-authenticated. Removing API-key
    variables from the child process prevents an existing Quanto API key from
    silently turning Floor/Ceiling detection back into metered API usage. Other Quanto
    modules keep the parent process environment unchanged.
    """
    blocked = {
        "OPENAI_API_KEY",
        "CODEX_API_KEY",
        "AZURE_OPENAI_API_KEY",
    }
    return {key: value for key, value in os.environ.items() if key.upper() not in blocked}


def _sdk() -> tuple[Any, Any, Any, Any, Any]:
    try:
        from openai_codex import Codex, CodexConfig, LocalImageInput, Sandbox, TextInput
    except ImportError as exc:  # pragma: no cover - exercised on machines before install
        raise RuntimeError(
            "Account-backed Takeoff detection needs the OpenAI Codex Python SDK. "
            "Install the backend dependencies again with: pip install -e ."
        ) from exc
    return Codex, CodexConfig, LocalImageInput, Sandbox, TextInput


def _codex_client() -> Any:
    Codex, CodexConfig, _, _, _ = _sdk()
    return Codex(CodexConfig(env=_codex_env()))


def _has_account(response: Any) -> bool:
    return bool(getattr(response, "account", None))


def _cache_status(value: dict[str, Any]) -> dict[str, Any]:
    global _STATUS_CACHE_AT, _STATUS_CACHE_VALUE
    with _LOGIN_GUARD:
        _STATUS_CACHE_AT = time.monotonic()
        _STATUS_CACHE_VALUE = dict(value)
    return value


def _invalidate_status_cache() -> None:
    global _STATUS_CACHE_AT, _STATUS_CACHE_VALUE
    with _LOGIN_GUARD:
        _STATUS_CACHE_AT = 0.0
        _STATUS_CACHE_VALUE = None


def codex_account_status(*, refresh: bool = False) -> dict[str, Any]:
    """Return Takeoff account-auth readiness without exposing account secrets.

    The Floor/Ceiling UI polls project state while detection is running. A short cache
    prevents those polls from spawning a new Codex process each time. Explicit
    auth endpoints use ``refresh=True`` so sign-in changes appear immediately.
    """
    if not refresh:
        with _LOGIN_GUARD:
            if (
                _STATUS_CACHE_VALUE is not None
                and time.monotonic() - _STATUS_CACHE_AT < _STATUS_CACHE_SECONDS
            ):
                return dict(_STATUS_CACHE_VALUE)
    try:
        client = _codex_client()
    except RuntimeError as exc:
        return _cache_status({
            "provider": _PROVIDER,
            "available": False,
            "authenticated": False,
            "status": "sdk_missing",
            "verification_url": None,
            "user_code": None,
            "error": str(exc),
        })

    try:
        with client as codex:
            authenticated = _has_account(codex.account())
    except Exception as exc:  # unauthenticated/runtime-start failures are reported to the UI
        with _LOGIN_GUARD:
            pending = _LOGIN_STATE.get("status") == "waiting"
            state = dict(_LOGIN_STATE)
        return _cache_status({
            "provider": _PROVIDER,
            "available": True,
            "authenticated": False,
            "status": "waiting" if pending else "signed_out",
            "verification_url": state.get("verification_url") if pending else None,
            "user_code": state.get("user_code") if pending else None,
            "error": state.get("error") if pending else str(exc)[:300],
        })

    with _LOGIN_GUARD:
        pending = _LOGIN_STATE.get("status") == "waiting"
        state = dict(_LOGIN_STATE)
    if authenticated:
        return _cache_status({
            "provider": _PROVIDER,
            "available": True,
            "authenticated": True,
            "status": "connected",
            "verification_url": None,
            "user_code": None,
            "error": None,
        })
    return _cache_status({
        "provider": _PROVIDER,
        "available": True,
        "authenticated": False,
        "status": "waiting" if pending else "signed_out",
        "verification_url": state.get("verification_url") if pending else None,
        "user_code": state.get("user_code") if pending else None,
        "error": state.get("error") if pending else None,
    })


def _wait_for_login(client: Any, handle: Any) -> None:
    global _LOGIN_CLIENT, _LOGIN_HANDLE
    try:
        outcome = handle.wait()
        success = bool(getattr(outcome, "success", False))
        with _LOGIN_GUARD:
            _LOGIN_STATE.update(
                status="connected" if success else "failed",
                authenticated=success,
                error=None if success else "ChatGPT sign-in did not complete.",
            )
    except Exception as exc:  # noqa: BLE001
        with _LOGIN_GUARD:
            _LOGIN_STATE.update(status="failed", authenticated=False, error=str(exc)[:300])
    finally:
        try:
            client.close()
        except Exception:
            pass
        with _LOGIN_GUARD:
            _LOGIN_CLIENT = None
            _LOGIN_HANDLE = None
            if _LOGIN_STATE.get("status") != "waiting":
                _LOGIN_STATE["verification_url"] = None
                _LOGIN_STATE["user_code"] = None
        _invalidate_status_cache()


def start_codex_account_login() -> dict[str, Any]:
    """Start the official ChatGPT device-code flow used by account-backed Takeoff detection."""
    global _LOGIN_CLIENT, _LOGIN_HANDLE
    current = codex_account_status(refresh=True)
    if current.get("authenticated"):
        return current
    if not current.get("available"):
        raise RuntimeError(current.get("error") or "Codex account SDK is not available")

    with _LOGIN_GUARD:
        if _LOGIN_STATE.get("status") == "waiting" and _LOGIN_HANDLE is not None:
            return {
                "provider": _PROVIDER,
                "available": True,
                "authenticated": False,
                **dict(_LOGIN_STATE),
            }

        client = _codex_client()
        try:
            client.__enter__()
            handle = client.login_chatgpt_device_code()
        except Exception:
            try:
                client.close()
            except Exception:
                pass
            raise
        _LOGIN_CLIENT = client
        _LOGIN_HANDLE = handle
        _LOGIN_STATE.update(
            status="waiting",
            authenticated=False,
            verification_url=str(handle.verification_url),
            user_code=str(handle.user_code),
            error=None,
        )
        payload = {
            "provider": _PROVIDER,
            "available": True,
            **dict(_LOGIN_STATE),
        }
        thread = threading.Thread(
            target=_wait_for_login,
            args=(client, handle),
            daemon=True,
            name="quanto-takeoff-codex-login",
        )
        thread.start()
        return payload


def logout_codex_account() -> dict[str, Any]:
    """Sign the local Codex account session out. Does not alter Quanto auth."""
    global _LOGIN_CLIENT, _LOGIN_HANDLE
    with _LOGIN_GUARD:
        handle = _LOGIN_HANDLE
    if handle is not None:
        try:
            handle.cancel()
        except Exception:
            pass
    client = _codex_client()
    with client as codex:
        codex.logout()
    with _LOGIN_GUARD:
        _LOGIN_CLIENT = None
        _LOGIN_HANDLE = None
        _LOGIN_STATE.update(
            status="idle",
            authenticated=False,
            verification_url=None,
            user_code=None,
            error=None,
        )
    _invalidate_status_cache()
    return codex_account_status(refresh=True)


def _effort(quality: str | None) -> str:
    return {
        "easy": "low",
        "medium": "medium",
        "expert": "high",
        "maximum": "xhigh",
    }.get((quality or "medium").strip().lower(), "medium")


def _response_json(text: str | None, schema: type[T]) -> T:
    if not text or not text.strip():
        raise RuntimeError("Codex completed without a structured Takeoff response")
    value = text.strip()
    try:
        return schema.model_validate_json(value)
    except Exception:
        # Structured-output runtimes should return raw JSON, but tolerate a
        # fenced block so a harmless rendering wrapper never loses a result.
        if value.startswith("```"):
            lines = value.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            value = "\n".join(lines).strip()
        try:
            return schema.model_validate(json.loads(value))
        except Exception as exc:
            raise RuntimeError("Codex returned invalid structured Takeoff data") from exc


def _codex_output_schema(schema: type[BaseModel]) -> dict[str, Any]:
    """Convert Pydantic JSON Schema to the strict Responses schema subset.

    The account SDK forwards this schema to the Responses API. Strict structured
    outputs require every object property to appear in ``required`` (nullable
    fields express optional values with ``null``) and disallow additional
    properties. Pydantic omits defaulted fields from ``required``, so sending its
    schema verbatim fails before the model is called.
    """

    def normalize(value: Any) -> Any:
        if isinstance(value, list):
            return [normalize(item) for item in value]
        if not isinstance(value, dict):
            return value
        cleaned = {key: normalize(item) for key, item in value.items() if key != "default"}
        properties = cleaned.get("properties")
        if isinstance(properties, dict):
            cleaned["required"] = list(properties)
            cleaned["additionalProperties"] = False
        return cleaned

    return normalize(schema.model_json_schema())


class CodexAccountModelClient:
    """Structured vision/text client backed by the user's local ChatGPT/Codex session."""

    provider = _PROVIDER

    def _check_account(self, codex: Any) -> None:
        if not _has_account(codex.account()):
            raise RuntimeError("Connect a ChatGPT account in the current Takeoff workspace before running detection.")

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
        Codex, CodexConfig, LocalImageInput, Sandbox, TextInput = _sdk()
        config = CodexConfig(env=_codex_env())
        instruction = prompt.strip()
        with Codex(config) as codex:
            self._check_account(codex)
            thread = codex.thread_start(
                developer_instructions=system.strip() or None,
                ephemeral=True,
                model=model or None,
                sandbox=Sandbox.read_only,
            )
            result = thread.run(
                [
                    LocalImageInput(path=str(Path(image_path).resolve())),
                    TextInput(text=instruction),
                ],
                effort=_effort(quality),
                output_schema=_codex_output_schema(schema),
                sandbox=Sandbox.read_only,
            )
        return _response_json(result.final_response, schema)

    def parse_text(
        self,
        prompt: str,
        schema: type[T],
        *,
        system: str = "",
        model: str | None = None,
        quality: str = "medium",
    ) -> T:
        Codex, CodexConfig, _, Sandbox, _ = _sdk()
        config = CodexConfig(env=_codex_env())
        with Codex(config) as codex:
            self._check_account(codex)
            thread = codex.thread_start(
                developer_instructions=system.strip() or None,
                ephemeral=True,
                model=model or None,
                sandbox=Sandbox.read_only,
            )
            result = thread.run(
                prompt.strip(),
                effort=_effort(quality),
                output_schema=_codex_output_schema(schema),
                sandbox=Sandbox.read_only,
            )
        return _response_json(result.final_response, schema)
