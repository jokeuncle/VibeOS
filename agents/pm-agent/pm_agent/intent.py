"""Intent parser – classifies user input into structured intents via the LLM gateway.

Supports confidence scoring and ambiguity detection for clarification flows.

To add a new intent, append a single ``IntentDef`` to ``INTENT_REGISTRY`` below.
All derived maps (``INTENT_TYPES``, ``_AGENT_MAP``, ``INTENT_LABELS``) and the
LLM classification prompt are auto-generated from the registry.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel

from vibeos_agent import AgentType, LLMGatewayClient


# ---------------------------------------------------------------------------
# Intent registry – THE single source of truth
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class IntentDef:
    name: str
    agent: AgentType
    label_zh: str
    label_en: str
    hint: str  # one-line guide for the LLM classifier


INTENT_REGISTRY: tuple[IntentDef, ...] = (
    IntentDef("create_task",          AgentType.PM,           "创建任务",     "Create Task",          "user wants to create a single task"),
    IntentDef("create_requirement",   AgentType.PM,           "创建需求",     "Create Requirement",   "user wants to create a new requirement or feature request"),
    IntentDef("query_progress",       AgentType.PM,           "查询进度",     "Query Progress",       "user wants to check task/project progress or status"),
    IntentDef("execute_task",         AgentType.PM,           "执行任务",     "Execute Task",         "user wants to run/execute a specific task"),
    IntentDef("execute_phase",        AgentType.PM,           "执行阶段",     "Execute Phase",        "user wants to run all tasks in a specific phase"),
    IntentDef("run_project",          AgentType.PM,           "运行项目",     "Run Project",          "user wants to run the entire project lifecycle end-to-end"),
    IntentDef("design_system",        AgentType.ARCHITECTURE, "系统架构设计", "System Design",        "user wants system-level architecture design"),
    IntentDef("architecture_design",  AgentType.ARCHITECTURE, "架构设计",     "Architecture Design",  "user wants to design system/technical architecture"),
    IntentDef("ui_design",            AgentType.DESIGN,       "UI 设计",      "UI Design",            "user is asking about UI/UX design, wireframes, mockups"),
    IntentDef("generate_code",        AgentType.DEVELOPMENT,  "生成代码",     "Generate Code",        "user wants to write/generate/develop code or implement features"),
    IntentDef("run_tests",            AgentType.TESTING,      "运行测试",     "Run Tests",            "user wants to create test plans, write tests, run tests, or do QA"),
    IntentDef("deploy",               AgentType.CICD,         "部署",         "Deploy",               "user wants to deploy, set up CI/CD pipelines, or release"),
    IntentDef("analyze_requirements", AgentType.REQUIREMENT,  "分析需求",     "Analyze Requirements", "user wants to analyze, define, or refine project requirements"),
    IntentDef("setup_monitoring",     AgentType.MONITORING,   "配置监控",     "Setup Monitoring",     "user wants monitoring, alerting, dashboards"),
    IntentDef("design_observability", AgentType.MONITORING,   "可观测性设计", "Observability Design", "user is asking about SRE, SLOs, incident response"),
    IntentDef("general_chat",         AgentType.PM,           "自由对话",     "General Chat",         "casual conversation or questions not fitting above categories"),
)


# ---------------------------------------------------------------------------
# Derived lookups (backward-compatible)
# ---------------------------------------------------------------------------

INTENT_TYPES: list[str] = [d.name for d in INTENT_REGISTRY]

_AGENT_MAP: dict[str, AgentType] = {d.name: d.agent for d in INTENT_REGISTRY}

INTENT_LABELS: dict[str, dict[str, str]] = {
    d.name: {"zh": d.label_zh, "en": d.label_en} for d in INTENT_REGISTRY
}


def _build_classification_prompt() -> str:
    intent_guide = "\n".join(f"- {d.name}: {d.hint}" for d in INTENT_REGISTRY)
    return (
        "You are a classifier. Given the user message, reply with ONLY a JSON object:\n"
        '{"intent": "<intent_type>", "summary": "<one-line summary>", '
        '"confidence": <0.0-1.0>, "alternatives": [{"intent": "<type>", "summary": "<why>"}]}\n\n'
        f"intent_type must be one of: {', '.join(INTENT_TYPES)}.\n"
        "confidence: your certainty (1.0 = very sure, 0.5 = ambiguous, <0.3 = uncertain).\n"
        "alternatives: if confidence < 0.8, list 1-2 plausible alternative intents.\n\n"
        f"Intent guide:\n{intent_guide}\n"
        "Do NOT include anything else."
    )


CLASSIFICATION_PROMPT: str = _build_classification_prompt()


# ---------------------------------------------------------------------------
# JSON extraction helpers
# ---------------------------------------------------------------------------

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

    return {"intent": "general_chat", "summary": text[:120], "confidence": 0.2}


# ---------------------------------------------------------------------------
# Public models & parser
# ---------------------------------------------------------------------------

class AlternativeIntent(BaseModel):
    intent: str
    summary: str
    target_agent: AgentType


class ParsedIntent(BaseModel):
    intent: str
    summary: str
    target_agent: AgentType
    confidence: float = 1.0
    is_ambiguous: bool = False
    is_fallback: bool = False
    alternatives: list[AlternativeIntent] = []


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
    confidence = float(data.get("confidence", 0.8))

    is_fallback = intent_name not in INTENT_TYPES
    if is_fallback:
        intent_name = "general_chat"
        confidence = min(confidence, 0.3)

    alternatives: list[AlternativeIntent] = []
    for alt in data.get("alternatives", []):
        alt_intent = alt.get("intent", "")
        if alt_intent in INTENT_TYPES and alt_intent != intent_name:
            alternatives.append(
                AlternativeIntent(
                    intent=alt_intent,
                    summary=alt.get("summary", ""),
                    target_agent=_AGENT_MAP.get(alt_intent, AgentType.PM),
                )
            )

    is_ambiguous = confidence < 0.6 and len(alternatives) > 0

    return ParsedIntent(
        intent=intent_name,
        summary=data.get("summary", ""),
        target_agent=_AGENT_MAP.get(intent_name, AgentType.PM),
        confidence=confidence,
        is_ambiguous=is_ambiguous,
        is_fallback=is_fallback,
        alternatives=alternatives[:3],
    )
