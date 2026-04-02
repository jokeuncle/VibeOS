"""Delegation tools – let agents request work from other agents."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

from .base import BaseTool

logger = logging.getLogger(__name__)

_AGENT_ENDPOINTS: dict[str, str] = {
    "architecture": os.getenv("ARCHITECTURE_AGENT_URL", "http://architecture-agent:8041"),
    "requirement": os.getenv("REQUIREMENT_AGENT_URL", "http://requirement-agent:8042"),
    "design": os.getenv("DESIGN_AGENT_URL", "http://design-agent:8043"),
    "development": os.getenv("DEVELOPMENT_AGENT_URL", "http://dev-agent:8044"),
    "testing": os.getenv("TESTING_AGENT_URL", "http://test-agent:8045"),
    "cicd": os.getenv("CICD_AGENT_URL", "http://cicd-agent:8046"),
    "monitoring": os.getenv("MONITORING_AGENT_URL", "http://monitoring-agent:8047"),
}


class DelegateToAgent(BaseTool):
    name = "delegate_to_agent"
    display_name = "委派代理"
    description = (
        "Delegate a sub-task to another specialist agent and get their result. "
        "Use this when the current task requires expertise from another domain "
        "(e.g. a development agent asking the testing agent to generate test cases, "
        "or an architecture agent asking the requirement agent for clarification)."
    )
    parameters = {
        "type": "object",
        "properties": {
            "target_agent": {
                "type": "string",
                "enum": [
                    "requirement", "architecture", "design",
                    "development", "testing", "cicd", "monitoring",
                ],
                "description": "The agent type to delegate to",
            },
            "intent": {
                "type": "string",
                "description": "What you want the target agent to do",
            },
            "description": {
                "type": "string",
                "description": "Detailed description of the sub-task",
            },
            "message": {
                "type": "string",
                "description": "The request message to send to the target agent",
            },
        },
        "required": ["target_agent", "intent", "message"],
    }

    def __init__(self, source_agent_type: str) -> None:
        self._source = source_agent_type

    async def execute(self, **kwargs: Any) -> str:
        target = kwargs.get("target_agent", "")
        intent = kwargs.get("intent", "")
        description = kwargs.get("description", intent)
        message = kwargs.get("message", "")
        workspace_id = kwargs.pop("_workspace_id", "")

        if target == self._source:
            return self._json_result({"error": "Cannot delegate to self"})

        base_url = _AGENT_ENDPOINTS.get(target)
        if not base_url:
            return self._json_result({"error": f"Unknown agent: {target}"})

        task_payload = {
            "task_id": f"delegation-{self._source}-to-{target}",
            "workspace_id": workspace_id,
            "intent": intent,
            "description": description,
            "user_message": message,
            "context": {
                "delegated_from": self._source,
                "delegation_intent": intent,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    f"{base_url}/api/execute",
                    json=task_payload,
                )
                resp.raise_for_status()
                result = resp.json()

            payload = result.get("payload", result)
            summary = payload.get("summary", "") if isinstance(payload, dict) else str(payload)

            return self._json_result({
                "status": "completed",
                "target_agent": target,
                "summary": summary[:2000],
                "result": payload,
            })
        except httpx.ConnectError:
            return self._json_result({
                "error": f"Agent {target} is not available",
                "target_agent": target,
            })
        except Exception as exc:
            logger.warning("Delegation to %s failed: %s", target, exc)
            return self._json_result({
                "error": f"Delegation failed: {exc}",
                "target_agent": target,
            })


def create_delegation_tools(source_agent_type: str) -> list[BaseTool]:
    """Factory: create delegation tools for inter-agent communication."""
    return [DelegateToAgent(source_agent_type)]
