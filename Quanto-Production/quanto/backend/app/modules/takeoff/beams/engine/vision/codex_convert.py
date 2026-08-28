"""Pure conversion: Anthropic-shaped harness messages ↔ Codex Responses input."""
from __future__ import annotations

import json
import re


def extract_json(text: str):
    """Parse a JSON object/array out of model text (fences, preamble, trailing junk)."""
    if text is None:
        raise json.JSONDecodeError("empty", "", 0)
    s = text.strip()
    if not s:
        raise json.JSONDecodeError("empty", text, 0)
    s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
    s = re.sub(r"\s*```$", "", s).strip()
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass
    decoder = json.JSONDecoder()
    starts = [i for i in (s.find("{"), s.find("[")) if i >= 0]
    if not starts:
        raise json.JSONDecodeError("no JSON object in model text", s, 0)
    return decoder.raw_decode(s[min(starts):])[0]


def to_openai_tools(tools: list[dict]) -> list[dict]:
    out = []
    for tool in tools:
        params = tool.get("input_schema") or {"type": "object", "properties": {}}
        out.append({
            "type": "function",
            "name": tool["name"],
            "description": tool.get("description") or "",
            "parameters": params,
            "strict": False,
        })
    return out


def _image_data_url(block: dict) -> str | None:
    src = block.get("source")
    if isinstance(src, dict) and src.get("type") == "base64" and src.get("data"):
        media = src.get("media_type") or "image/png"
        return f"data:{media};base64,{src['data']}"
    url = block.get("image_url")
    if isinstance(url, str) and url:
        return url
    return None


def _assistant_items(content) -> list[dict]:
    items: list[dict] = []
    texts: list[str] = []
    if isinstance(content, str):
        texts.append(content)
        content = []
    for block in content or []:
        if not isinstance(block, dict):
            btype = getattr(block, "type", None)
            if btype == "text":
                texts.append(getattr(block, "text", "") or "")
            elif btype == "tool_use":
                items.append({
                    "type": "function_call",
                    "call_id": getattr(block, "id", "call"),
                    "name": getattr(block, "name", ""),
                    "arguments": json.dumps(getattr(block, "input", {}) or {}),
                })
            continue
        if block.get("type") == "text" and block.get("text"):
            texts.append(block["text"])
        elif block.get("type") == "tool_use":
            item = {
                "type": "function_call",
                "call_id": block.get("id") or "call",
                "name": block.get("name") or "",
                "arguments": json.dumps(block.get("input") or {}),
            }
            if block.get("item_id"):
                item["id"] = block["item_id"]
            items.append(item)
    if texts:
        items.insert(0, {
            "type": "message",
            "role": "assistant",
            "content": [{"type": "output_text", "text": "\n".join(texts)}],
        })
    return items


def _tool_output(content) -> str | list[dict]:
    if isinstance(content, str):
        return content
    texts: list[str] = []
    images: list[dict] = []
    for block in content or []:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "text" and block.get("text"):
            texts.append(block["text"])
        elif block.get("type") == "image":
            url = _image_data_url(block)
            if url:
                images.append({"type": "input_image", "detail": "auto", "image_url": url})
        elif block.get("type") == "text":
            continue
        elif "text" in block:
            texts.append(str(block["text"]))
    if not images:
        return "\n".join(texts) if texts else "(no tool output)"
    out: list[dict] = []
    if texts:
        out.append({"type": "input_text", "text": "\n".join(texts)})
    out.extend(images)
    return out


def _user_items(content) -> list[dict]:
    if isinstance(content, str):
        return [{"role": "user", "content": [{"type": "input_text", "text": content}]}]

    items: list[dict] = []
    user_parts: list[dict] = []
    for block in content or []:
        if not isinstance(block, dict):
            continue
        btype = block.get("type")
        if btype == "tool_result":
            if user_parts:
                items.append({"role": "user", "content": user_parts})
                user_parts = []
            items.append({
                "type": "function_call_output",
                "call_id": block.get("tool_use_id") or "call",
                "output": _tool_output(block.get("content")),
            })
        elif btype == "text" and block.get("text"):
            user_parts.append({"type": "input_text", "text": block["text"]})
        elif btype == "image":
            url = _image_data_url(block)
            if url:
                user_parts.append({"type": "input_image", "detail": "auto", "image_url": url})
        elif btype == "input_image" or btype == "input_text":
            user_parts.append(block)
    if user_parts:
        items.append({"role": "user", "content": user_parts})
    return items


def _continuation_item(value):
    """Strip response-only fields before replaying output as Responses input.

    OpenAI response objects include ``status`` on messages, reasoning items and
    function calls. That field is useful when reading a response but is rejected
    when the item is supplied as the next request's input.
    """
    if isinstance(value, dict):
        return {key: _continuation_item(item) for key, item in value.items() if key != "status"}
    if isinstance(value, list):
        return [_continuation_item(item) for item in value]
    return value


def to_responses_input(messages: list[dict]) -> list[dict]:
    items: list[dict] = []
    for msg in messages:
        if msg.get("codex_output"):
            items.extend(_continuation_item(item) for item in msg["codex_output"])
            continue
        role = msg.get("role")
        content = msg.get("content")
        if role == "assistant":
            items.extend(_assistant_items(content))
        elif role == "user":
            items.extend(_user_items(content))
    return items
