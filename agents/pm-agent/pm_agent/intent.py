"""Intent parser – classifies user input into structured intents via the LLM gateway."""

from __future__ import annotations

import json
import re
from typing import Any

from pydantic import BaseModel

from vibeos_agent import AgentType, LLMGatewayClient

INTENT_TYPES: list[str] = [
    "create_task",
    "create_requirement",
    "query_progress",
    "execute_task",
    "execute_phase",
    "run_project",
    "design_system",
    "generate_code",
    "run_tests",
    "deploy",
    "analyze_requirements",
    "architecture_design",
    "ui_design",
    "setup_monitoring",
    "design_observability",
    "general_chat",
]

_AGENT_MAP: dict[str, AgentType] = {
    "create_task": AgentType.PM,
    "create_requirement": AgentType.PM,
    "query_progress": AgentType.PM,
    "execute_task": AgentType.PM,
    "execute_phase": AgentType.PM,
    "run_project": AgentType.PM,
    "design_system": AgentType.ARCHITECTURE,
    "architecture_design": AgentType.ARCHITECTURE,
    "ui_design": AgentType.DESIGN,
    "generate_code": AgentType.DEVELOPMENT,
    "run_tests": AgentType.TESTING,
    "deploy": AgentType.CICD,
    "analyze_requirements": AgentType.REQUIREMENT,
    "setup_monitoring": AgentType.MONITORING,
    "design_observability": AgentType.MONITORING,
    "general_chat": AgentType.PM,
}

CLASSIFICATION_PROMPT = (
    "You are a classifier. Given the user message, reply with ONLY a JSON object "
    '{"intent": "<intent_type>", "summary": "<one-line summary>"} where intent_type '
    f"is one of: {', '.join(INTENT_TYPES)}.\n"
    "Intent guide:\n"
    "- create_task: user wants to create a single task\n"
    "- create_requirement: user wants to create a new requirement or feature request for the project\n"
    "- execute_task: user wants to run/execute a specific task\n"
    "- execute_phase: user wants to run all tasks in a specific phase\n"
    "- run_project: user wants to run the entire project lifecycle end-to-end\n"
    "- analyze_requirements: user wants to analyze, define, or refine project requirements\n"
    "- architecture_design: user wants to design system/technical architecture\n"
    "- ui_design: user is asking about UI/UX design, wireframes, mockups, or visual design\n"
    "- generate_code: user wants to write/generate/develop code or implement features\n"
    "- run_tests: user wants to create test plans, write test cases, run tests, or do QA\n"
    "- deploy: user wants to deploy, set up CI/CD pipelines, or release\n"
    "- setup_monitoring: user wants to set up monitoring, alerting, dashboards, or observability\n"
    "- design_observability: user is asking about SRE, SLOs, incident response, or runbooks\n"
    "- general_chat: casual conversation or questions not fitting above categories\n"
    "Do NOT include anything else."
)

_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*\n?(.*?)\n?```", re.DOTALL)
_FIRST_BRACE_RE = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json(text: str) -> dict[str, Any]:
    """Best-effort extraction of a JSON object from potentially wrapped text."""
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    m = _CODE_FENCE_RE.search(text)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass

    m = _FIRST_BRACE_RE.search(text)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass

    return {"intent": "general_chat", "summary": text[:120]}


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

    data = _extract_json(raw)

    intent_name = data.get("intent", "general_chat")
    if intent_name not in INTENT_TYPES:
        intent_name = "general_chat"

    return ParsedIntent(
        intent=intent_name,
        summary=data.get("summary", ""),
        target_agent=_AGENT_MAP.get(intent_name, AgentType.PM),
    )
