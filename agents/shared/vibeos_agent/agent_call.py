"""Shared helpers for calling domain agents via ``/api/conversation/stream``.

All inter-agent HTTP calls (Dispatcher, GraphExecutor, delegation tool)
converge on this module so SSE parsing and error handling live in one place.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = httpx.Timeout(300, connect=30)


async def iter_agent_sse(
    base_url: str,
    payload: dict[str, Any],
    *,
    timeout: httpx.Timeout | int = _DEFAULT_TIMEOUT,
    http_client: httpx.AsyncClient | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Stream ``/api/conversation/stream`` and yield ``(event_type, data)`` pairs.

    *event_type* is the ``event:`` line value (e.g. ``"content:delta"``),
    or ``""`` when only a ``data:`` line is present without a preceding event.
    The generator stops when ``data: [DONE]`` is received.
    """
    url = f"{base_url.rstrip('/')}/api/conversation/stream"
    if isinstance(timeout, int):
        timeout = httpx.Timeout(timeout, connect=30)

    should_close = http_client is None
    client = http_client or httpx.AsyncClient(timeout=timeout)

    try:
        async with client.stream("POST", url, json=payload) as resp:
            resp.raise_for_status()
            current_event = ""
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line or line.startswith(":"):
                    continue
                if line.startswith("event: "):
                    current_event = line[7:]
                    continue
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        return
                    try:
                        data = json.loads(data_str)
                    except json.JSONDecodeError:
                        current_event = ""
                        continue
                    yield current_event, data
                    current_event = ""
    finally:
        if should_close:
            await client.aclose()


async def collect_agent_result(
    base_url: str,
    payload: dict[str, Any],
    *,
    timeout: httpx.Timeout | int = _DEFAULT_TIMEOUT,
    http_client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Call a domain agent and collect the aggregated result.

    Returns ``{"summary": str, "artifacts": list, "error": str}``.
    """
    result: dict[str, Any] = {"summary": "", "artifacts": [], "error": ""}
    content_parts: list[str] = []

    try:
        async for _event_type, data in iter_agent_sse(
            base_url, payload, timeout=timeout, http_client=http_client,
        ):
            if data.get("delta"):
                content_parts.append(data["delta"])
            if data.get("summary"):
                result["summary"] = data["summary"]
            if data.get("artifacts"):
                result["artifacts"].extend(data["artifacts"])
            if data.get("type") in ("result", "error"):
                result.update(data)
    except (httpx.HTTPStatusError, httpx.ConnectError, httpx.TimeoutException) as exc:
        result["error"] = str(exc)
        logger.warning("Agent call to %s failed: %s", base_url, exc)
    except Exception as exc:
        result["error"] = str(exc)
        logger.warning("Agent call to %s failed: %s", base_url, exc)

    if content_parts:
        result["summary"] = result.get("summary") or "".join(content_parts)
        result.setdefault("result", "".join(content_parts))
    return result
