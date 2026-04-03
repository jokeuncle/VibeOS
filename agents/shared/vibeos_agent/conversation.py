"""ConversationEngine -- single unified agentic loop for all AI interactions.

Replaces the previous NLP/chat/workflow/home split with one conversation
abstraction: LLM + ToolManager in a ReAct loop, wrapped by the middleware
pipeline (session, enrichment, memory, observability, WS status).
"""

from __future__ import annotations

import json
import logging
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
from .tool_loop import run_tool_loop_stream
from .tools.provider import ToolManager

logger = logging.getLogger(__name__)

_DEFAULT_SYSTEM_PROMPT = """\
You are VibeOS, an AI-native SDLC platform assistant. You manage software \
projects across their full lifecycle.

You have access to tools for:
- Requirement management (create/list/update/delete requirements)
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

When the user gives a clear, explicit instruction to create, modify, or manage \
a resource, use the appropriate tool. NEVER fabricate results or pretend \
actions were taken. If you don't see the right tool, use search_tools to \
discover it first. NEVER promise to perform an action before verifying you \
have the tool for it.

IMPORTANT: Do NOT infer action intent from ambiguous acknowledgments such as \
"好的", "OK", "sure", "嗯", "好", "行". These are conversational responses, \
NOT action requests. When the user's intent is unclear, ask a clarifying \
question instead of calling any tool.

Mutating tools (create, delete, modify) require user confirmation via an \
interactive card — just call the tool and the system handles confirmation \
automatically. Do NOT manually ask the user to confirm before calling the \
tool.

Always respond in the same language as the user's message. \
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
        step_accum: list[dict[str, Any]] = []
        execution_persisted = False

        if req.workspace_id and req.workspace_id not in ("", "__home__"):
            try:
                summary = (req.message or "").strip().replace("\n", " ")[:120]
                rid: str | None = None
                if req.context:
                    raw_rid = req.context.get("requirement_id") or req.context.get("requirementId")
                    if isinstance(raw_rid, str) and raw_rid.strip():
                        rid = raw_rid.strip()
                await self._ws_client.create_execution(
                    req.workspace_id,
                    execution_id=sid,
                    intent_type="conversation",
                    intent_summary=summary or "conversation",
                    triggered_by="nlp",
                    user_message=req.message or "",
                    agent_type="pm",
                    result_type="general",
                    requirement_id=rid,
                )
                execution_persisted = True
            except Exception:
                logger.debug("create_execution for conversation skipped", exc_info=True)

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
                for frame in self._event_to_sse(
                    sid, event, step_accum if execution_persisted else None,
                ):
                    yield frame
        except Exception as exc:
            logger.error("Conversation failed: %s", exc, exc_info=True)
            if execution_persisted:
                try:
                    await self._ws_client.update_execution(
                        req.workspace_id,
                        sid,
                        status="failed",
                        error_message=str(exc),
                        steps=json.dumps(step_accum, ensure_ascii=False),
                    )
                except Exception:
                    logger.debug("update_execution (failed) skipped", exc_info=True)
            yield _sse("session", "error", {"error": str(exc)}, sid)
            yield _sse_done()
            return

        if execution_persisted:
            try:
                await self._ws_client.update_execution(
                    req.workspace_id,
                    sid,
                    status="success",
                    steps=json.dumps(step_accum, ensure_ascii=False),
                )
            except Exception:
                logger.debug("update_execution (success) skipped", exc_info=True)

        # Persist to session history
        from .models import Message
        user_msg = Message(role="user", content=req.message, workspace_id=req.workspace_id)
        await self._session.append(req.workspace_id, agent_type, user_msg)
        if ctx.reply:
            asst_msg = Message(role="assistant", content=ctx.reply, workspace_id=req.workspace_id)
            await self._session.append(req.workspace_id, agent_type, asst_msg)

        yield _sse("session", "complete", {"status": "success"}, sid)
        yield _sse_done()

    async def run_tool_continuation(
        self,
        *,
        workspace_id: str,
        tool_call_id: str,
        tool_name: str,
        arguments: dict[str, Any],
        result_text: str,
        result_ok: bool = True,
        display_name: str = "",
        locale: str = "auto",
    ) -> AsyncIterator[str]:
        """Continue conversation after a confirmed tool execution.

        Instead of a synthetic user message, injects the tool call + result
        as proper assistant/tool messages so the LLM naturally incorporates
        the outcome in a single follow-up turn.
        """
        sid = uuid.uuid4().hex
        agent_type = AgentType.PM
        label = display_name or tool_name

        execution_persisted = False
        if workspace_id and workspace_id not in ("", "__home__"):
            try:
                await self._ws_client.create_execution(
                    workspace_id,
                    execution_id=sid,
                    intent_type="conversation",
                    intent_summary=f"确认执行: {label}",
                    triggered_by="tool_confirmation",
                    user_message=f"[confirmed] {label}",
                    agent_type="pm",
                    result_type="general",
                )
                execution_persisted = True
            except Exception:
                logger.debug("create_execution for tool_continuation skipped", exc_info=True)

        yield _sse("session", "start", {
            "type": "conversation", "workspaceId": workspace_id,
        }, sid)

        step_accum: list[dict[str, Any]] = []
        status_str = "completed" if result_ok else "error"
        step_accum.append({
            "id": tool_call_id, "label": label, "status": status_str,
            "detail": result_text[:1500],
        })

        yield _sse("tool", "start", {
            "call_id": tool_call_id, "tool_name": tool_name,
            "display_name": display_name, "input": arguments,
        }, sid)
        yield _sse("tool", "result", {
            "call_id": tool_call_id, "tool_name": tool_name,
            "display_name": display_name,
            "status": status_str, "output": result_text,
        }, sid)
        yield _sse("timeline", "step", {
            "step_id": tool_call_id, "label": label, "status": status_str,
        }, sid)

        history = await self._session.get_history(workspace_id, agent_type, limit=50)
        system = self._build_system_prompt(ConversationRequest(
            workspace_id=workspace_id, message="", locale=locale,
        ))
        messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
        for msg in history:
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({
            "role": "assistant", "content": None,
            "tool_calls": [{
                "id": tool_call_id, "type": "function",
                "function": {
                    "name": tool_name,
                    "arguments": json.dumps(arguments, ensure_ascii=False),
                },
            }],
        })
        messages.append({
            "role": "tool", "tool_call_id": tool_call_id,
            "content": result_text,
        })

        reply_parts: list[str] = []
        try:
            async for chunk in self._llm.chat_stream(messages, tools=[]):
                choice = chunk.get("choices", [{}])[0]
                delta = choice.get("delta", {})
                content = delta.get("content", "") or ""
                if content:
                    reply_parts.append(content)
                    yield _sse("content", "delta", {"delta": content}, sid)
        except Exception as exc:
            logger.error("Tool continuation LLM call failed: %s", exc, exc_info=True)
            yield _sse("session", "error", {"error": str(exc)}, sid)
            yield _sse_done()
            return

        reply = "".join(reply_parts)

        from .models import Message
        await self._session.append(
            workspace_id, agent_type,
            Message(role="user", content=f"[确认执行: {label}]", workspace_id=workspace_id),
        )
        if reply:
            await self._session.append(
                workspace_id, agent_type,
                Message(role="assistant", content=reply, workspace_id=workspace_id),
            )

        if execution_persisted:
            try:
                await self._ws_client.update_execution(
                    workspace_id, sid, status="success",
                    steps=json.dumps(step_accum, ensure_ascii=False),
                )
            except Exception:
                logger.debug("update_execution (tool_continuation) skipped", exc_info=True)

        yield _sse("session", "complete", {"status": "success"}, sid)
        yield _sse_done()

    async def _agentic_terminal(
        self, ctx: InvocationContext
    ) -> AsyncIterator[AgentEvent]:
        """Terminal handler: delegates to the unified streaming tool loop."""
        messages = self._build_messages(ctx)
        tool_schemas = await self._tool_manager.get_schemas()
        if not tool_schemas:
            tool_schemas = []

        full_reply_parts: list[str] = []
        async for evt in run_tool_loop_stream(
            messages,
            llm=self._llm,
            tool_manager=self._tool_manager,
            tool_schemas=tool_schemas,
            max_iterations=self._max_iterations,
            workspace_id=ctx.workspace_id,
            agent_type=ctx.agent_type,
            collect_results=ctx.tool_results,
            check_confirmation=True,
        ):
            if evt.type == "content_delta":
                full_reply_parts.append(evt.payload.get("delta", ""))
            yield evt

        ctx.reply = "".join(full_reply_parts)

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

    _HIDDEN_TOOLS = frozenset({"search_tools"})

    def _event_to_sse(
        self,
        sid: str,
        event: AgentEvent,
        step_accum: list[dict[str, Any]] | None = None,
    ) -> list[str]:
        etype = event.type
        payload = event.payload or {}

        if etype == "content_delta":
            return [_sse("content", "delta", {"delta": payload.get("delta", "")}, sid)]

        if etype == "tool_start":
            name = payload.get("tool", "")
            if name in self._HIDDEN_TOOLS:
                return []
            call_id = payload.get("call_id", f"tool_{name}")
            display_name = payload.get("display_name", "")
            label = display_name or name
            if step_accum is not None:
                step_accum.append({"id": call_id, "label": label, "status": "running"})
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
            if name in self._HIDDEN_TOOLS:
                return []
            call_id = payload.get("call_id", f"tool_{name}")
            display_name = payload.get("display_name", "")
            label = display_name or name
            ok = payload.get("ok")
            st = "completed" if ok else "error"
            if step_accum is not None:
                updated = False
                for row in step_accum:
                    if row.get("id") == call_id:
                        row["status"] = st
                        out = payload.get("output", "")
                        if isinstance(out, str) and out.strip():
                            row["detail"] = out[:1500]
                        updated = True
                        break
                if not updated:
                    detail = payload.get("output", "")
                    step_accum.append({
                        "id": call_id,
                        "label": label,
                        "status": st,
                        "detail": detail[:1500] if isinstance(detail, str) else "",
                    })
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
                    "status": st,
                }, sid),
            ]

        if etype == "tool_confirmation":
            name = payload.get("tool", "")
            call_id = payload.get("call_id", f"tool_{name}")
            display_name = payload.get("display_name", "")
            label = display_name or name
            if step_accum is not None:
                step_accum.append({
                    "id": call_id, "label": label,
                    "status": "awaiting_confirmation",
                })
            return [
                _sse("tool", "confirmation", {
                    "call_id": call_id,
                    "tool_name": name,
                    "display_name": display_name,
                    "arguments": payload.get("arguments"),
                    "confirmation_key": payload.get("confirmation_key", ""),
                }, sid),
                _sse("timeline", "step", {
                    "step_id": call_id,
                    "label": label,
                    "status": "awaiting_confirmation",
                }, sid),
            ]

        return [_sse("content", "payload", {"payload": payload}, sid)]


def _sse(category: str, action: str, payload: dict[str, Any], sid: str) -> str:
    data: dict[str, Any] = {"sid": sid}
    data.update(payload)
    return f"event: {category}:{action}\ndata: {json.dumps(data)}\n\n"


def _sse_done() -> str:
    return "data: [DONE]\n\n"
