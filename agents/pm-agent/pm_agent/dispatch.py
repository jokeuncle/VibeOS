"""Agent dispatcher -- routes tasks to domain agents via the unified
``/api/conversation/stream`` endpoint.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

import httpx

from vibeos_agent import (
    AgentStatus,
    AgentTask,
    AgentType,
    WSGatewayClient,
    execute_payload_from_agent_task,
)
from vibeos_agent.agent_call import collect_agent_result, iter_agent_sse
from vibeos_agent.config import AGENT_ENDPOINTS

AGENT_NAME_CN: dict[str, str] = {
    "requirement": "需求",
    "architecture": "架构",
    "design": "设计",
    "development": "开发",
    "testing": "测试",
    "cicd": "CI/CD",
    "monitoring": "监控",
    "pm": "项目管理",
    "coding": "编码",
}


class Dispatcher:
    """Routes tasks to the correct domain agent and reports status."""

    def __init__(self) -> None:
        self._http = httpx.AsyncClient(timeout=httpx.Timeout(300, connect=30))
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

        payload = execute_payload_from_agent_task(task)
        try:
            result = await collect_agent_result(
                base, payload, http_client=self._http,
            )
        except httpx.HTTPStatusError as exc:
            body = exc.response.text[:500] if exc.response else str(exc)
            await self.ws.publish_agent_status(
                task.workspace_id, agent_type, AgentStatus.ERROR, detail=body,
            )
            name = AGENT_NAME_CN.get(agent_type.value, agent_type.value)
            return {"error": f"{name} Agent 服务错误 ({exc.response.status_code})"}
        except (httpx.ConnectError, httpx.TimeoutException) as exc:
            await self.ws.publish_agent_status(
                task.workspace_id, agent_type, AgentStatus.ERROR, detail=str(exc),
            )
            name = AGENT_NAME_CN.get(agent_type.value, agent_type.value)
            return {"error": f"{name} Agent 服务未启动，请先启动对应的 Agent 服务"}

        if result.get("error"):
            await self.ws.publish_agent_status(
                task.workspace_id, agent_type, AgentStatus.ERROR,
                detail=result["error"][:200],
            )
            return result

        await self.ws.publish_agent_status(
            task.workspace_id, agent_type, AgentStatus.IDLE,
        )
        return result

    async def dispatch_stream(
        self,
        agent_type: AgentType,
        task: AgentTask,
    ) -> AsyncIterator[dict[str, Any]]:
        """Forward agent execute as SSE stream via /api/conversation/stream."""
        base = AGENT_ENDPOINTS.get(agent_type.value)
        if base is None:
            yield {"error": f"No endpoint registered for {agent_type}"}
            return

        await self.ws.publish_agent_status(
            task.workspace_id, agent_type, AgentStatus.RUNNING,
            detail=f"Executing: {task.intent}",
        )

        payload = execute_payload_from_agent_task(task)
        try:
            async for event_type, data in iter_agent_sse(
                base, payload, http_client=self._http,
            ):
                if event_type:
                    parts = event_type.split(":", 1)
                    if len(parts) == 2:
                        data["_category"] = parts[0]
                        data["_action"] = parts[1]
                yield data
        except (httpx.HTTPStatusError, httpx.ConnectError, httpx.TimeoutException) as exc:
            await self.ws.publish_agent_status(
                task.workspace_id, agent_type, AgentStatus.ERROR, detail=str(exc),
            )
            name = AGENT_NAME_CN.get(agent_type.value, agent_type.value)
            yield {"error": f"{name} Agent 服务未启动，请先启动对应的 Agent 服务"}
            return

        await self.ws.publish_agent_status(
            task.workspace_id, agent_type, AgentStatus.IDLE,
        )

    async def dispatch_parallel(
        self,
        assignments: list[tuple[AgentType, AgentTask]],
    ) -> list[dict[str, Any]]:
        """Fire multiple agent tasks concurrently and collect results."""
        import asyncio

        coros = [self.dispatch(at, task) for at, task in assignments]
        results = await asyncio.gather(*coros, return_exceptions=True)
        return [
            r if not isinstance(r, BaseException) else {"error": str(r)}
            for r in results
        ]

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

    async def close(self) -> None:
        await self._http.aclose()
        await self.ws.close()
