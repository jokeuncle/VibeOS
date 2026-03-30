"""Home-page SSE action registry.

Each handler is an async generator that yields SSE event strings for a given
intent on the home page (``workspace_id == "__home__"``).

Adding a new home action:
1. Write an ``async def`` generator that yields SSE strings.
2. Decorate it with ``@home_action("intent_name")``.
   Use ``"__default__"`` for the catch-all (currently: create workspace).
3. The handler is auto-discovered by ``yield_home_events``.
"""

from __future__ import annotations

import json
from typing import Any, AsyncGenerator, Callable

from vibeos_agent import LLMGatewayClient

from .intent import (
    INTENT_LABELS,
    ParsedIntent,
    resolve_home_initial_requirements,
    resolve_home_workspace_description,
    resolve_home_workspace_suggested_name,
)
from .stream import build_action_event, build_timeline_event

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

type HomeHandler = Callable[..., AsyncGenerator[str, None]]

_REGISTRY: dict[str, HomeHandler] = {}


def home_action(intent_name: str):
    """Decorator — register a home-page SSE generator for *intent_name*."""
    def _wrap(fn: HomeHandler) -> HomeHandler:
        _REGISTRY[intent_name] = fn
        return fn
    return _wrap


async def yield_home_events(
    parsed: ParsedIntent,
    llm: LLMGatewayClient,
    user_message: str,
    *,
    random_title: Callable[[], str],
    agent_labels: dict[str, dict[str, str]],
) -> AsyncGenerator[str, None]:
    """Dispatch to the registered handler for *parsed.intent* (or ``__default__``)."""
    handler = _REGISTRY.get(parsed.intent) or _REGISTRY.get("__default__")
    if not handler:
        return
    async for event in handler(
        parsed, llm, user_message,
        random_title=random_title,
        agent_labels=agent_labels,
    ):
        yield event


# ---------------------------------------------------------------------------
# Built-in: general_chat
# ---------------------------------------------------------------------------

@home_action("general_chat")
async def _general_chat(
    parsed: ParsedIntent,
    llm: LLMGatewayClient,
    user_message: str,
    **_: Any,
) -> AsyncGenerator[str, None]:
    yield build_timeline_event("exec", "生成回复 / Generating reply", "running")
    messages = [
        {"role": "system", "content": (
            "You are VibeOS, an AI-native software development platform assistant. "
            "Greet the user warmly and briefly explain what you can help with. "
            "Be concise (2-3 sentences). Never claim you already created a workspace, "
            "project, or any resource — that only happens after the user uses the button "
            "below or the sidebar. Respond in the same language as the user."
        )},
        {"role": "user", "content": user_message},
    ]
    async for chunk in llm.chat_stream(messages):
        delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
        if delta:
            yield f"data: {json.dumps({'delta': delta})}\n\n"
    yield build_timeline_event("exec", "生成回复 / Generating reply", "completed")
    yield build_action_event(
        "navigate", label="开始新项目", variant="primary",
        payload={"target": "create_workspace"},
    )


# ---------------------------------------------------------------------------
# Built-in: __default__ (workspace creation for any non-chat intent)
# ---------------------------------------------------------------------------

@home_action("__default__")
async def _workspace_create(
    parsed: ParsedIntent,
    llm: LLMGatewayClient,
    user_message: str,
    *,
    random_title: Callable[[], str],
    agent_labels: dict[str, dict[str, str]],
    **_: Any,
) -> AsyncGenerator[str, None]:
    agent_val = parsed.target_agent.value
    intent_label = INTENT_LABELS.get(parsed.intent, {})
    agent_label = agent_labels.get(agent_val, {})
    suggested_name = resolve_home_workspace_suggested_name(parsed, random_title)
    suggested_description = resolve_home_workspace_description(parsed)
    initial_requirements = resolve_home_initial_requirements(parsed)

    yield build_timeline_event("exec", "生成回复 / Generating reply", "running")
    messages = [
        {"role": "system", "content": (
            "You are VibeOS PM assistant. The user is on the home page. "
            "Write a brief (2-3 sentence) acknowledgement. The workspace is NOT created yet — "
            "only after they click the button below; do not say it already exists or is already created. "
            "Explain that the button will create the workspace and the relevant agent will take it from there. "
            "Respond in the same language as the user."
        )},
        {"role": "user", "content": user_message},
    ]
    async for chunk in llm.chat_stream(messages):
        delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
        if delta:
            yield f"data: {json.dumps({'delta': delta})}\n\n"
    yield build_timeline_event("exec", "生成回复 / Generating reply", "completed")

    yield build_action_event(
        "workspace_create",
        payload={
            "suggested_name": suggested_name,
            "suggested_description": suggested_description,
            "initial_requirements": initial_requirements,
            "intent": parsed.intent,
            "intent_label": intent_label,
            "agent": agent_val,
            "agent_label": agent_label,
            "confidence": parsed.confidence,
            "original_query": user_message,
            "slots": parsed.slots,
        },
        label="创建工作空间并开始",
        variant="primary",
    )
