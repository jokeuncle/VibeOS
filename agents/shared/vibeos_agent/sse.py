"""Unified SSE helpers for VibeOS agents.

All SSE events follow the format:

    event: <category>:<action>
    data: {"sid": "...", ...payload}

Domain agents use these helpers to emit standardized SSE frames
from ``/api/execute/stream`` and ``/api/chat/stream``.
"""

from __future__ import annotations

import json
import uuid
from typing import Any


def sse_event(category: str, action: str, payload: dict[str, Any] | None = None, *, sid: str = "") -> str:
    """Build a unified SSE frame string."""
    data: dict[str, Any] = {}
    if sid:
        data["sid"] = sid
    if payload:
        data.update(payload)
    return f"event: {category}:{action}\ndata: {json.dumps(data)}\n\n"


def sse_delta(delta: str, *, sid: str = "") -> str:
    """Build a content:delta SSE frame."""
    data: dict[str, Any] = {"delta": delta}
    if sid:
        data["sid"] = sid
    return f"event: content:delta\ndata: {json.dumps(data)}\n\n"


def sse_done() -> str:
    return "data: [DONE]\n\n"


def sse_session_start(agent_type: str, session_type: str = "agent_execute") -> tuple[str, str]:
    """Emit a session:start event and return (sid, sse_string)."""
    sid = uuid.uuid4().hex
    frame = sse_event("session", "start", {"type": session_type, "agent": agent_type}, sid=sid)
    return sid, frame


def sse_session_complete(sid: str, status: str = "success") -> str:
    return sse_event("session", "complete", {"status": status}, sid=sid)


def sse_session_error(sid: str, error: str) -> str:
    return sse_event("session", "error", {"error": error}, sid=sid)
