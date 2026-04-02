"""ConversationEngine -- single unified agentic loop for all AI interactions.

Replaces the previous NLP/chat/workflow/home split with one conversation
abstraction: LLM + ToolManager in a ReAct loop, wrapped by the middleware
pipeline (session, enrichment, memory, observability, WS status).
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

from pydantic import BaseModel

from .clients.llm import LLMGatewayClient
from .middleware.base import InvocationContext, MiddlewarePipeline
from .middleware.context_enricher import ContextEnricherMiddleware
from .middleware.memory_writer import MemoryWriterMiddleware
from .middleware.observability import ObservabilityMiddleware
from .middleware.session_mw import SessionMiddleware, TokenBudget
from .middleware.ws_status import WSStatusMiddleware
from .models import AgentEvent, AgentType
from .session import SessionManager
from .tools.provider import ToolManager

logger = logging.getLogger(__name__)

_DEFAULT_SYSTEM_PROMPT = """\
You are VibeOS, an AI-native SDLC platform assistant. You manage software \
projects across their full lifecycle.

You have access to tools for:
- Workspace management (query progress, create workspaces, list workspaces)
- Phase/task execution (run phases, run tasks, run full projects)
- Delegation to specialist agents (requirement, architecture, design, \
development, testing, cicd, monitoring)
- Graph-based workflow execution
- Artifact and task creation
- Code generation, review, and implementation planning
- GitLab integration (issues, merge requests, pipelines, file push)
- CI/CD pipelines (trigger, status, logs, cancel)
- Feishu/Lark messaging, tasks, and document creation

Use tools when the user wants to perform actions. Respond conversationally \
when they ask questions or want to discuss.

IMPORTANT: Always respond in the same language as the user's message. \
If the user writes in Chinese, respond in Chinese. If in English, respond \
in English.\
"""

_LOCALE_HINTS = {
    "zh-CN": "\n\nRespond in Chinese (简体中文).",
    "zh": "\n\nRespond in Chinese (简体中文).",
    "en": "\n\nRespond in English.",
}


class ConversationRequest(BaseModel):
    """Unified request for all AI interactions."""

    workspace_id: str
    message: str
    locale: str = "auto"
    context: dict[str, Any] | None = None
    target_agent: str | None = None
    graph_id: str | None = None


class ConversationEngine:
    """Single agentic loop that replaces NLP/chat/workflow/home paths."""

    def __init__(
        self,
        *,
        llm: LLMGatewayClient,
        tool_manager: ToolManager,
        session: SessionManager,
        workspace_client: Any,
        ws_gateway: Any,
        memory_client: Any,
        rag_client: Any | None = None,
        knowledge_client: Any | None = None,
        system_prompt: str = _DEFAULT_SYSTEM_PROMPT,
        max_iterations: int = 15,
    ) -> None:
        self._llm = llm
        self._tool_manager = tool_manager
        self._session = session
        self._ws_client = workspace_client
        self._ws_gw = ws_gateway
        self._system_prompt = system_prompt
        self._max_iterations = max_iterations

        self._pipeline = MiddlewarePipeline()
        self._pipeline.use(ObservabilityMiddleware())
        self._pipeline.use(WSStatusMiddleware(ws_gateway))
        self._pipeline.use(SessionMiddleware(session, budget=TokenBudget()))
        if memory_client:
            enricher = ContextEnricherMiddleware(
                workspace_client, memory_client, rag_client, knowledge_client,
            )
            self._pipeline.use(enricher)
            self._pipeline.use(MemoryWriterMiddleware(memory_client))

    def _build_system_prompt(self, req: ConversationRequest) -> str:
        prompt = self._system_prompt
        locale_hint = _LOCALE_HINTS.get(req.locale, "")
        if locale_hint:
            prompt += locale_hint
        if req.target_agent:
            prompt += f"\n\nThe user wants to interact with the {req.target_agent} specialist agent. Delegate to it using the delegate_to_agent tool."
        if req.graph_id:
            prompt += f"\n\nThe user has specified graph_id={req.graph_id}. Call the run_graph tool with this graph_id."
        if req.context:
            prompt += "\n\n## Current UI Context\n"
            for k, v in req.context.items():
                prompt += f"- {k}: {v}\n"
        return prompt

    async def run(self, req: ConversationRequest) -> AsyncIterator[str]:
        """Execute a conversation turn, yielding SSE frames."""
        sid = uuid.uuid4().hex
        agent_type = AgentType.PM

        ctx = InvocationContext(
            workspace_id=req.workspace_id,
            agent_type=agent_type,
            user_message=req.message,
            mode="conversation",
            locale=req.locale,
            target_agent=req.target_agent,
            system_prompt=self._build_system_prompt(req),
            task_context=req.context,
            metadata={
                "graph_id": req.graph_id,
                "sid": sid,
            },
        )

        yield _sse("session", "start", {
            "type": "conversation", "workspaceId": req.workspace_id,
        }, sid)

        try:
            async for event in self._pipeline.run(ctx, terminal=self._agentic_terminal):
                for frame in self._event_to_sse(sid, event):
                    yield frame
        except Exception as exc:
            logger.error("Conversation failed: %s", exc, exc_info=True)
            yield _sse("session", "error", {"error": str(exc)}, sid)
            yield _sse_done()
            return

        # Persist to session history
        from .models import Message
        user_msg = Message(role="user", content=req.message, workspace_id=req.workspace_id)
        await self._session.append(req.workspace_id, agent_type, user_msg)
        if ctx.reply:
            asst_msg = Message(role="assistant", content=ctx.reply, workspace_id=req.workspace_id)
            await self._session.append(req.workspace_id, agent_type, asst_msg)

        yield _sse("session", "complete", {"status": "success"}, sid)
        yield _sse_done()

    async def _agentic_terminal(
        self, ctx: InvocationContext
    ) -> AsyncIterator[AgentEvent]:
        """Terminal handler: LLM + tool ReAct loop with streaming."""
        messages = self._build_messages(ctx)
        tool_schemas = await self._tool_manager.get_schemas()
        if not tool_schemas:
            tool_schemas = None

        full_reply = ""

        def _evt(etype: str, **payload: Any) -> AgentEvent:
            return AgentEvent(
                type=etype,
                agent_type=ctx.agent_type,
                workspace_id=ctx.workspace_id,
                payload=payload,
            )

        for iteration in range(self._max_iterations):
            content_parts: list[str] = []
            tool_calls_acc: list[dict[str, Any]] = []

            async for chunk in self._llm.chat_stream(
                messages, tools=tool_schemas
            ):
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
                for evt in await self._execute_tool_calls(
                    tool_calls_acc, ctx, messages
                ):
                    yield evt
                continue

            joined = "".join(content_parts)
            remaining = joined[len(full_reply):]
            if remaining:
                full_reply += remaining
                yield _evt("content_delta", delta=remaining)
            break

        ctx.reply = full_reply

    async def _execute_tool_calls(
        self,
        tool_calls: list[dict[str, Any]],
        ctx: InvocationContext,
        messages: list[dict[str, Any]],
    ) -> list[AgentEvent]:
        """Execute tool calls and append results to messages. Returns events."""
        events: list[AgentEvent] = []

        def _evt(etype: str, **payload: Any) -> AgentEvent:
            return AgentEvent(
                type=etype,
                agent_type=ctx.agent_type,
                workspace_id=ctx.workspace_id,
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

            display_name = await self._tool_manager.get_display_name(name)

            events.append(_evt(
                "tool_start", tool=name, call_id=call_id,
                display_name=display_name,
                arguments=_truncate_dict(args, 2000),
            ))

            args["_workspace_id"] = ctx.workspace_id
            t0 = time.monotonic()
            result = await self._tool_manager.execute(name, args)
            duration_ms = int((time.monotonic() - t0) * 1000)

            ctx.tool_results.append({
                "tool": name, "ok": result.ok,
                "result": result.output[:500] if result.output else "",
            })

            events.append(_evt(
                "tool_result", tool=name, call_id=call_id,
                display_name=display_name,
                ok=result.ok, output=result.output[:3000],
                duration_ms=duration_ms,
            ))

            messages.append({
                "role": "tool",
                "tool_call_id": tc.get("id", ""),
                "content": result.output,
            })

        return events

    def _build_messages(self, ctx: InvocationContext) -> list[dict[str, Any]]:
        system = ctx.enriched_prompt or ctx.system_prompt
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system},
        ]
        for msg in ctx.history:
            messages.append({"role": msg.role, "content": msg.content})
        if ctx.extra_messages:
            messages.extend(ctx.extra_messages)
        messages.append({"role": "user", "content": ctx.user_message})
        return messages

    def _event_to_sse(self, sid: str, event: AgentEvent) -> list[str]:
        etype = event.type
        payload = event.payload or {}

        if etype == "content_delta":
            return [_sse("content", "delta", {"delta": payload.get("delta", "")}, sid)]

        if etype == "tool_start":
            name = payload.get("tool", "")
            call_id = payload.get("call_id", f"tool_{name}")
            display_name = payload.get("display_name", "")
            label = display_name or name
            return [
                _sse("tool", "start", {
                    "call_id": call_id,
                    "tool_name": name,
                    "display_name": display_name,
                    "input": payload.get("arguments"),
                }, sid),
                _sse("timeline", "step", {
                    "step_id": call_id,
                    "label": label,
                    "status": "running",
                }, sid),
            ]

        if etype == "tool_result":
            name = payload.get("tool", "")
            call_id = payload.get("call_id", f"tool_{name}")
            display_name = payload.get("display_name", "")
            label = display_name or name
            ok = payload.get("ok")
            return [
                _sse("tool", "result", {
                    "call_id": call_id,
                    "tool_name": name,
                    "display_name": display_name,
                    "status": "completed" if ok else "error",
                    "output": payload.get("output", ""),
                    "duration_ms": payload.get("duration_ms"),
                }, sid),
                _sse("timeline", "step", {
                    "step_id": call_id,
                    "label": label,
                    "status": "completed" if ok else "error",
                }, sid),
            ]

        return [_sse("content", "payload", {"payload": payload}, sid)]


def _truncate_dict(d: dict[str, Any], max_chars: int = 2000) -> dict[str, Any]:
    """Shallow-truncate dict values so the JSON repr stays within *max_chars*."""
    out: dict[str, Any] = {}
    budget = max_chars
    for k, v in d.items():
        if k.startswith("_"):
            continue
        s = json.dumps(v, ensure_ascii=False, default=str)
        if len(s) > budget:
            out[k] = s[:budget] + "…"
            break
        out[k] = v
        budget -= len(s)
    return out


def _sse(category: str, action: str, payload: dict[str, Any], sid: str) -> str:
    data: dict[str, Any] = {"sid": sid}
    data.update(payload)
    return f"event: {category}:{action}\ndata: {json.dumps(data)}\n\n"


def _sse_done() -> str:
    return "data: [DONE]\n\n"
