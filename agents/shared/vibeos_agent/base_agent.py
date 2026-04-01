"""BaseAgent – abstract base every VibeOS domain agent must extend."""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
import re as _re
import uuid
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

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
from .registry import AgentManifest, CapabilityDef, RegistryClient
from .session import SessionManager
from .tools import ToolRegistry

logger = logging.getLogger(__name__)

# Phase dependency graph: each phase lists the upstream phases whose artifacts
# should be injected as context.
PHASE_CONTEXT: dict[str, list[str]] = {
    "requirement": [],
    "architecture": ["requirement"],
    "design": ["requirement", "architecture"],
    "development": ["requirement", "architecture", "design"],
    "testing": ["development", "design"],
    "deployment": ["development", "testing"],
    "monitoring": ["deployment"],
}

# Maps agent type keys to their corresponding SDLC phase name.
AGENT_PHASE_MAP: dict[str, str] = {
    "requirement": "requirement",
    "architecture": "architecture",
    "design": "design",
    "development": "development",
    "testing": "testing",
    "cicd": "deployment",
    "monitoring": "monitoring",
}


class BaseAgent(ABC):
    """Abstract base every VibeOS domain agent must extend."""

    agent_type: AgentType
    capabilities: list[CapabilityContract] = []
    system_prompt: str = "You are a helpful AI agent."
    chat_prompt: str | None = None

    manifest: AgentManifest | None = None

    def __init__(self) -> None:
        self.clients = ClientContainer()
        self.tool_registry = ToolRegistry()
        self._heartbeat_task: asyncio.Task[None] | None = None
        self._task_context_var: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
            "task_context", default=None,
        )
        self._tool_results_var: contextvars.ContextVar[list[dict[str, Any]]] = contextvars.ContextVar(
            "tool_results", default=[],
        )

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

    @property
    def _tool_results(self) -> list[dict[str, Any]]:
        return self._tool_results_var.get([])

    @_tool_results.setter
    def _tool_results(self, val: list[dict[str, Any]]) -> None:
        self._tool_results_var.set(val)

    # ------------------------------------------------------------------
    # Abstract / overridable interface
    # ------------------------------------------------------------------

    @abstractmethod
    async def execute(self, task: AgentTask) -> AsyncIterator[AgentEvent]:
        """Run a structured task and yield progress events."""
        ...

    async def chat(
        self, message: str, *, workspace_id: str, context: dict[str, Any] | None = None
    ) -> AsyncIterator[Message]:
        """Handle a free-form chat message and yield response messages.

        Default implementation: append user message to session, call LLM,
        persist reply, publish status transitions. Subclasses can override.
        """
        from .models import AgentStatus

        user_msg = self._make_user_message(workspace_id, message)
        await self.session.append(workspace_id, self.agent_type, user_msg)

        try:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.RUNNING
            )
            reply_text = await self._call_llm(message, workspace_id=workspace_id)
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

        Default implementation uses ``chat_prompt`` (if set) as system prompt
        override for conversational style. Subclasses can override.
        """
        from .models import AgentStatus

        user_msg = self._make_user_message(workspace_id, message)
        await self.session.append(workspace_id, self.agent_type, user_msg)

        try:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.RUNNING
            )
            full_reply = ""
            async for delta in self._call_llm_stream(
                message,
                workspace_id=workspace_id,
                system_prompt_override=self.chat_prompt,
            ):
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

    async def _call_llm(
        self,
        user_message: str,
        *,
        workspace_id: str,
        extra_messages: list[dict[str, str]] | None = None,
        enrich_context: bool = True,
        repo_context: dict[str, Any] | None = None,
    ) -> str:
        enriched_system = self.system_prompt

        if enrich_context:
            enriched_system = await self._build_enriched_prompt(
                workspace_id, user_message, repo_context=repo_context
            )

        history = await self.session.get_history(workspace_id, self.agent_type)
        messages: list[dict[str, str]] = [
            {"role": "system", "content": enriched_system}
        ]
        for msg in history:
            messages.append({"role": msg.role, "content": msg.content})
        if extra_messages:
            messages.extend(extra_messages)
        messages.append({"role": "user", "content": user_message})

        result = await self.llm.chat(messages)
        reply = result.get("choices", [{}])[0].get("message", {}).get("content", "")

        try:
            await self.memory.add_memory(
                f"User asked: {user_message}\nAgent replied: {reply[:500]}",
                workspace_id=workspace_id,
                agent_type=_enum_val(self.agent_type),
            )
        except Exception:
            logger.debug("Failed to persist memory after _call_llm", exc_info=True)

        return reply

    async def _call_llm_stream(
        self,
        user_message: str,
        *,
        workspace_id: str,
        extra_messages: list[dict[str, str]] | None = None,
        enrich_context: bool = True,
        system_prompt_override: str | None = None,
        repo_context: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        """Stream LLM response token-by-token. Yields content deltas."""
        enriched_system = system_prompt_override or self.system_prompt
        if enrich_context and not system_prompt_override:
            enriched_system = await self._build_enriched_prompt(
                workspace_id, user_message, repo_context=repo_context
            )

        history = await self.session.get_history(workspace_id, self.agent_type)
        messages: list[dict[str, str]] = [
            {"role": "system", "content": enriched_system}
        ]
        for msg in history:
            messages.append({"role": msg.role, "content": msg.content})
        if extra_messages:
            messages.extend(extra_messages)
        messages.append({"role": "user", "content": user_message})

        full_reply = ""
        async for chunk in self.llm.chat_stream(messages):
            delta = (
                chunk.get("choices", [{}])[0]
                .get("delta", {})
                .get("content", "")
            )
            if delta:
                full_reply += delta
                yield delta

        try:
            await self.memory.add_memory(
                f"User asked: {user_message}\nAgent replied: {full_reply[:500]}",
                workspace_id=workspace_id,
                agent_type=_enum_val(self.agent_type),
            )
        except Exception:
            logger.debug("Failed to persist memory after _call_llm_stream", exc_info=True)

    def _get_tool_schemas(self) -> list[dict[str, Any]] | None:
        """Return tool schemas from the registry (single source of truth).

        Class-level ``self.tools`` schemas are intentionally excluded: tools
        without a registered executor cause runtime errors when the LLM invokes
        them.  All callable tools must be registered in ``self.tool_registry``.
        """
        if self.tool_registry.has_tools:
            return self.tool_registry.get_schemas()
        return None

    async def _process_tool_calls(
        self,
        tool_calls: list[dict[str, Any]],
        workspace_id: str,
        messages: list[dict[str, Any]],
    ) -> None:
        """Execute tool calls and append results to the message list."""
        for tc in tool_calls:
            fn = tc.get("function", {})
            tool_name = fn.get("name", "")
            raw_args = fn.get("arguments", "{}")
            tc_id = tc.get("id", "")

            if isinstance(raw_args, str):
                try:
                    parsed_args = json.loads(raw_args) if raw_args else {}
                except json.JSONDecodeError:
                    parsed_args = {}
            else:
                parsed_args = raw_args

            parsed_args["_workspace_id"] = workspace_id
            if self._current_task_context:
                parsed_args.setdefault("_context", self._current_task_context)

            logger.info(
                "Tool call [%s] %s(%s)",
                _enum_val(self.agent_type), tool_name, list(parsed_args.keys()),
            )

            try:
                await self.ws.publish_log(
                    workspace_id, _enum_val(self.agent_type),
                    f"Calling tool: {tool_name}",
                    level="info",
                )
            except Exception:
                logger.debug("Failed to publish tool log for %s", tool_name, exc_info=True)

            tool_result = await self.tool_registry.execute(tool_name, parsed_args)
            self._tool_results.append({
                "tool": tool_name,
                "ok": tool_result.ok,
                "result": tool_result.output[:500],
            })
            messages.append({
                "role": "tool",
                "tool_call_id": tc_id,
                "content": tool_result.output,
            })

    async def _persist_memory(self, user_message: str, reply: str, workspace_id: str) -> None:
        try:
            await self.memory.add_memory(
                f"User asked: {user_message}\nAgent replied: {reply[:500]}",
                workspace_id=workspace_id,
                agent_type=_enum_val(self.agent_type),
            )
        except Exception:
            logger.debug("Failed to persist memory", exc_info=True)

    async def _build_tool_loop_messages(
        self,
        user_message: str,
        *,
        workspace_id: str,
        extra_messages: list[dict[str, Any]] | None = None,
        enrich_context: bool = True,
        repo_context: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Build the initial message list for a tool loop."""
        enriched_system = self.system_prompt
        if enrich_context:
            enriched_system = await self._build_enriched_prompt(
                workspace_id, user_message, repo_context=repo_context
            )
        history = await self.session.get_history(workspace_id, self.agent_type)
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": enriched_system}
        ]
        for msg in history:
            messages.append({"role": msg.role, "content": msg.content})
        if extra_messages:
            messages.extend(extra_messages)
        messages.append({"role": "user", "content": user_message})
        return messages

    async def _call_llm_with_tools(
        self,
        user_message: str,
        *,
        workspace_id: str,
        extra_messages: list[dict[str, Any]] | None = None,
        enrich_context: bool = True,
        max_iterations: int = 5,
        repo_context: dict[str, Any] | None = None,
    ) -> str:
        """Call LLM with tool-use loop: if the model returns tool_calls, execute
        them and feed results back until a final text response is produced.

        Falls back to ``_call_llm`` behavior when no tools are registered.
        """
        tool_schemas = self._get_tool_schemas()
        if not tool_schemas:
            self._tool_results = []
            return await self._call_llm(
                user_message,
                workspace_id=workspace_id,
                extra_messages=extra_messages,
                enrich_context=enrich_context,
                repo_context=repo_context,
            )

        self._tool_results = []
        messages = await self._build_tool_loop_messages(
            user_message,
            workspace_id=workspace_id,
            extra_messages=extra_messages,
            enrich_context=enrich_context,
            repo_context=repo_context,
        )

        for _iteration in range(max_iterations):
            result = await self.llm.chat(messages, tools=tool_schemas)
            choice = result.get("choices", [{}])[0]
            msg = choice.get("message", {})
            tool_calls = msg.get("tool_calls")

            if not tool_calls:
                reply = msg.get("content", "")
                await self._persist_memory(user_message, reply, workspace_id)
                return reply

            messages.append(msg)
            await self._process_tool_calls(tool_calls, workspace_id, messages)

        for msg in reversed(messages):
            if isinstance(msg, dict) and msg.get("role") in ("assistant", "system"):
                content = msg.get("content") or ""
                if content:
                    return content
        return ""

    async def _call_llm_with_tools_stream(
        self,
        user_message: str,
        *,
        workspace_id: str,
        extra_messages: list[dict[str, Any]] | None = None,
        enrich_context: bool = True,
        max_iterations: int = 5,
        repo_context: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        """Like ``_call_llm_with_tools`` but yields content deltas for the final
        text response. Tool-call iterations use streaming to detect tool_calls vs
        text, but only yield deltas on the final (text) iteration.
        Falls back to ``_call_llm_stream`` when no tools are registered.
        """
        tool_schemas = self._get_tool_schemas()
        if not tool_schemas:
            self._tool_results = []
            async for delta in self._call_llm_stream(
                user_message,
                workspace_id=workspace_id,
                extra_messages=extra_messages,
                enrich_context=enrich_context,
                repo_context=repo_context,
            ):
                yield delta
            return

        self._tool_results = []
        messages = await self._build_tool_loop_messages(
            user_message,
            workspace_id=workspace_id,
            extra_messages=extra_messages,
            enrich_context=enrich_context,
            repo_context=repo_context,
        )

        full_reply = ""

        for _iteration in range(max_iterations):
            content_parts: list[str] = []
            tool_calls_acc: list[dict[str, Any]] = []

            async for chunk in self.llm.chat_stream(messages, tools=tool_schemas):
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
                        yield content

            if tool_calls_acc:
                buffered_content = "".join(content_parts) if content_parts else None
                assistant_msg: dict[str, Any] = {
                    "role": "assistant",
                    "content": buffered_content,
                    "tool_calls": tool_calls_acc,
                }
                messages.append(assistant_msg)
                await self._process_tool_calls(tool_calls_acc, workspace_id, messages)
                continue

            joined = "".join(content_parts)
            remaining = joined[len(full_reply):]
            if remaining:
                full_reply += remaining
                yield remaining
            break

        await self._persist_memory(user_message, full_reply, workspace_id)

    async def _build_enriched_prompt(
        self,
        workspace_id: str,
        user_message: str,
        *,
        repo_context: dict[str, Any] | None = None,
    ) -> str:
        """Compose a context-aware system prompt from Memory + RAG + Knowledge + Upstream Artifacts."""
        sections = [self.system_prompt]

        if repo_context and repo_context.get("gitlab_primary_project"):
            primary_project = repo_context["gitlab_primary_project"]
            gitlab_url = repo_context.get("gitlab_primary_url", "")
            branch_strategy = repo_context.get("gitlab_branch_strategy", "feature")
            branch_default = repo_context.get("gitlab_branch_default", "main")
            computed_branch = repo_context.get("gitlab_branch", branch_default)

            strategy_desc = {
                "feature": "create a feature branch per task (feat/<slug>) and open a Merge Request to main",
                "direct": f"commit directly to the default branch ({branch_default})",
                "gitflow": "use feature/<slug> branch, merge via MR to develop",
            }.get(branch_strategy, branch_strategy)

            all_repos = repo_context.get("gitlab_repos", [])
            extra_repos = [r for r in all_repos if r.get("projectId") != primary_project]

            repo_section = f"""## Project Repository

Primary: {primary_project}  ({gitlab_url})
Branch strategy: {strategy_desc}
Current branch: {computed_branch}
Default branch: {branch_default}

All source code changes MUST be committed to this repository using the `gitlab_push_file` tool.
Use `project_id = "{primary_project}"` and `branch = "{computed_branch}"` for every file commit.
After committing all files, call `gitlab_create_mr` to open a Merge Request to `{branch_default}`.
"""
            if extra_repos:
                repo_lines = "\n".join(
                    f"- {r.get('projectName', r.get('projectId'))} ({r.get('role', 'secondary')}): {r.get('projectId')}"
                    for r in extra_repos
                )
                repo_section += f"\nAdditional repos (secondary):\n{repo_lines}\n"

            sections.append(repo_section)

        try:
            upstream = await self._fetch_upstream_artifacts(workspace_id)
            if upstream:
                sections.append(upstream)
        except Exception:
            logger.warning("Failed to fetch upstream artifacts for ws=%s", workspace_id, exc_info=True)

        try:
            memory_ctx = await self.memory.assemble_context(
                workspace_id, _enum_val(self.agent_type), user_message
            )
            if memory_ctx:
                sections.append(
                    f"## Context from past interactions and preferences\n{memory_ctx}"
                )
        except Exception:
            logger.warning("Failed to assemble memory context for ws=%s", workspace_id, exc_info=True)

        try:
            rag_results = await self.rag.search(
                user_message, workspace_id=workspace_id, top_k=3
            )
            if rag_results:
                chunks = "\n---\n".join(
                    r.get("text", r.get("content", "")) for r in rag_results
                )
                sections.append(f"## Relevant project documents\n{chunks}")
        except Exception:
            logger.warning("RAG search failed for ws=%s", workspace_id, exc_info=True)

        try:
            patterns = await self.knowledge.search(
                user_message, access_level="enterprise", limit=3
            )
            if patterns:
                pattern_text = "\n".join(
                    f"- {p.get('name', '')}: {p.get('description', '')}"
                    for p in patterns
                )
                sections.append(f"## Organization best practices\n{pattern_text}")
        except Exception:
            logger.warning("Knowledge search failed for ws=%s", workspace_id, exc_info=True)

        return "\n\n".join(sections)

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

    async def _fetch_upstream_artifacts(self, workspace_id: str) -> str:
        """Fetch artifacts from upstream phases for context enrichment."""
        agent_key = _enum_val(self.agent_type)
        phase_key = AGENT_PHASE_MAP.get(agent_key, agent_key)
        upstream_phases = PHASE_CONTEXT.get(phase_key, [])
        if not upstream_phases:
            return ""

        phase_to_agent = {v: k for k, v in AGENT_PHASE_MAP.items()}

        sections: list[str] = []
        for up_phase in upstream_phases:
            upstream_agent = phase_to_agent.get(up_phase, up_phase)
            try:
                artifacts = await self.workspace_svc.list_artifacts(
                    workspace_id, agent_type=upstream_agent
                )
                for art in artifacts[:5]:
                    title = art.get("title", "untitled")
                    content = art.get("content", "")[:2000]
                    art_type = art.get("type", "unknown")
                    sections.append(
                        f"### [{up_phase}] {title} ({art_type})\n{content}"
                    )
            except Exception:
                logger.warning(
                    "Failed to fetch upstream artifacts for phase=%s agent=%s",
                    up_phase, upstream_agent, exc_info=True,
                )
                continue

        if not sections:
            return ""
        return "## Upstream Artifacts\n\n" + "\n\n---\n\n".join(sections)

    async def _fetch_related_requirement_context(self, workspace_id: str, requirement_id: str) -> str:
        """Load artifacts from related requirements based on relationship type."""
        try:
            related = await self.workspace_svc.get_related_artifacts(workspace_id, requirement_id)
        except Exception:
            logger.warning("Failed to fetch related requirement context: ws=%s req=%s", workspace_id, requirement_id, exc_info=True)
            return ""

        TRUNCATION = {
            "depends_on": 3000, "parent_of": 2000, "related_to": 1500,
            "evolves_from": 5000, "conflicts_with": 2000,
        }
        LABELS = {
            "depends_on": "Dependency", "parent_of": "Parent Requirement",
            "related_to": "Related Requirement", "evolves_from": "Previous Version",
            "conflicts_with": "Conflicting Requirement",
        }

        sections: list[str] = []
        for rel_type, artifacts in related.items():
            limit = TRUNCATION.get(rel_type, 2000)
            label = LABELS.get(rel_type, rel_type)
            for art in artifacts[:5]:
                content = art.get("content", "")[:limit]
                title = art.get("title", "untitled")
                art_type = art.get("type", "unknown")
                sections.append(f"### [{label}] {title} ({art_type})\n{content}")

        if not sections:
            return ""
        return "## Related Requirements Context\n\n" + "\n\n---\n\n".join(sections)

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
        """Persist an artifact to workspace-svc and auto-index to RAG."""
        result = await self.workspace_svc.create_artifact(
            workspace_id,
            agent_type=_enum_val(self.agent_type),
            artifact_type=artifact_type,
            title=title,
            content=content,
            execution_id=execution_id,
            metadata=metadata,
        )
        if len(content) > 100:
            await self._auto_index_artifact(workspace_id, title, content, artifact_type)
        return result

    async def _auto_index_artifact(
        self, workspace_id: str, title: str, content: str, doc_type: str
    ) -> None:
        try:
            await self.rag.index_documents(
                workspace_id,
                [{"title": title, "content": content[:8000], "doc_type": doc_type}],
            )
        except Exception:
            logger.warning("Auto-index artifact failed: ws=%s title=%s", workspace_id, title, exc_info=True)

    async def _upsert_artifact(
        self,
        workspace_id: str,
        *,
        artifact_type: str,
        title: str,
        content: str,
        execution_id: str | None = None,
        metadata: str = "{}",
    ) -> dict[str, Any]:
        """Upsert an artifact via its execution provenance."""
        result = await self.workspace_svc.upsert_artifact(
            workspace_id,
            agent_type=_enum_val(self.agent_type),
            artifact_type=artifact_type,
            title=title,
            content=content,
            execution_id=execution_id,
            metadata=metadata,
        )
        if self.rag and content and len(content) > 100:
            try:
                await self.rag.index_documents(
                    workspace_id,
                    [{"title": title, "content": content[:8000], "doc_type": artifact_type}],
                )
            except Exception:
                logger.warning("RAG index failed during upsert_artifact: ws=%s", workspace_id, exc_info=True)
        return result

    # ------------------------------------------------------------------
    # Global registry: self-registration & heartbeat
    # ------------------------------------------------------------------

    def _build_capability_defs(self) -> list[CapabilityDef]:
        """Derive capability definitions from class-level capabilities + registered tools."""
        agent_key = _enum_val(self.agent_type)
        defs: list[CapabilityDef] = []

        for cap in self.capabilities:
            defs.append(CapabilityDef(
                name=f"{agent_key}.{cap.name}",
                provider=agent_key,
                description=f"{cap.name} capability",
                source=agent_key,
            ))

        for schema in self.tool_registry.get_schemas():
            fn = schema.get("function", {})
            name = fn.get("name", "")
            if name:
                defs.append(CapabilityDef(
                    name=f"{agent_key}.{name}",
                    provider=agent_key,
                    description=fn.get("description", ""),
                    input_schema=fn.get("parameters", {}),
                    source=agent_key,
                ))

        return defs

    async def register_with_registry(self) -> None:
        """Register this agent's manifest (intents, templates, capabilities) globally."""
        agent_key = _enum_val(self.agent_type)
        manifest = self.manifest or AgentManifest(
            agent_type=agent_key,
            capabilities=self._build_capability_defs(),
        )
        try:
            result = await self._registry.register_manifest(manifest)
            logger.info(
                "Registered manifest for %s: %s", agent_key, result,
            )
        except Exception as exc:
            logger.warning("Failed to register with global registry: %s", exc)

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
