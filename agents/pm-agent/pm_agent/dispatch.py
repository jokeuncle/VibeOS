"""Agent dispatcher -- routes tasks to domain agents via the unified
``/api/conversation/stream`` endpoint.
"""

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
)


def _build_agent_endpoints() -> dict[str, str]:
    """Build agent endpoint registry from env vars with sensible defaults."""
    defaults = {
        "architecture": ("ARCHITECTURE_AGENT_URL", "http://localhost:8041"),
        "requirement": ("REQUIREMENT_AGENT_URL", "http://localhost:8042"),
        "design": ("DESIGN_AGENT_URL", "http://localhost:8043"),
        "development": ("DEVELOPMENT_AGENT_URL", "http://localhost:8044"),
        "testing": ("TESTING_AGENT_URL", "http://localhost:8045"),
        "cicd": ("CICD_AGENT_URL", "http://localhost:8046"),
        "monitoring": ("MONITORING_AGENT_URL", "http://localhost:8047"),
        "coding": ("CODING_AGENT_URL", "http://localhost:8048"),
    }
    return {k: os.getenv(env, default) for k, (env, default) in defaults.items()}


AGENT_ENDPOINTS: dict[str, str] = _build_agent_endpoints()

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


def _task_to_conversation_payload(task: AgentTask) -> dict[str, Any]:
    """Convert an AgentTask to a ConversationRequest-compatible dict."""
    return {
        "workspace_id": task.workspace_id,
        "message": task.user_message or task.description,
        "mode": "execute",
        "intent": task.intent,
        "description": task.description,
        "task_id": task.task_id,
        "context": task.context,
        "preferred_model": task.preferred_model,
        "system_prompt": getattr(task, "system_prompt", None),
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

        payload = _task_to_conversation_payload(task)
        result: dict[str, Any] = {}
        try:
            async with self._http.stream(
                "POST",
                f"{base}/api/conversation/stream",
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line or line.startswith(":"):
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            if data.get("type") in ("result", "error"):
                                result = data
                        except json.JSONDecodeError:
                            pass
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

        payload = _task_to_conversation_payload(task)
        try:
            async with self._http.stream(
                "POST",
                f"{base}/api/conversation/stream",
                json=payload,
            ) as resp:
                resp.raise_for_status()
                current_event = ""
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line or line.startswith(":"):
                        continue
                    if line.startswith("event: "):
                        current_event = line[7:]
                        continue
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            return
                        try:
                            data = json.loads(data_str)
                        except json.JSONDecodeError:
                            current_event = ""
                            continue
                        if current_event:
                            parts = current_event.split(":", 1)
                            if len(parts) == 2:
                                data["_category"] = parts[0]
                                data["_action"] = parts[1]
                        current_event = ""
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
