"""Intent parser – classifies user input into structured intents via the LLM gateway."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from vibeos_agent import AgentType, LLMGatewayClient

INTENT_TYPES: list[str] = [
    "create_task",
    "query_progress",
    "design_system",
    "generate_code",
    "run_tests",
    "deploy",
    "analyze_requirements",
    "architecture_design",
    "general_chat",
]

_AGENT_MAP: dict[str, AgentType] = {
    "create_task": AgentType.PM,
    "query_progress": AgentType.PM,
    "design_system": AgentType.ARCHITECTURE,
    "architecture_design": AgentType.ARCHITECTURE,
    "generate_code": AgentType.BACKEND,
    "run_tests": AgentType.QA,
    "deploy": AgentType.DEVOPS,
    "analyze_requirements": AgentType.PM,
    "general_chat": AgentType.PM,
}

CLASSIFICATION_PROMPT = (
    "You are a classifier. Given the user message, reply with ONLY a JSON object "
    '{"intent": "<intent_type>", "summary": "<one-line summary>"} where intent_type '
    f"is one of: {', '.join(INTENT_TYPES)}. Do NOT include anything else."
)


class ParsedIntent(BaseModel):
    intent: str
    summary: str
    target_agent: AgentType


async def parse_intent(
    user_input: str,
    llm: LLMGatewayClient,
    *,
    extra_context: dict[str, Any] | None = None,
) -> ParsedIntent:
    messages: list[dict[str, str]] = [
        {"role": "system", "content": CLASSIFICATION_PROMPT},
        {"role": "user", "content": user_input},
    ]
    result = await llm.chat(messages, temperature=0.0)
    raw = result.get("choices", [{}])[0].get("message", {}).get("content", "")

    import json

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {"intent": "general_chat", "summary": user_input[:120]}

    intent_name = data.get("intent", "general_chat")
    if intent_name not in INTENT_TYPES:
        intent_name = "general_chat"

    return ParsedIntent(
        intent=intent_name,
        summary=data.get("summary", ""),
        target_agent=_AGENT_MAP.get(intent_name, AgentType.PM),
    )
