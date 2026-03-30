"""Handlers for requirement-related PM intents: discovery, preview, create."""

from __future__ import annotations

from typing import Any

from vibeos_agent import LLMGatewayClient, WorkspaceClient

_REQ_EXTRACT_PROMPT = (
    "You are a requirement analyst. Extract a clean requirement from the user's message.\n"
    "Reply with ONLY a JSON object:\n"
    '{"title": "<concise title, max 80 chars>", "description": "<clear 1-3 sentence description>", '
    '"priority": "<high|medium|low>", "sufficient": <true|false>}\n'
    '"sufficient" is true only when the message contains a clear feature/problem to build.\n'
    "Do NOT include anything else."
)

_REQ_DISCOVERY_PROMPT = (
    "You are VibeOS PM assistant helping a user define their first requirement.\n"
    "The user has not created any requirements yet. Ask ONE concise follow-up question "
    "to better understand what they want to build. Focus on: the core problem, target users, "
    "or key feature. Keep your reply under 2 sentences. Respond in the same language as the user."
)


async def handle_discovery_or_preview(
    workspace_id: str,
    summary: str,
    user_message: str,
    llm: LLMGatewayClient,
    ws_client: WorkspaceClient,
) -> dict[str, Any]:
    """Zero-requirement mode: extract requirement and return a preview instead of creating directly.

    Returns a discovery question when the user's message lacks sufficient detail,
    or a requirement_preview payload when there is enough information to proceed.
    """
    messages = [
        {"role": "system", "content": _REQ_EXTRACT_PROMPT},
        {"role": "user", "content": user_message},
    ]
    result = await llm.chat(messages, temperature=0.0)
    raw = result.get("choices", [{}])[0].get("message", {}).get("content", "")

    from ..intent import _extract_json
    req_data = _extract_json(raw)

    if not req_data.get("sufficient", False):
        disc_result = await llm.chat(
            [{"role": "system", "content": _REQ_DISCOVERY_PROMPT}, {"role": "user", "content": user_message}],
            temperature=0.3,
        )
        question = disc_result.get("choices", [{}])[0].get("message", {}).get("content", "")
        return {"handled_by": "pm", "action": "discovery_question", "summary": question or summary}

    return {
        "handled_by": "pm",
        "action": "requirement_preview",
        "summary": "I've drafted a requirement based on your idea. Please review and confirm:",
        "requirement_preview": {
            "title": req_data.get("title", summary[:80]),
            "description": req_data.get("description", user_message),
            "priority": req_data.get("priority", "medium"),
        },
    }


async def handle_create_requirement(
    workspace_id: str,
    summary: str,
    user_message: str,
    ws_client: WorkspaceClient,
) -> dict[str, Any]:
    """Directly create a requirement (used when requirements already exist)."""
    req = await ws_client.create_requirement(workspace_id, title=summary, description=user_message)
    return {"handled_by": "pm", "action": "create_requirement", "requirement": req}


async def handle_discovery_chat(
    user_message: str,
    summary: str,
    llm: LLMGatewayClient,
) -> dict[str, Any]:
    """General chat in zero-requirement mode: guide user toward defining their first requirement."""
    disc_result = await llm.chat(
        [{"role": "system", "content": _REQ_DISCOVERY_PROMPT}, {"role": "user", "content": user_message}],
        temperature=0.3,
    )
    question = disc_result.get("choices", [{}])[0].get("message", {}).get("content", "")
    return {"handled_by": "pm", "action": "discovery_question", "summary": question or summary}
