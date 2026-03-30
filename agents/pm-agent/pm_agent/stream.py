"""SSE streaming helpers for the PM agent.

All SSE event builders live here so they can be imported by both ``main.py``
(the core NLP flow) and ``home_actions.py`` (the home-page action registry).
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator


async def yield_text_as_deltas(
    text: str, chunk_size: int = 6,
) -> AsyncGenerator[str, None]:
    """Break *text* into small chunks and yield them as SSE delta events.

    Turns a pre-computed response into a gradual stream so the UI renders
    it progressively instead of dumping everything at once.
    """
    i = 0
    while i < len(text):
        end = min(i + chunk_size, len(text))
        if end < len(text) and text[end] not in (" ", "\n", "\t", "，", "。", "、", "；"):
            space = text.find(" ", end)
            newline = text.find("\n", end)
            candidates = [c for c in (space, newline) if c != -1]
            if candidates and min(candidates) - i < chunk_size * 3:
                end = min(candidates) + 1
        chunk = text[i:end]
        if chunk:
            yield f"data: {json.dumps({'delta': chunk})}\n\n"
            await asyncio.sleep(0.012)
        i = end


def build_action_event(
    action_type: str,
    payload: dict[str, Any] | None = None,
    label: str = "",
    variant: str = "primary",
    title: str = "",
    description: str = "",
) -> str:
    """Build a structured nlp_action SSE event for data-driven frontend actions."""
    data: dict[str, Any] = {
        "type": "nlp_action",
        "action_type": action_type,
        "action_variant": variant,
    }
    if payload:
        data["action_payload"] = payload
    if label:
        data["action_label"] = label
    if title:
        data["title"] = title
    if description:
        data["description"] = description
    return f"event: nlp_action\ndata: {json.dumps(data)}\n\n"


def build_timeline_event(step_id: str, label: str, status: str, detail: str = "") -> str:
    """Build an execution timeline step SSE event."""
    payload: dict[str, str] = {"step_id": step_id, "label": label, "status": status}
    if detail:
        payload["detail"] = detail
    return f"event: timeline\ndata: {json.dumps(payload)}\n\n"


def build_error_event(
    error_type: str,
    message: str,
    hints: list[str] | None = None,
    actions: list[dict[str, Any]] | None = None,
) -> str:
    """Build a structured error card SSE event."""
    payload: dict[str, Any] = {"error_type": error_type, "message": message}
    if hints:
        payload["hints"] = hints
    if actions:
        payload["actions"] = actions
    return f"event: error_card\ndata: {json.dumps(payload)}\n\n"
