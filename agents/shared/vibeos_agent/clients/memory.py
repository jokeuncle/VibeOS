"""MemoryClient – wrapper around the memory-service API for preference/context retrieval."""

from __future__ import annotations

from typing import Any

import httpx

from ..config import config


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
