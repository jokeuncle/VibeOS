"""JSON bodies for ``POST /api/conversation/stream`` with ``mode=execute``.

Centralizes payload shape for :class:`~vibeos_agent.models.AgentTask` dispatch
and graph executor so call sites stay in sync with :class:`ConversationRequest`.
"""

from __future__ import annotations

from typing import Any

from .models import AgentTask


def normalize_enabled_tools_for_execute_payload(
    raw: list[Any] | None,
) -> list[str] | None:
    """Normalize OpenAI-style tool dicts or plain names to a list of tool names."""
    if not raw:
        return None
    if isinstance(raw[0], dict):
        names = [
            t.get("function", {}).get("name", "") or t.get("name", "")
            for t in raw
            if isinstance(t, dict)
        ]
        return [n for n in names if n] or None
    return [str(x) for x in raw]


def execute_payload_from_agent_task(task: AgentTask) -> dict[str, Any]:
    """Build the JSON body for routing an :class:`AgentTask` to a domain agent's conversation stream."""
    payload: dict[str, Any] = {
        "workspace_id": task.workspace_id,
        "message": task.user_message or task.description,
        "mode": "execute",
        "intent": task.intent,
        "description": task.description,
        "task_id": task.task_id,
        "context": task.context,
        "preferred_model": task.preferred_model,
        "system_prompt": task.system_prompt,
    }
    if task.enabled_tools:
        payload["enabled_tools"] = list(task.enabled_tools)
    return payload


def build_graph_node_execute_payload(
    *,
    workspace_id: str,
    message: str,
    intent: str,
    description: str,
    task_id: str,
    context: dict[str, Any],
    preferred_model: str | None,
    system_prompt: str | None = None,
    enabled_tools_raw: list[Any] | None = None,
) -> dict[str, Any]:
    """Build execute payload from graph node state (matches previous ``_build_conversation_request``)."""
    payload: dict[str, Any] = {
        "workspace_id": workspace_id,
        "message": message,
        "mode": "execute",
        "intent": intent,
        "description": description,
        "task_id": task_id,
        "context": context,
        "preferred_model": preferred_model,
    }
    if system_prompt:
        payload["system_prompt"] = system_prompt
    if enabled_tools_raw:
        tools = normalize_enabled_tools_for_execute_payload(enabled_tools_raw)
        if tools:
            payload["enabled_tools"] = tools
    return payload
