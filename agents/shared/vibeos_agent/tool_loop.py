"""Unified tool-calling loop (ReAct pattern).

``BaseAgent._make_tool_terminal`` and ``ConversationEngine._agentic_terminal``
delegate tool execution to helpers in this module, providing a single
unified tool-call processing implementation.

The optional ``ws_notify`` callback pushes tool events through the WebSocket
gateway for real-time observability in the frontend.

Tools with ``requires_confirmation=True`` are intercepted: instead of
executing immediately the loop emits a ``tool_confirmation`` event and
returns a synthetic result telling the LLM to stop and wait.
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


def _agent_type_for_event(agent_type: AgentType | str) -> AgentType:
    """Coerce caller-supplied agent id to :class:`AgentType` for :class:`AgentEvent`."""
    if isinstance(agent_type, AgentType):
        return agent_type
    if isinstance(agent_type, str) and agent_type.strip():
        try:
            return AgentType(agent_type)
        except ValueError:
            logger.debug("Unknown agent_type %r, defaulting to PM", agent_type)
    return AgentType.PM

_CONFIRMATION_PENDING_RESULT = (
    '{"status":"confirmation_pending","message":'
    '"This action requires user confirmation. '
    'A confirmation card has been sent to the user. '
    'Do NOT retry this tool -- wait for the user\'s next message."}'
)


def _truncate(s: str, limit: int = 3000) -> str:
    return s[:limit] + "…" if len(s) > limit else s


def _truncate_dict(d: dict[str, Any], limit: int = 2000) -> dict[str, Any]:
    """Shallow truncation for logging: stringify values over *limit* chars."""
    out: dict[str, Any] = {}
    for k, v in d.items():
        s = str(v)
        out[k] = s[:limit] + "…" if len(s) > limit else v
    return out


def _merge_discovered_schemas(
    tool_calls: list[dict[str, Any]],
    messages: list[dict[str, Any]],
    tool_schemas: list[dict[str, Any]],
) -> None:
    """After search_tools returns, merge discovered schemas into *tool_schemas*
    so the LLM can call them as first-class tools in subsequent iterations."""
    existing = {s.get("function", {}).get("name") for s in tool_schemas}

    for tc in tool_calls:
        if tc.get("function", {}).get("name") != "search_tools":
            continue
        call_id = tc.get("id", "")
        for msg in reversed(messages):
            if msg.get("role") == "tool" and msg.get("tool_call_id") == call_id:
                try:
                    data = json.loads(msg.get("content", "{}"))
                    for schema in data.get("tools", []):
                        name = schema.get("function", {}).get("name", "")
                        if name and name not in existing:
                            tool_schemas.append(schema)
                            existing.add(name)
                except (json.JSONDecodeError, KeyError, TypeError):
                    pass
                break


async def execute_tool_calls(
    tool_calls: list[dict[str, Any]],
    tool_manager: ToolManager,
    messages: list[dict[str, Any]],
    *,
    workspace_id: str = "",
    agent_type: AgentType | str = "",
    task_context: dict[str, Any] | None = None,
    collect_results: list[dict[str, Any]] | None = None,
    ws_notify: WSNotifyFn | None = None,
    check_confirmation: bool = False,
) -> list[AgentEvent]:
    """Execute a batch of tool_calls, append results to *messages*,
    and return ``AgentEvent`` list for WS/SSE forwarding.

    This is the **single** tool-call execution path for the entire system.

    *task_context* (optional) is merged into each tool's arguments under
    the ``_context`` key so tools can access task-level metadata (e.g.
    phase, task_id, upstream artifacts) without coupling to BaseAgent.

    When *check_confirmation* is ``True`` and a tool has
    ``requires_confirmation=True``, the tool is **not** executed.  Instead
    a ``tool_confirmation`` event is emitted and the LLM receives a
    synthetic result instructing it to stop and wait for user input.
    """
    events: list[AgentEvent] = []

    at = _agent_type_for_event(agent_type)

    def _evt(etype: str, **payload: Any) -> AgentEvent:
        return AgentEvent(
            type=etype,
            agent_type=at,
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

        needs_confirm = (
            check_confirmation
            and await tool_manager.tool_requires_confirmation(name)
        )

        if needs_confirm:
            confirmation_key = f"tc:{workspace_id}:{call_id}"
            confirm_evt = _evt(
                "tool_confirmation", tool=name, call_id=call_id,
                display_name=display_name,
                arguments=_truncate_dict(args),
                confirmation_key=confirmation_key,
            )
            events.append(confirm_evt)
            if ws_notify:
                try:
                    await ws_notify(confirm_evt)
                except Exception:
                    logger.debug("ws_notify tool_confirmation failed", exc_info=True)

            if collect_results is not None:
                collect_results.append({
                    "tool": name, "ok": True,
                    "result": "confirmation_pending",
                })

            messages.append({
                "role": "tool",
                "tool_call_id": tc.get("id", ""),
                "content": _CONFIRMATION_PENDING_RESULT,
            })
            continue

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
        if task_context:
            args.setdefault("_context", task_context)
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
    task_context: dict[str, Any] | None = None,
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
            task_context=task_context,
            collect_results=collect_results,
            ws_notify=ws_notify,
        )
        _merge_discovered_schemas(tool_calls, messages, tool_schemas)

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
    task_context: dict[str, Any] | None = None,
    collect_results: list[dict[str, Any]] | None = None,
    ws_notify: WSNotifyFn | None = None,
    check_confirmation: bool = False,
) -> AsyncIterator[AgentEvent]:
    """Streaming tool loop: yields content deltas and tool events.

    When *check_confirmation* is ``True``, tools marked with
    ``requires_confirmation`` will not execute immediately.  A
    ``tool_confirmation`` event is emitted instead and the loop
    terminates so the LLM stops generating further calls.
    """

    at = _agent_type_for_event(agent_type)

    def _evt(etype: str, **payload: Any) -> AgentEvent:
        return AgentEvent(
            type=etype,
            agent_type=at,
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
                task_context=task_context,
                collect_results=collect_results,
                ws_notify=ws_notify,
                check_confirmation=check_confirmation,
            )
            has_confirmation = any(
                e.type == "tool_confirmation" for e in events
            )
            for evt in events:
                yield evt
            _merge_discovered_schemas(tool_calls_acc, messages, tool_schemas)
            if has_confirmation:
                break
            continue

        joined = "".join(content_parts)
        remaining = joined[len(full_reply):]
        if remaining:
            yield _evt("content_delta", delta=remaining)
        break
