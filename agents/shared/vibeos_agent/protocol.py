"""Base agent protocol – every domain agent extends BaseAgent."""

from __future__ import annotations

import contextvars
import json
import logging
import os
import uuid
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

import httpx

from .config import config
from .models import (
    AgentEvent,
    AgentStatus,
    AgentTask,
    AgentType,
    CapabilityContract,
    Message,
    PhaseStatus,
    RichBlock,
    Task,
)
from .session import SessionManager
from .tools import ToolRegistry

logger = logging.getLogger(__name__)


def _enum_val(v: "AgentType | str") -> str:
    """Safely extract the string value from an enum or plain string."""
    return v.value if hasattr(v, "value") else str(v)


class WorkspaceClient:
    """Thin async wrapper around the workspace-svc REST API."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.workspace_svc_url
        self._http = httpx.AsyncClient(base_url=self._base, timeout=30)

    async def get_phases(self, workspace_id: str) -> list[dict[str, Any]]:
        """Extract phases from the workspace GET response."""
        ws = await self.get_workspace(workspace_id)
        if isinstance(ws, dict) and "data" in ws:
            ws = ws["data"]
        return ws.get("phases", []) if isinstance(ws, dict) else []

    async def find_phase_by_type(
        self, workspace_id: str, phase_type: str
    ) -> str | None:
        """Return the phase ID for a given phase type, or None."""
        phases = await self.get_phases(workspace_id)
        for p in phases:
            if p.get("type") == phase_type:
                return p["id"]
        return None

    async def create_task(
        self, workspace_id: str, task: Task, *, phase_id: str | None = None
    ) -> dict[str, Any]:
        if not phase_id:
            phase_id = await self.find_phase_by_type(workspace_id, "architecture")
        if not phase_id:
            phases = await self.get_phases(workspace_id)
            if phases:
                phase_id = phases[0]["id"]
        resp = await self._http.post(
            f"/api/workspaces/{workspace_id}/phases/{phase_id}/tasks",
            json=task.model_dump(mode="json", exclude_none=True),
        )
        resp.raise_for_status()
        return resp.json()

    async def update_task(
        self, workspace_id: str, task_id: str, updates: dict[str, Any]
    ) -> dict[str, Any]:
        resp = await self._http.patch(
            f"/api/workspaces/{workspace_id}/tasks/{task_id}",
            json=updates,
        )
        resp.raise_for_status()
        return resp.json()

    async def complete_task(
        self, workspace_id: str, task_id: str
    ) -> dict[str, Any]:
        return await self.update_task(workspace_id, task_id, {"status": "completed"})

    async def claim_task(
        self, workspace_id: str, task_id: str, agent: str = "pm"
    ) -> dict[str, Any] | None:
        """Atomically claim a pending task. Returns None if already claimed."""
        resp = await self._http.post(
            f"/api/workspaces/{workspace_id}/tasks/{task_id}/claim",
            json={"agent": agent},
        )
        if resp.status_code == 409:
            return None
        resp.raise_for_status()
        return resp.json()

    async def get_task(
        self, workspace_id: str, task_id: str
    ) -> dict[str, Any] | None:
        """Get task info from the workspace phases (by walking phases)."""
        phases = await self.get_phases(workspace_id)
        for phase in phases:
            for task in phase.get("tasks", []):
                if task.get("id") == task_id:
                    return {**task, "phaseId": phase["id"], "phaseType": phase.get("type")}
        return None

    # ------------------------------------------------------------------
    # Agent executions (persistent)
    # ------------------------------------------------------------------

    async def create_execution(
        self,
        workspace_id: str,
        *,
        execution_id: str | None = None,
        requirement_id: str | None = None,
        task_ids: list[str] | None = None,
        intent_type: str,
        intent_summary: str = "",
        triggered_by: str = "nlp",
        user_message: str = "",
        agent_type: str = "pm",
        result_type: str = "general",
        parent_execution_id: str | None = None,
        chat_message_id: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "intentType": intent_type,
            "intentSummary": intent_summary,
            "triggeredBy": triggered_by,
            "userMessage": user_message,
            "agentType": agent_type,
            "resultType": result_type,
        }
        if execution_id:
            body["id"] = execution_id
        if requirement_id:
            body["requirementId"] = requirement_id
        if task_ids:
            body["taskIds"] = task_ids
        if parent_execution_id:
            body["parentExecutionId"] = parent_execution_id
        if chat_message_id:
            body["chatMessageId"] = chat_message_id
        resp = await self._http.post(
            f"/api/workspaces/{workspace_id}/executions", json=body,
        )
        resp.raise_for_status()
        return resp.json()

    async def update_execution(
        self,
        workspace_id: str,
        execution_id: str,
        *,
        status: str | None = None,
        error_message: str | None = None,
        task_ids: list[str] | None = None,
        chat_message_id: str | None = None,
        steps: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if status:
            body["status"] = status
        if error_message is not None:
            body["errorMessage"] = error_message
        if task_ids is not None:
            body["taskIds"] = task_ids
        if chat_message_id is not None:
            body["chatMessageId"] = chat_message_id
        if steps is not None:
            body["steps"] = steps
        resp = await self._http.patch(
            f"/api/workspaces/{workspace_id}/executions/{execution_id}",
            json=body,
        )
        resp.raise_for_status()
        return resp.json()

    async def get_tasks_by_phase(
        self, workspace_id: str, phase_id: str
    ) -> list[dict[str, Any]]:
        """Get all tasks under a specific phase."""
        phases = await self.get_phases(workspace_id)
        for phase in phases:
            if phase.get("id") == phase_id:
                return phase.get("tasks", [])
        return []

    async def update_phase(
        self,
        workspace_id: str,
        phase_id: str,
        status: PhaseStatus | None = None,
        progress: float | None = None,
    ) -> dict[str, Any]:
        if status is not None:
            resp = await self._http.patch(
                f"/api/workspaces/{workspace_id}/phases/{phase_id}/status",
                json={"status": status.value},
            )
            resp.raise_for_status()
            return resp.json()
        return {}

    async def get_workspace(self, workspace_id: str) -> dict[str, Any]:
        resp = await self._http.get(f"/api/workspaces/{workspace_id}")
        resp.raise_for_status()
        return resp.json()

    async def create_artifact(
        self,
        workspace_id: str,
        *,
        agent_type: str,
        artifact_type: str,
        title: str,
        content: str,
        execution_id: str | None = None,
        metadata: str = "{}",
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "agentType": agent_type,
            "type": artifact_type,
            "title": title,
            "content": content,
            "metadata": metadata,
        }
        if execution_id:
            body["executionId"] = execution_id
        resp = await self._http.post(
            f"/api/workspaces/{workspace_id}/artifacts", json=body
        )
        resp.raise_for_status()
        return resp.json()

    async def list_artifacts(
        self, workspace_id: str, *, phase_id: str | None = None
    ) -> list[dict[str, Any]]:
        url = f"/api/workspaces/{workspace_id}/artifacts"
        if phase_id:
            url = f"/api/workspaces/{workspace_id}/phases/{phase_id}/artifacts"
        resp = await self._http.get(url)
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", data) if isinstance(data, dict) else data

    async def get_repos_for_phase(
        self, workspace_id: str, phase_type: str
    ) -> list[dict[str, Any]]:
        """Fetch workspace repos applicable for a given phase type."""
        import logging as _log
        try:
            resp = await self._http.get(f"/api/workspaces/{workspace_id}/repos")
            resp.raise_for_status()
            repos: list[dict[str, Any]] = resp.json().get("data", [])
            # Filter by phase_types (empty list = applicable to all phases)
            result = []
            for r in repos:
                pt = r.get("phaseTypes") or []
                if not pt or phase_type in pt:
                    result.append(r)
            return result
        except Exception as exc:
            _log.getLogger(__name__).warning(
                "get_repos_for_phase failed for workspace=%s phase=%s: %s",
                workspace_id, phase_type, exc,
            )
            return []

    # ------------------------------------------------------------------
    # Requirement APIs
    # ------------------------------------------------------------------

    async def create_requirement(
        self, workspace_id: str, title: str, description: str = "", priority: str | None = None
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"title": title, "description": description}
        if priority:
            body["priority"] = priority
        resp = await self._http.post(f"/api/workspaces/{workspace_id}/requirements", json=body)
        resp.raise_for_status()
        return resp.json().get("data", {})

    async def get_requirement(self, workspace_id: str, requirement_id: str) -> dict[str, Any]:
        resp = await self._http.get(f"/api/workspaces/{workspace_id}/requirements/{requirement_id}")
        resp.raise_for_status()
        return resp.json().get("data", {})

    async def list_requirements(self, workspace_id: str) -> list[dict[str, Any]]:
        resp = await self._http.get(f"/api/workspaces/{workspace_id}/requirements")
        resp.raise_for_status()
        return resp.json().get("data", [])

    async def update_requirement(self, workspace_id: str, requirement_id: str, **updates: Any) -> dict[str, Any]:
        resp = await self._http.patch(
            f"/api/workspaces/{workspace_id}/requirements/{requirement_id}", json=updates
        )
        resp.raise_for_status()
        return resp.json().get("data", {})

    async def reset_requirement_phase(self, workspace_id: str, requirement_id: str, phase_type: str) -> None:
        resp = await self._http.post(
            f"/api/workspaces/{workspace_id}/requirements/{requirement_id}/phases/{phase_type}/reset"
        )
        resp.raise_for_status()

    async def add_requirement_relation(
        self, workspace_id: str, requirement_id: str, target_id: str, relation_type: str, description: str = ""
    ) -> dict[str, Any]:
        resp = await self._http.post(
            f"/api/workspaces/{workspace_id}/requirements/{requirement_id}/relations",
            json={"targetId": target_id, "relationType": relation_type, "description": description},
        )
        resp.raise_for_status()
        return resp.json().get("data", {})

    async def remove_requirement_relation(
        self, workspace_id: str, requirement_id: str, relation_id: str
    ) -> None:
        resp = await self._http.delete(
            f"/api/workspaces/{workspace_id}/requirements/{requirement_id}/relations/{relation_id}"
        )
        resp.raise_for_status()

    async def get_related_artifacts(
        self, workspace_id: str, requirement_id: str
    ) -> dict[str, list[dict[str, Any]]]:
        resp = await self._http.get(
            f"/api/workspaces/{workspace_id}/requirements/{requirement_id}/related-artifacts"
        )
        resp.raise_for_status()
        return resp.json().get("data", {})

    async def upsert_artifact(
        self,
        workspace_id: str,
        *,
        agent_type: str,
        artifact_type: str,
        title: str,
        content: str,
        phase_id: str | None = None,
        task_id: str | None = None,
        requirement_id: str | None = None,
        metadata: str = "{}",
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "agentType": agent_type,
            "type": artifact_type,
            "title": title,
            "content": content,
            "metadata": metadata,
        }
        if phase_id:
            body["phaseId"] = phase_id
        if task_id:
            body["taskId"] = task_id
        if requirement_id:
            body["requirementId"] = requirement_id
        resp = await self._http.put(f"/api/workspaces/{workspace_id}/artifacts", json=body)
        resp.raise_for_status()
        return resp.json().get("data", {})

    async def close(self) -> None:
        await self._http.aclose()


class LLMGatewayClient:
    """Thin async wrapper around the llm-gateway chat completions API."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.llm_gateway_url
        self._http = httpx.AsyncClient(base_url=self._base, timeout=120)

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "messages": messages,
            "temperature": temperature,
        }
        if model:
            body["model"] = model
        if tools:
            body["tools"] = tools
        if tool_choice is not None:
            body["tool_choice"] = tool_choice
        resp = await self._http.post("/api/chat/completions", json=body)
        resp.raise_for_status()
        return resp.json()

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield SSE chunks from the LLM gateway streaming endpoint.

        When tools are present, the caller must handle tool_calls in the
        accumulated delta (``delta.tool_calls`` list fragments).
        """
        body: dict[str, Any] = {
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        if model:
            body["model"] = model
        if tools:
            body["tools"] = tools
        async with self._http.stream(
            "POST", "/api/chat/completions", json=body
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line or line.startswith(":"):
                    continue
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        return
                    try:
                        yield json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

    async def close(self) -> None:
        await self._http.aclose()


class WSGatewayClient:
    """Publishes real-time events to the ws-gateway."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.ws_gateway_url
        self._publish_secret = os.environ.get("PUBLISH_SECRET", "vibeos-internal")
        self._http = httpx.AsyncClient(base_url=self._base, timeout=10)

    async def publish(self, event: dict[str, Any]) -> None:
        resp = await self._http.post(
            "/api/publish",
            json=event,
            headers={"X-Internal-Token": self._publish_secret},
        )
        resp.raise_for_status()

    async def publish_agent_status(
        self,
        workspace_id: str,
        agent_type: "AgentType | str",
        status: AgentStatus,
        *,
        detail: str = "",
        progress: float = 0.0,
    ) -> None:
        await self.publish(
            {
                "type": "agent:status",
                "workspaceId": workspace_id,
                "agentType": _enum_val(agent_type),
                "status": status.value,
                "detail": detail,
                "progress": progress,
            }
        )

    async def publish_message(
        self, workspace_id: str, message: Message
    ) -> None:
        await self.publish(
            {
                "type": "agent:message",
                "workspaceId": workspace_id,
                "payload": {"message": message.model_dump(mode="json", exclude_none=True)},
            }
        )

    async def publish_log(
        self,
        workspace_id: str,
        agent_type: str,
        message: str,
        *,
        level: str = "info",
        task_id: str = "",
    ) -> None:
        await self.publish(
            {
                "type": "agent:log",
                "workspaceId": workspace_id,
                "payload": {
                    "taskId": task_id,
                    "agent": agent_type,
                    "level": level,
                    "message": message,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            }
        )

    async def close(self) -> None:
        await self._http.aclose()


class MemoryClient:
    """Wrapper around the memory-service API for preference/context retrieval."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.memory_svc_url
        self._http = httpx.AsyncClient(base_url=self._base, timeout=30)

    async def add_memory(
        self,
        content: str,
        *,
        workspace_id: str,
        agent_type: str = "",
        user_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        resp = await self._http.post(
            "/api/memory/add",
            json={
                "content": content,
                "workspace_id": workspace_id,
                "agent_type": agent_type,
                "user_id": user_id,
                "metadata": metadata or {},
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def search_memory(
        self, query: str, *, workspace_id: str, agent_type: str = "", limit: int = 5
    ) -> list[dict[str, Any]]:
        resp = await self._http.get(
            "/api/memory/search",
            params={"query": query, "workspace_id": workspace_id, "agent_type": agent_type, "limit": limit},
        )
        resp.raise_for_status()
        return resp.json().get("memories", [])

    async def assemble_context(
        self,
        workspace_id: str,
        agent_type: str,
        user_message: str,
    ) -> str:
        resp = await self._http.post(
            "/api/context/assemble",
            json={
                "workspace_id": workspace_id,
                "agent_type": agent_type,
                "user_message": user_message,
                "org_id": config.org_id,
                "include_preferences": True,
                "include_project_memory": True,
                "include_org_memory": True,
            },
        )
        resp.raise_for_status()
        return resp.json().get("context", "")

    async def record_feedback(
        self,
        workspace_id: str,
        agent_type: str,
        action_type: str,
        *,
        context: dict[str, Any] | None = None,
        original_output: str = "",
        modified_output: str = "",
    ) -> dict[str, Any]:
        resp = await self._http.post(
            "/api/feedback",
            json={
                "workspace_id": workspace_id,
                "agent_type": agent_type,
                "action_type": action_type,
                "context": context or {},
                "original_output": original_output,
                "modified_output": modified_output,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        await self._http.aclose()


class RAGClient:
    """Wrapper around the rag-pipeline API for document search."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.rag_svc_url
        self._http = httpx.AsyncClient(base_url=self._base, timeout=30)

    async def search(
        self,
        query: str,
        *,
        workspace_id: str,
        top_k: int = 5,
        rerank: bool = True,
    ) -> list[dict[str, Any]]:
        resp = await self._http.post(
            "/api/search",
            json={
                "query": query,
                "workspace_id": workspace_id,
                "top_k": top_k,
                "rerank": rerank,
            },
        )
        resp.raise_for_status()
        return resp.json().get("results", [])

    async def index_documents(
        self, workspace_id: str, documents: list[dict[str, str]]
    ) -> dict[str, Any]:
        resp = await self._http.post(
            "/api/index/documents",
            json={"workspace_id": workspace_id, "documents": documents},
        )
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        await self._http.aclose()


class KnowledgeClient:
    """Wrapper around the knowledge-service API for knowledge graph queries."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.knowledge_svc_url
        self._http = httpx.AsyncClient(base_url=self._base, timeout=30)

    async def search(
        self,
        query: str,
        *,
        access_level: str = "enterprise",
        node_labels: list[str] | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        resp = await self._http.post(
            "/api/knowledge/search",
            json={
                "query": query,
                "access_level": access_level,
                "node_labels": node_labels or [],
                "limit": limit,
            },
        )
        resp.raise_for_status()
        return resp.json().get("results", [])

    async def get_patterns(
        self,
        *,
        domain: str = "",
        min_confidence: float = 0.5,
        access_level: str = "enterprise",
    ) -> list[dict[str, Any]]:
        resp = await self._http.get(
            "/api/knowledge/patterns",
            params={
                "domain": domain,
                "min_confidence": min_confidence,
                "access_level": access_level,
            },
        )
        resp.raise_for_status()
        return resp.json().get("patterns", [])

    async def close(self) -> None:
        await self._http.aclose()


PHASE_CONTEXT: dict[str, list[str]] = {
    "requirement": [],
    "architecture": ["requirement"],
    "design": ["requirement", "architecture"],
    "development": ["requirement", "architecture", "design"],
    "testing": ["development", "design"],
    "deployment": ["development", "testing"],
    "monitoring": ["deployment"],
}

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
    tools: list[dict[str, Any]] = []

    def __init__(self) -> None:
        self.workspace_svc = WorkspaceClient()
        self.llm = LLMGatewayClient()
        self.ws = WSGatewayClient()
        self.session = SessionManager()
        self.memory = MemoryClient()
        self.rag = RAGClient()
        self.knowledge = KnowledgeClient()
        self.tool_registry = ToolRegistry()
        self._task_context_var: contextvars.ContextVar[dict[str, Any] | None] = contextvars.ContextVar(
            "task_context", default=None,
        )
        self._tool_results_var: contextvars.ContextVar[list[dict[str, Any]]] = contextvars.ContextVar(
            "tool_results", default=[],
        )

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
    # Abstract interface
    # ------------------------------------------------------------------

    @abstractmethod
    async def execute(self, task: AgentTask) -> AsyncIterator[AgentEvent]:
        """Run a structured task and yield progress events."""
        ...

    @abstractmethod
    async def chat(
        self, message: str, *, workspace_id: str, context: dict[str, Any] | None = None
    ) -> AsyncIterator[Message]:
        """Handle a free-form chat message and yield response messages."""
        ...

    # ------------------------------------------------------------------
    # Helpers available to subclasses
    # ------------------------------------------------------------------

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

        # Store the exchange in memory for future recall
        try:
            await self.memory.add_memory(
                f"User asked: {user_message}\nAgent replied: {reply[:500]}",
                workspace_id=workspace_id,
                agent_type=_enum_val(self.agent_type),
            )
        except Exception:
            pass

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
            pass

    def _get_tool_schemas(self) -> list[dict[str, Any]] | None:
        """Return merged tool schemas from registry + class-level tools."""
        schemas: list[dict[str, Any]] = []
        if self.tool_registry.has_tools:
            schemas.extend(self.tool_registry.get_schemas())
        if self.tools:
            seen = {s.get("function", {}).get("name") for s in schemas}
            for t in self.tools:
                name = t.get("function", {}).get("name", "")
                if name and name not in seen:
                    schemas.append(t)
        return schemas or None

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

        for iteration in range(max_iterations):
            result = await self.llm.chat(
                messages, tools=tool_schemas
            )

            choice = result.get("choices", [{}])[0]
            msg = choice.get("message", {})
            tool_calls = msg.get("tool_calls")

            if not tool_calls:
                reply = msg.get("content", "")
                try:
                    await self.memory.add_memory(
                        f"User asked: {user_message}\nAgent replied: {reply[:500]}",
                        workspace_id=workspace_id,
                        agent_type=_enum_val(self.agent_type),
                    )
                except Exception:
                    pass
                return reply

            messages.append(msg)

            for tc in tool_calls:
                fn = tc.get("function", {})
                tool_name = fn.get("name", "")
                arguments = fn.get("arguments", "{}")
                tc_id = tc.get("id", "")

                if isinstance(arguments, str):
                    try:
                        parsed_args = json.loads(arguments) if arguments else {}
                    except json.JSONDecodeError:
                        parsed_args = {}
                else:
                    parsed_args = arguments

                parsed_args["_workspace_id"] = workspace_id
                if hasattr(self, "_current_task_context") and self._current_task_context:
                    parsed_args.setdefault("_context", self._current_task_context)

                logger.info(
                    "Tool call [%s] %s(%s)", _enum_val(self.agent_type), tool_name, list(parsed_args.keys())
                )

                try:
                    await self.ws.publish_log(
                        workspace_id, _enum_val(self.agent_type),
                        f"Calling tool: {tool_name}",
                        level="info",
                    )
                except Exception:
                    pass

                tool_result = await self.tool_registry.execute(tool_name, parsed_args)

                is_error = any(
                    marker in tool_result.lower()
                    for marker in ("error:", "failed:", "exception:", "traceback")
                )
                self._tool_results.append({
                    "tool": tool_name,
                    "ok": not is_error,
                    "result": tool_result[:500],
                })

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc_id,
                    "content": tool_result,
                })

        # max_iterations exhausted with tool calls still pending – return last available content.
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
        text response.  Tool-call iterations use streaming to detect tool_calls vs
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

        full_reply = ""

        for iteration in range(max_iterations):
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

                for tc in tool_calls_acc:
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
                    if hasattr(self, "_current_task_context") and self._current_task_context:
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
                        pass

                    tool_result = await self.tool_registry.execute(tool_name, parsed_args)

                    is_error = any(
                        marker in tool_result.lower()
                        for marker in ("error:", "failed:", "exception:", "traceback")
                    )
                    self._tool_results.append({
                        "tool": tool_name, "ok": not is_error, "result": tool_result[:500],
                    })

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tc_id,
                        "content": tool_result,
                    })
                continue

            # No tool calls – final text response already yielded above.
            # Yield any remaining buffered content that arrived alongside tool_calls.
            joined = "".join(content_parts)
            remaining = joined[len(full_reply):]
            if remaining:
                full_reply += remaining
                yield remaining
            break

        try:
            await self.memory.add_memory(
                f"User asked: {user_message}\nAgent replied: {full_reply[:500]}",
                workspace_id=workspace_id,
                agent_type=_enum_val(self.agent_type),
            )
        except Exception:
            pass

    async def _build_enriched_prompt(
        self,
        workspace_id: str,
        user_message: str,
        *,
        repo_context: dict[str, Any] | None = None,
    ) -> str:
        """Compose a context-aware system prompt from Memory + RAG + Knowledge + Upstream Artifacts."""
        sections = [self.system_prompt]

        # Inject GitLab repository context so LLM knows exactly which repo / branch to use.
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
            pass

        # L4: Preferences from memory service
        try:
            memory_ctx = await self.memory.assemble_context(
                workspace_id, _enum_val(self.agent_type), user_message
            )
            if memory_ctx:
                sections.append(
                    f"## Context from past interactions and preferences\n{memory_ctx}"
                )
        except Exception:
            pass

        # L2: RAG - relevant project documents
        try:
            rag_results = await self.rag.search(
                user_message, workspace_id=workspace_id, top_k=3
            )
            if rag_results:
                chunks = "\n---\n".join(
                    r.get("text", r.get("content", "")) for r in rag_results
                )
                sections.append(
                    f"## Relevant project documents\n{chunks}"
                )
        except Exception:
            pass

        # L3: Organization knowledge graph patterns
        try:
            patterns = await self.knowledge.search(
                user_message, access_level="enterprise", limit=3
            )
            if patterns:
                pattern_text = "\n".join(
                    f"- {p.get('name', '')}: {p.get('description', '')}"
                    for p in patterns
                )
                sections.append(
                    f"## Organization best practices\n{pattern_text}"
                )
        except Exception:
            pass

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

        sections: list[str] = []
        for up_phase in upstream_phases:
            phase_id = await self.workspace_svc.find_phase_by_type(workspace_id, up_phase)
            if not phase_id:
                continue
            try:
                artifacts = await self.workspace_svc.list_artifacts(
                    workspace_id, phase_id=phase_id
                )
                for art in artifacts[:5]:
                    title = art.get("title", "untitled")
                    content = art.get("content", "")[:2000]
                    art_type = art.get("type", "unknown")
                    sections.append(
                        f"### [{up_phase}] {title} ({art_type})\n{content}"
                    )
            except Exception:
                continue

        if not sections:
            return ""
        return "## Upstream Artifacts\n\n" + "\n\n---\n\n".join(sections)

    async def _fetch_related_requirement_context(self, workspace_id: str, requirement_id: str) -> str:
        """Load artifacts from related requirements based on relationship type."""
        try:
            related = await self.workspace_svc.get_related_artifacts(workspace_id, requirement_id)
        except Exception:
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
            import asyncio as _aio
            _aio.create_task(self._auto_index_artifact(workspace_id, title, content, artifact_type))
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
            pass

    async def _upsert_artifact(
        self,
        workspace_id: str,
        *,
        artifact_type: str,
        title: str,
        content: str,
        phase_id: str | None = None,
        task_id: str | None = None,
        requirement_id: str | None = None,
        metadata: str = "{}",
    ) -> dict[str, Any]:
        """Upsert an artifact (update if same task_id+type exists, else insert)."""
        result = await self.workspace_svc.upsert_artifact(
            workspace_id,
            agent_type=_enum_val(self.agent_type),
            artifact_type=artifact_type,
            title=title,
            content=content,
            phase_id=phase_id,
            task_id=task_id,
            requirement_id=requirement_id,
            metadata=metadata,
        )
        if self.rag and content and len(content) > 100:
            try:
                await self.rag.index_documents(
                    workspace_id,
                    [{"title": title, "content": content[:8000], "doc_type": artifact_type}],
                )
            except Exception:
                pass
        return result

    async def close(self) -> None:
        await self.workspace_svc.close()
        await self.llm.close()
        await self.ws.close()
        await self.session.close()
        await self.memory.close()
        await self.rag.close()
        await self.knowledge.close()
