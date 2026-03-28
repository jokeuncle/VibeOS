"""Agent dispatcher – routes tasks to domain agents and coordinates multi-agent work."""

from __future__ import annotations

import os
from typing import Any

import httpx

from vibeos_agent import (
    AgentEvent,
    AgentStatus,
    AgentTask,
    AgentType,
    WSGatewayClient,
    config,
)


def _build_agent_endpoints() -> dict[str, str]:
    """Build agent endpoint registry from env vars with sensible defaults."""
    defaults = {
        "architecture": ("ARCHITECTURE_AGENT_URL", "http://architecture-agent:8041"),
        "frontend": ("FRONTEND_AGENT_URL", "http://frontend-agent:8042"),
        "backend": ("BACKEND_AGENT_URL", "http://backend-agent:8043"),
        "qa": ("QA_AGENT_URL", "http://qa-agent:8044"),
        "devops": ("DEVOPS_AGENT_URL", "http://devops-agent:8045"),
    }
    return {k: os.getenv(env, default) for k, (env, default) in defaults.items()}


AGENT_ENDPOINTS: dict[str, str] = _build_agent_endpoints()


class Dispatcher:
    """Routes tasks to the correct domain agent and reports status."""

    def __init__(self) -> None:
        self._http = httpx.AsyncClient(timeout=120)
        self.ws = WSGatewayClient()

    async def dispatch(
        self,
        agent_type: AgentType,
        task: AgentTask,
    ) -> dict[str, Any]:
        base = AGENT_ENDPOINTS.get(agent_type.value)
        if base is None:
            return {"error": f"No endpoint registered for {agent_type}"}

        await self.ws.publish_agent_status(
            task.workspace_id,
            agent_type,
            AgentStatus.WORKING,
            detail=f"Executing: {task.intent}",
        )

        try:
            resp = await self._http.post(
                f"{base}/api/execute",
                json=task.model_dump(mode="json"),
            )
            resp.raise_for_status()
            result = resp.json()
        except (httpx.HTTPStatusError, httpx.ConnectError, httpx.TimeoutException) as exc:
            await self.ws.publish_agent_status(
                task.workspace_id,
                agent_type,
                AgentStatus.ERROR,
                detail=str(exc),
            )
            return {"error": f"Agent {agent_type} unavailable: {exc}"}

        await self.ws.publish_agent_status(
            task.workspace_id,
            agent_type,
            AgentStatus.IDLE,
        )
        return result

    async def dispatch_parallel(
        self,
        assignments: list[tuple[AgentType, AgentTask]],
    ) -> list[dict[str, Any]]:
        """Fire multiple agent tasks concurrently and collect results."""
        import asyncio

        coros = [self.dispatch(at, task) for at, task in assignments]
        return list(await asyncio.gather(*coros, return_exceptions=False))

    async def dispatch_sequential(
        self,
        assignments: list[tuple[AgentType, AgentTask]],
    ) -> list[dict[str, Any]]:
        """Execute agent tasks in order, passing context forward."""
        results: list[dict[str, Any]] = []
        for agent_type, task in assignments:
            if results:
                task.context["previous_results"] = results[-1]
            result = await self.dispatch(agent_type, task)
            results.append(result)
        return results

    async def forward_chat(
        self,
        agent_type: AgentType,
        workspace_id: str,
        message: str,
    ) -> dict[str, Any]:
        base = AGENT_ENDPOINTS.get(agent_type.value)
        if base is None:
            return {"error": f"No endpoint registered for {agent_type}"}

        try:
            resp = await self._http.post(
                f"{base}/api/chat",
                json={"workspace_id": workspace_id, "message": message},
            )
            resp.raise_for_status()
            return resp.json()
        except (httpx.HTTPStatusError, httpx.ConnectError, httpx.TimeoutException) as exc:
            return {"error": f"Agent {agent_type} unavailable: {exc}"}

    async def close(self) -> None:
        await self._http.aclose()
        await self.ws.close()
