"""Unified tool-calling loop (ReAct pattern).

Both ``BaseAgent._call_llm_with_tools`` and ``ConversationEngine._agentic_terminal``
delegate tool execution to helpers in this module, eliminating the duplicated
tool-call processing logic.

The optional ``ws_notify`` callback pushes tool events through the WebSocket
gateway for real-time observability in the frontend.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, AsyncIterator, Callable, Awaitable

from .models import AgentEvent, AgentType
from .tools.provider import ToolManager

logger = logging.getLogger(__name__)

WSNotifyFn = Callable[[AgentEvent], Awaitable[None]]


def _truncate(s: str, limit: int = 3000) -> str:
    return s[:limit] + "…" if len(s) > limit else s


def _truncate_dict(d: dict[str, Any], limit: int = 2000) -> dict[str, Any]:
    """Shallow truncation for logging: stringify values over *limit* chars."""
    out: dict[str, Any] = {}
    for k, v in d.items():
        s = str(v)
        out[k] = s[:limit] + "…" if len(s) > limit else v
    return out


async def execute_tool_calls(
    tool_calls: list[dict[str, Any]],
    tool_manager: ToolManager,
    messages: list[dict[str, Any]],
    *,
    workspace_id: str = "",
    agent_type: AgentType | str = "",
    collect_results: list[dict[str, Any]] | None = None,
    ws_notify: WSNotifyFn | None = None,
) -> list[AgentEvent]:
    """Execute a batch of tool_calls, append results to *messages*,
    and return ``AgentEvent`` list for WS/SSE forwarding.

    This is the **single** tool-call execution path for the entire system.
    """
    events: list[AgentEvent] = []

    def _evt(etype: str, **payload: Any) -> AgentEvent:
        return AgentEvent(
            type=etype,
            agent_type=agent_type,
            workspace_id=workspace_id,
            payload=payload,
        )

    for tc in tool_calls:
        fn = tc.get("function", {})
        name = fn.get("name", "")
        call_id = tc.get("id", "") or f"call_{name}_{uuid.uuid4().hex[:8]}"
        raw_args = fn.get("arguments", "{}")

        try:
            args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
        except json.JSONDecodeError:
            args = {}

        display_name = await tool_manager.get_display_name(name)

        start_evt = _evt(
            "tool_start", tool=name, call_id=call_id,
            display_name=display_name,
            arguments=_truncate_dict(args),
        )
        events.append(start_evt)
        if ws_notify:
            try:
                await ws_notify(start_evt)
            except Exception:
                logger.debug("ws_notify tool_start failed", exc_info=True)

        args["_workspace_id"] = workspace_id
        t0 = time.monotonic()
        result = await tool_manager.execute(name, args)
        duration_ms = int((time.monotonic() - t0) * 1000)

        if collect_results is not None:
            collect_results.append({
                "tool": name, "ok": result.ok,
                "result": result.output[:500] if result.output else "",
            })

        result_evt = _evt(
            "tool_result", tool=name, call_id=call_id,
            display_name=display_name,
            ok=result.ok, output=_truncate(result.output),
            duration_ms=duration_ms,
        )
        events.append(result_evt)
        if ws_notify:
            try:
                await ws_notify(result_evt)
            except Exception:
                logger.debug("ws_notify tool_result failed", exc_info=True)

        messages.append({
            "role": "tool",
            "tool_call_id": tc.get("id", ""),
            "content": result.output,
        })

    return events


async def run_tool_loop(
    messages: list[dict[str, Any]],
    *,
    llm: Any,
    tool_manager: ToolManager,
    tool_schemas: list[dict[str, Any]],
    max_iterations: int = 10,
    workspace_id: str = "",
    agent_type: AgentType | str = "",
    model: str | None = None,
    llm_kw: dict[str, Any] | None = None,
    collect_results: list[dict[str, Any]] | None = None,
    ws_notify: WSNotifyFn | None = None,
) -> str:
    """Non-streaming tool loop: iterate until the LLM produces a final text.

    Returns the assistant's final reply text.
    """
    kw = dict(llm_kw or {})

    for _ in range(max_iterations):
        result = await llm.chat(messages, tools=tool_schemas, model=model, **kw)
        choice = result.get("choices", [{}])[0]
        msg = choice.get("message", {})
        tool_calls = msg.get("tool_calls")

        if not tool_calls:
            return msg.get("content", "")

        messages.append(msg)
        await execute_tool_calls(
            tool_calls, tool_manager, messages,
            workspace_id=workspace_id,
            agent_type=agent_type,
            collect_results=collect_results,
            ws_notify=ws_notify,
        )

    for msg in reversed(messages):
        if isinstance(msg, dict) and msg.get("role") in ("assistant", "system"):
            c = msg.get("content") or ""
            if c:
                return c
    return ""


async def run_tool_loop_stream(
    messages: list[dict[str, Any]],
    *,
    llm: Any,
    tool_manager: ToolManager,
    tool_schemas: list[dict[str, Any]],
    max_iterations: int = 10,
    workspace_id: str = "",
    agent_type: AgentType | str = "",
    model: str | None = None,
    collect_results: list[dict[str, Any]] | None = None,
    ws_notify: WSNotifyFn | None = None,
) -> AsyncIterator[AgentEvent]:
    """Streaming tool loop: yields content deltas and tool events."""

    def _evt(etype: str, **payload: Any) -> AgentEvent:
        return AgentEvent(
            type=etype,
            agent_type=agent_type,
            workspace_id=workspace_id,
            payload=payload,
        )

    full_reply = ""

    for _ in range(max_iterations):
        content_parts: list[str] = []
        tool_calls_acc: list[dict[str, Any]] = []

        async for chunk in llm.chat_stream(messages, tools=tool_schemas):
            choice = chunk.get("choices", [{}])[0]
            delta = choice.get("delta", {})

            if delta.get("tool_calls"):
                for tc in delta["tool_calls"]:
                    idx = tc.get("index", 0)
                    while len(tool_calls_acc) <= idx:
                        tool_calls_acc.append({
                            "id": "", "type": "function",
                            "function": {"name": "", "arguments": ""},
                        })
                    if tc.get("id"):
                        tool_calls_acc[idx]["id"] = tc["id"]
                    fn = tc.get("function", {})
                    if fn.get("name"):
                        tool_calls_acc[idx]["function"]["name"] = fn["name"]
                    if fn.get("arguments"):
                        tool_calls_acc[idx]["function"]["arguments"] += fn["arguments"]

            content = delta.get("content", "") or ""
            if content:
                content_parts.append(content)
                if not tool_calls_acc:
                    full_reply += content
                    yield _evt("content_delta", delta=content)

        if tool_calls_acc:
            buffered = "".join(content_parts) if content_parts else None
            messages.append({
                "role": "assistant",
                "content": buffered,
                "tool_calls": tool_calls_acc,
            })
            events = await execute_tool_calls(
                tool_calls_acc, tool_manager, messages,
                workspace_id=workspace_id,
                agent_type=agent_type,
                collect_results=collect_results,
                ws_notify=ws_notify,
            )
            for evt in events:
                yield evt
            continue

        joined = "".join(content_parts)
        remaining = joined[len(full_reply):]
        if remaining:
            yield _evt("content_delta", delta=remaining)
        break
