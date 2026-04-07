"""BaseAgent – abstract base every VibeOS domain agent must extend."""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import re as _re
import uuid
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator, AsyncIterator
from datetime import datetime, timezone
from typing import Any, cast

from .clients._utils import _enum_val
from .container import ClientContainer
from .models import (
    AgentEvent,
    AgentTask,
    AgentType,
    CapabilityContract,
    Message,
    RichBlock,
)
from .phases import AGENT_PHASE_MAP
from .registry import AgentManifest, CapabilityDef
from .session import SessionManager
from .tools import ToolManager

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    """Abstract base every VibeOS domain agent must extend."""

    agent_type: AgentType
    capabilities: list[CapabilityContract] = []
    system_prompt: str = "You are a helpful AI agent."
    chat_prompt: str | None = None

    manifest: AgentManifest | None = None

    def __init__(self) -> None:
        self.clients = ClientContainer()
        self.tool_manager = ToolManager()
        self._heartbeat_task: asyncio.Task[None] | None = None
        self._task_context_var: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
            "task_context", default=None,
        )
        self._tool_results_var: contextvars.ContextVar[list[dict[str, Any]]] = contextvars.ContextVar(
            "tool_results", default=[],
        )
        self._current_task_var: contextvars.ContextVar[Any | None] = contextvars.ContextVar(
            "current_task", default=None,
        )
        self._register_standard_tools()

    def _register_standard_tools(self) -> None:
        """Register all standard tools in the base class.

        All agents get the full suite of tools. The LLM decides which to call
        based on the phase context and system prompt guidance.
        Subclasses can still call register_many() for domain-specific extras.
        """
        agent_key = _enum_val(self.agent_type) if hasattr(self, "agent_type") else "unknown"
        try:
            from .tools.workspace_tools import create_workspace_tools
            self.tool_manager.register_many(
                create_workspace_tools(self.workspace_svc, agent_key, rag_client=self.rag),
            )
        except Exception:
            logger.debug("Failed to register workspace tools", exc_info=True)
        try:
            from .tools.gitlab_tools import create_gitlab_tools
            self.tool_manager.register_many(create_gitlab_tools())
        except Exception:
            logger.debug("Failed to register gitlab tools", exc_info=True)
        try:
            from .tools.delegation_tools import create_delegation_tools
            self.tool_manager.register_many(create_delegation_tools(agent_key))
        except Exception:
            logger.debug("Failed to register delegation tools", exc_info=True)

    # Backward-compatible aliases so existing subclass code keeps working.
    @property
    def workspace_svc(self):
        return self.clients.workspace

    @property
    def llm(self):
        return self.clients.llm

    @property
    def ws(self):
        return self.clients.ws

    @property
    def session(self):
        return self.clients.session

    @property
    def memory(self):
        return self.clients.memory

    @property
    def rag(self):
        return self.clients.rag

    @property
    def knowledge(self):
        return self.clients.knowledge

    @property
    def _registry(self):
        return self.clients.registry

    @property
    def _current_task_context(self) -> dict[str, Any] | None:
        return self._task_context_var.get(None)

    @_current_task_context.setter
    def _current_task_context(self, val: dict[str, Any] | None) -> None:
        self._task_context_var.set(val)

    def _set_current_task(self, task: Any) -> None:
        self._current_task_var.set(task)

    def _get_current_task(self) -> Any | None:
        return self._current_task_var.get(None)

    def _effective_system_prompt(self) -> str:
        """Return the system prompt, preferring a task-level override if set."""
        task = self._get_current_task()
        if task and getattr(task, "system_prompt", None):
            return task.system_prompt
        return self.system_prompt

    @property
    def _tool_results(self) -> list[dict[str, Any]]:
        return self._tool_results_var.get([])

    @_tool_results.setter
    def _tool_results(self, val: list[dict[str, Any]]) -> None:
        self._tool_results_var.set(val)

    # ------------------------------------------------------------------
    # Middleware pipeline (shared with ConversationEngine)
    # ------------------------------------------------------------------

    def _build_pipeline(self):
        """Construct the standard middleware stack for this agent.

        Returns a :class:`MiddlewarePipeline` configured with the same
        middleware layers that ``ConversationEngine`` uses, ensuring a
        unified cross-cutting behaviour (observability, session, context
        enrichment, memory persistence, WS status).

        Subclasses may override to customise the stack.
        """
        from .middleware import (
            ContextEnricherMiddleware,
            MemoryWriterMiddleware,
            MiddlewarePipeline,
            ObservabilityMiddleware,
            SessionMiddleware,
            TokenBudget,
            WSStatusMiddleware,
        )

        pipeline = MiddlewarePipeline()
        pipeline.use(ObservabilityMiddleware())
        pipeline.use(WSStatusMiddleware(self.ws))
        pipeline.use(SessionMiddleware(self.session, budget=TokenBudget()))
        if self.memory:
            enricher = ContextEnricherMiddleware(
                self.workspace_svc, self.memory, self.rag, self.knowledge,
                tool_manager=self.tool_manager,
            )
            pipeline.use(enricher)
            pipeline.use(MemoryWriterMiddleware(self.memory))
        return pipeline

    async def _make_tool_terminal(self, ctx):
        """Terminal handler: runs the unified streaming tool loop."""
        from .middleware.base import InvocationContext
        from .tool_loop import run_tool_loop_stream

        await self.tool_manager.ensure_workspace_providers(
            self.workspace_svc, ctx.workspace_id,
        )
        tool_schemas = await self.tool_manager.get_schemas()
        messages = self._build_pipeline_messages(ctx)

        full_reply_parts: list[str] = []
        async for evt in run_tool_loop_stream(
            messages,
            llm=self.llm,
            tool_manager=self.tool_manager,
            tool_schemas=tool_schemas or [],
            workspace_id=ctx.workspace_id,
            agent_type=ctx.agent_type,
            task_context=ctx.task_context,
            collect_results=ctx.tool_results,
        ):
            if evt.type == "content_delta":
                full_reply_parts.append(evt.payload.get("delta", ""))
            yield evt

        ctx.reply = "".join(full_reply_parts)

    def _build_pipeline_messages(self, ctx) -> list[dict[str, Any]]:
        """Build the LLM message list from an InvocationContext."""
        system = ctx.enriched_prompt or ctx.system_prompt
        messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
        for msg in ctx.history:
            messages.append({"role": msg.role, "content": msg.content})
        if ctx.extra_messages:
            messages.extend(ctx.extra_messages)
        messages.append({"role": "user", "content": ctx.user_message})
        return messages

    async def _run_pipeline_stream(
        self,
        *,
        workspace_id: str,
        user_message: str,
        task_context: dict[str, Any] | None = None,
        repo_context: dict[str, Any] | None = None,
        system_prompt: str | None = None,
        mode: str = "execute",
    ) -> AsyncIterator[AgentEvent]:
        """Execute the full middleware pipeline in streaming mode.

        This is the single execution path for all agent operations
        (task execution, conversation, and chat).
        """
        from .middleware.base import InvocationContext

        ctx = InvocationContext(
            workspace_id=workspace_id,
            agent_type=self.agent_type,
            user_message=user_message,
            mode=mode,
            system_prompt=system_prompt or self._effective_system_prompt(),
            task_context=task_context,
            repo_context=repo_context,
        )

        pipeline = self._build_pipeline()
        async for event in pipeline.run(ctx, terminal=self._make_tool_terminal):
            yield event

        self._tool_results = ctx.tool_results

    async def _run_pipeline(
        self,
        *,
        workspace_id: str,
        user_message: str,
        task_context: dict[str, Any] | None = None,
        repo_context: dict[str, Any] | None = None,
        system_prompt: str | None = None,
        model: str | None = None,
    ) -> str:
        """Non-streaming pipeline execution.  Returns the final reply text."""
        reply_parts: list[str] = []
        async for evt in self._run_pipeline_stream(
            workspace_id=workspace_id,
            user_message=user_message,
            task_context=task_context,
            repo_context=repo_context,
            system_prompt=system_prompt,
        ):
            if evt.type == "content_delta":
                reply_parts.append(evt.payload.get("delta", ""))
        return "".join(reply_parts)

    # ------------------------------------------------------------------
    # Abstract / overridable interface
    # ------------------------------------------------------------------

    @abstractmethod
    async def execute(self, task: AgentTask) -> AsyncGenerator[AgentEvent, None]:
        """Run a structured task and yield progress events."""
        if False:  # pragma: no cover — yield keeps this an async generator for type checkers
            yield cast(AgentEvent, None)

    async def chat(
        self, message: str, *, workspace_id: str, context: dict[str, Any] | None = None
    ) -> AsyncIterator[Message]:
        """Handle a free-form chat message and yield response messages.

        Uses the unified middleware pipeline for context enrichment, tool
        use, session management, and memory persistence.
        """
        from .models import AgentStatus

        user_msg = self._make_user_message(workspace_id, message)
        await self.session.append(workspace_id, self.agent_type, user_msg)

        try:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.RUNNING
            )
            reply_parts: list[str] = []
            async for evt in self._run_pipeline_stream(
                workspace_id=workspace_id,
                user_message=message,
                system_prompt=self.chat_prompt,
                mode="conversation",
            ):
                if evt.type == "content_delta":
                    reply_parts.append(evt.payload.get("delta", ""))
            reply_text = "".join(reply_parts)
            reply_msg = self._make_message(workspace_id, reply_text)
            await self.session.append(workspace_id, self.agent_type, reply_msg)
            yield reply_msg
        except Exception:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.ERROR, detail="Chat failed"
            )
            raise
        finally:
            try:
                await self.ws.publish_agent_status(
                    workspace_id, self.agent_type, AgentStatus.IDLE
                )
            except Exception:
                logger.debug("Failed to reset agent status to IDLE", exc_info=True)

    async def chat_stream(
        self, message: str, *, workspace_id: str, context: dict[str, Any] | None = None
    ) -> AsyncIterator[str]:
        """Stream chat response token-by-token as content deltas.

        Uses the unified middleware pipeline with ``chat_prompt`` (if set)
        as the system prompt override for conversational style.
        """
        from .models import AgentStatus

        user_msg = self._make_user_message(workspace_id, message)
        await self.session.append(workspace_id, self.agent_type, user_msg)

        try:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.RUNNING
            )
            full_reply = ""
            async for evt in self._run_pipeline_stream(
                workspace_id=workspace_id,
                user_message=message,
                system_prompt=self.chat_prompt,
                mode="conversation",
            ):
                if evt.type == "content_delta":
                    delta = evt.payload.get("delta", "")
                    full_reply += delta
                    yield delta

            reply_msg = self._make_message(workspace_id, full_reply)
            await self.session.append(workspace_id, self.agent_type, reply_msg)
        except Exception:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.ERROR, detail="Chat stream failed"
            )
            raise
        finally:
            try:
                await self.ws.publish_agent_status(
                    workspace_id, self.agent_type, AgentStatus.IDLE
                )
            except Exception:
                logger.debug("Failed to reset agent status to IDLE", exc_info=True)

    # ------------------------------------------------------------------
    # Helpers available to subclasses
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_json(text: str) -> dict[str, Any]:
        """Extract a JSON object from LLM output that may contain prose."""
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        m = _re.search(r"\{[\s\S]*\}", text)
        if m:
            candidate = m.group()
            while candidate:
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    last_brace = candidate.rfind("}", 0, len(candidate) - 1)
                    if last_brace == -1:
                        break
                    candidate = candidate[: last_brace + 1]
        return {"summary": text}

    def _make_user_message(self, workspace_id: str, content: str) -> Message:
        return Message(
            id=uuid.uuid4().hex,
            workspace_id=workspace_id,
            agent_type=self.agent_type,
            role="user",
            content=content,
            timestamp=datetime.now(timezone.utc),
        )

    def _make_event(
        self,
        event_type: str,
        workspace_id: str,
        payload: dict[str, Any] | None = None,
    ) -> AgentEvent:
        return AgentEvent(
            type=event_type,
            agent_type=self.agent_type,
            workspace_id=workspace_id,
            payload=payload or {},
            timestamp=datetime.now(timezone.utc),
        )

    def _make_message(
        self,
        workspace_id: str,
        content: str,
        *,
        rich_blocks: list[RichBlock] | None = None,
    ) -> Message:
        return Message(
            id=uuid.uuid4().hex,
            workspace_id=workspace_id,
            agent_type=self.agent_type,
            role="assistant",
            content=content,
            rich_blocks=rich_blocks or [],
            timestamp=datetime.now(timezone.utc),
        )

    async def _save_artifact(
        self,
        workspace_id: str,
        *,
        artifact_type: str,
        title: str,
        content: str,
        execution_id: str | None = None,
        metadata: str = "{}",
    ) -> dict[str, Any]:
        """Persist an artifact to workspace-svc (fallback for non-tool-driven saves)."""
        result = await self.workspace_svc.create_artifact(
            workspace_id,
            agent_type=_enum_val(self.agent_type),
            artifact_type=artifact_type,
            title=title,
            content=content,
            execution_id=execution_id,
            metadata=metadata,
        )
        return result

    # ------------------------------------------------------------------
    # Global registry: self-registration & heartbeat
    # ------------------------------------------------------------------

    _HOSTNAME_OVERRIDES: dict[str, str] = {
        "development": "dev-agent",
        "testing": "test-agent",
    }

    def _build_capability_defs(self) -> list[CapabilityDef]:
        """Derive capability definitions from class-level capabilities + static tools."""
        import os
        from .config import config as _cfg

        agent_key = _enum_val(self.agent_type)
        hostname = self._HOSTNAME_OVERRIDES.get(agent_key, f"{agent_key}-agent")
        agent_base_url = os.getenv(
            "AGENT_BASE_URL",
            f"http://{hostname}:{_cfg.port}",
        )
        execute_endpoint = f"{agent_base_url}/api/conversation/stream"
        defs: list[CapabilityDef] = []

        for cap in self.capabilities:
            defs.append(CapabilityDef(
                name=f"{agent_key}.{cap.name}",
                provider=agent_key,
                description=f"{cap.name} capability",
                endpoint=execute_endpoint,
                source=agent_key,
            ))

        for tool in self.tool_manager._static._tools.values():
            defs.append(CapabilityDef(
                name=f"{agent_key}.{tool.name}",
                provider=agent_key,
                description=tool.description,
                endpoint=execute_endpoint,
                input_schema=tool.parameters,
                source=agent_key,
            ))

        return defs

    async def register(self) -> None:
        """One-call registration: registry manifest + workspace-svc descriptor.

        Replaces the separate ``register_with_registry`` +
        ``register_descriptor`` + ``start_heartbeat`` calls in the
        ``create_agent_app`` lifespan.
        """
        try:
            await self.register_with_registry()
            self.start_heartbeat()
        except Exception:
            logger.warning("Registry registration failed for %s", _enum_val(self.agent_type))
        try:
            await self.register_descriptor()
        except Exception:
            logger.warning("Descriptor registration failed for %s", _enum_val(self.agent_type))

    async def register_with_registry(self) -> None:
        """Register this agent's manifest (intents, templates, capabilities) globally.

        When a YAML manifest is loaded (``self.manifest``), the auto-built
        capability defs (with runtime-correct endpoints) are merged in so
        that the registry always has valid endpoints regardless of what the
        YAML declared.
        """
        agent_key = _enum_val(self.agent_type)
        auto_caps = self._build_capability_defs()

        if self.manifest:
            yaml_cap_names = {c.name for c in self.manifest.capabilities}
            merged_caps = list(self.manifest.capabilities)
            for ac in auto_caps:
                if ac.name in yaml_cap_names:
                    merged_caps = [c if c.name != ac.name else ac for c in merged_caps]
                else:
                    merged_caps.append(ac)
            manifest = AgentManifest(
                agent_type=self.manifest.agent_type or agent_key,
                version=self.manifest.version,
                source=self.manifest.source,
                intents=list(self.manifest.intents),
                templates=list(self.manifest.templates),
                capabilities=merged_caps,
            )
        else:
            manifest = AgentManifest(
                agent_type=agent_key,
                capabilities=auto_caps,
            )

        try:
            result = await self._registry.register_manifest(manifest)
            logger.info(
                "Registered manifest for %s: %s", agent_key, result,
            )
        except Exception as exc:
            logger.warning("Failed to register with global registry: %s", exc)

    async def register_descriptor(self) -> None:
        """Push code-level defaults (system prompt, tools, capabilities) to workspace-svc.

        workspace-svc merges these into every workspace's agent row, preserving
        any user overrides that are already set.
        """
        import json as _json
        agent_key = _enum_val(self.agent_type)
        tool_schemas = [t.schema() for t in self.tool_manager._static._tools.values()]
        caps: dict[str, Any] = {}
        for cap in self.capabilities:
            caps[cap.name] = cap.model_dump(mode="json")

        payload = {
            "agentType": agent_key,
            "systemPrompt": self.system_prompt,
            "tools": _json.loads(_json.dumps(tool_schemas)),
            "capabilities": caps,
        }
        try:
            resp = await self.workspace_svc._http.post(
                "/api/agent-manifest", json=payload,
            )
            if resp.status_code < 300:
                logger.info("Registered descriptor for %s", agent_key)
            else:
                logger.warning("Descriptor registration returned %s", resp.status_code)
        except Exception as exc:
            logger.debug("Descriptor registration failed for %s: %s", agent_key, exc)

    async def _heartbeat_loop(self, interval: float = 30.0) -> None:
        """Periodically send heartbeats for all registered capabilities."""
        agent_key = _enum_val(self.agent_type)
        caps = self._build_capability_defs()
        while True:
            await asyncio.sleep(interval)
            for cap in caps:
                try:
                    await self._registry.heartbeat(cap.name, agent_key)
                except Exception:
                    logger.debug("Heartbeat failed for capability %s", cap.name, exc_info=True)

    def start_heartbeat(self, interval: float = 30.0) -> None:
        """Start the background heartbeat loop (call after registration)."""
        if self._heartbeat_task is None or self._heartbeat_task.done():
            self._heartbeat_task = asyncio.create_task(self._heartbeat_loop(interval))

    def stop_heartbeat(self) -> None:
        if self._heartbeat_task and not self._heartbeat_task.done():
            self._heartbeat_task.cancel()
            self._heartbeat_task = None

    async def close(self) -> None:
        self.stop_heartbeat()
        await self.clients.close()
