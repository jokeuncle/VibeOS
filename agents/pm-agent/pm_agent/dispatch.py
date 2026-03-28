"""Agent dispatcher – routes tasks to domain agents and coordinates multi-agent work."""

from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
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
        "requirement": ("REQUIREMENT_AGENT_URL", "http://requirement-agent:8042"),
        "design": ("DESIGN_AGENT_URL", "http://design-agent:8043"),
        "development": ("DEVELOPMENT_AGENT_URL", "http://dev-agent:8044"),
        "testing": ("TESTING_AGENT_URL", "http://test-agent:8045"),
        "cicd": ("CICD_AGENT_URL", "http://cicd-agent:8046"),
        "monitoring": ("MONITORING_AGENT_URL", "http://monitoring-agent:8047"),
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
            AgentStatus.RUNNING,
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

    async def dispatch_stream(
        self,
        agent_type: AgentType,
        task: AgentTask,
    ) -> AsyncIterator[dict[str, Any]]:
        """Forward agent execute as SSE stream, yielding parsed events."""
        base = AGENT_ENDPOINTS.get(agent_type.value)
        if base is None:
            yield {"error": f"No endpoint registered for {agent_type}"}
            return

        await self.ws.publish_agent_status(
            task.workspace_id, agent_type, AgentStatus.RUNNING,
            detail=f"Executing: {task.intent}",
        )

        try:
            async with self._http.stream(
                "POST",
                f"{base}/api/execute/stream",
                json=task.model_dump(mode="json"),
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
        except (httpx.HTTPStatusError, httpx.ConnectError, httpx.TimeoutException) as exc:
            await self.ws.publish_agent_status(
                task.workspace_id, agent_type, AgentStatus.ERROR, detail=str(exc),
            )
            yield {"error": f"Agent {agent_type} unavailable: {exc}"}

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

    async def forward_chat_stream(
        self,
        agent_type: AgentType,
        workspace_id: str,
        message: str,
    ) -> AsyncIterator[dict[str, Any]]:
        """Forward chat to agent's /api/chat/stream and yield SSE chunks."""
        base = AGENT_ENDPOINTS.get(agent_type.value)
        if base is None:
            yield {"error": f"No endpoint registered for {agent_type}"}
            return

        try:
            async with self._http.stream(
                "POST",
                f"{base}/api/chat/stream",
                json={"workspace_id": workspace_id, "message": message},
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
        except (httpx.HTTPStatusError, httpx.ConnectError, httpx.TimeoutException) as exc:
            yield {"error": f"Agent {agent_type} unavailable: {exc}"}

    async def close(self) -> None:
        await self._http.aclose()
        await self.ws.close()
