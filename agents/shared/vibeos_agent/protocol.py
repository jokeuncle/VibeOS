"""Base agent protocol – every domain agent extends BaseAgent."""

from __future__ import annotations

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

    async def update_phase(
        self,
        workspace_id: str,
        phase_id: str,
        status: PhaseStatus | None = None,
        progress: float | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if status is not None:
            body["status"] = status.value
        if progress is not None:
            body["progress"] = progress
        resp = await self._http.patch(
            f"/api/workspaces/{workspace_id}/phases/{phase_id}",
            json=body,
        )
        resp.raise_for_status()
        return resp.json()

    async def get_workspace(self, workspace_id: str) -> dict[str, Any]:
        resp = await self._http.get(f"/api/workspaces/{workspace_id}")
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        await self._http.aclose()


class LLMGatewayClient:
    """Thin async wrapper around the llm-gateway chat completions API."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.llm_gateway_url
        self._http = httpx.AsyncClient(base_url=self._base, timeout=120)

    async def chat(
        self,
        messages: list[dict[str, str]],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "messages": messages,
            "temperature": temperature,
        }
        if model:
            body["model"] = model
        if tools:
            body["tools"] = tools
        resp = await self._http.post("/api/chat/completions", json=body)
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        await self._http.aclose()


class WSGatewayClient:
    """Publishes real-time events to the ws-gateway."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.ws_gateway_url
        self._http = httpx.AsyncClient(base_url=self._base, timeout=10)

    async def publish(self, event: dict[str, Any]) -> None:
        resp = await self._http.post("/api/publish", json=event)
        resp.raise_for_status()

    async def publish_agent_status(
        self,
        workspace_id: str,
        agent_type: AgentType,
        status: AgentStatus,
        *,
        detail: str = "",
        progress: float = 0.0,
    ) -> None:
        await self.publish(
            {
                "type": "agent:status",
                "workspaceId": workspace_id,
                "agentType": agent_type.value,
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
                "message": message.model_dump(mode="json", exclude_none=True),
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
    ) -> str:
        enriched_system = self.system_prompt

        if enrich_context:
            enriched_system = await self._build_enriched_prompt(
                workspace_id, user_message
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

        result = await self.llm.chat(
            messages, tools=self.tools or None
        )

        reply = result.get("choices", [{}])[0].get("message", {}).get("content", "")

        # Store the exchange in memory for future recall
        try:
            await self.memory.add_memory(
                f"User asked: {user_message}\nAgent replied: {reply[:500]}",
                workspace_id=workspace_id,
                agent_type=self.agent_type.value,
            )
        except Exception:
            pass

        return reply

    async def _build_enriched_prompt(
        self, workspace_id: str, user_message: str
    ) -> str:
        """Compose a context-aware system prompt from Memory + RAG + Knowledge."""
        sections = [self.system_prompt]

        # L4: Preferences from memory service
        try:
            memory_ctx = await self.memory.assemble_context(
                workspace_id, self.agent_type.value, user_message
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

    async def close(self) -> None:
        await self.workspace_svc.close()
        await self.llm.close()
        await self.ws.close()
        await self.session.close()
        await self.memory.close()
        await self.rag.close()
        await self.knowledge.close()
