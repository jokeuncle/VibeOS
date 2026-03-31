"""Structured NLU: single LLM call returns intent + confidence + extensible ``slots``.

Adding a new intent with parameters:
1. Append ``IntentDef`` to ``INTENT_REGISTRY``.
2. Define a Pydantic model for that intent's slot object (e.g. ``CreateTaskSlots``).
3. Document the key under ``slots`` in ``STRUCTURED_NLU_PROMPT``.
4. Validate in ``_normalize_slots_for_intent`` and consume in handlers / home flow
   (e.g. ``WorkspaceCreateSlots.initial_requirements`` → home ``workspace_create`` payload).
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Callable, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from vibeos_agent import AgentType, LLMGatewayClient


# ---------------------------------------------------------------------------
# Intent registry – THE single source of truth for intent *names*
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class IntentDef:
    name: str
    agent: AgentType
    label_zh: str
    label_en: str
    hint: str


INTENT_REGISTRY: tuple[IntentDef, ...] = (
    IntentDef("create_workspace",     AgentType.PM,           "创建工作空间", "Create Workspace",     "user wants a new empty workspace or project shell (incl. random / named title)"),
    IntentDef("create_task",          AgentType.PM,           "创建任务",     "Create Task",          "user wants to create a single task"),
    IntentDef("create_requirement",   AgentType.PM,           "创建需求",     "Create Requirement",   "user wants a new requirement or feature request"),
    IntentDef("query_progress",       AgentType.PM,           "查询进度",     "Query Progress",       "user wants project/task status"),
    IntentDef("execute_task",         AgentType.PM,           "执行任务",     "Execute Task",         "user wants to run a specific task"),
    IntentDef("execute_phase",        AgentType.PM,           "执行阶段",     "Execute Phase",        "user wants to run a phase"),
    IntentDef("run_project",          AgentType.PM,           "运行项目",     "Run Project",          "user wants full lifecycle"),
    IntentDef("design_system",        AgentType.ARCHITECTURE, "系统架构设计", "System Design",        "system-level architecture design"),
    IntentDef("architecture_design",  AgentType.ARCHITECTURE, "架构设计",     "Architecture Design",  "technical architecture"),
    IntentDef("ui_design",            AgentType.DESIGN,       "UI 设计",      "UI Design",            "UI/UX, wireframes, mockups"),
    IntentDef("generate_code",        AgentType.DEVELOPMENT,  "生成代码",     "Generate Code",        "implement features / code"),
    IntentDef("run_tests",            AgentType.TESTING,      "运行测试",     "Run Tests",            "tests, QA"),
    IntentDef("trigger_build",         AgentType.PM,           "触发构建",     "Trigger Build",        "trigger a CI/CD pipeline build for a project or branch"),
    IntentDef("view_build_log",        AgentType.PM,           "查看构建日志", "View Build Log",       "view build logs, check pipeline status, query CI/CD results"),
    IntentDef("deploy",               AgentType.PM,           "部署",         "Deploy",               "deploy to an environment, CI/CD release"),
    IntentDef("rollback",             AgentType.PM,           "回滚版本",     "Rollback",             "rollback a deployment to a previous version"),
    IntentDef("analyze_requirements", AgentType.REQUIREMENT,  "分析需求",     "Analyze Requirements", "analyze or refine requirements"),
    IntentDef("setup_monitoring",     AgentType.MONITORING,   "配置监控",     "Setup Monitoring",     "monitoring, alerts"),
    IntentDef("design_observability", AgentType.MONITORING,   "可观测性设计", "Observability Design", "SRE, SLOs, incidents"),
    IntentDef("general_chat",         AgentType.PM,           "自由对话",     "General Chat",         "greetings, product help, chit-chat, or nothing else fits"),
)


INTENT_TYPES: list[str] = [d.name for d in INTENT_REGISTRY]

_AGENT_MAP: dict[str, AgentType] = {d.name: d.agent for d in INTENT_REGISTRY}

INTENT_LABELS: dict[str, dict[str, str]] = {
    d.name: {"zh": d.label_zh, "en": d.label_en} for d in INTENT_REGISTRY
}


# ---------------------------------------------------------------------------
# Slot models (extend per intent)
# ---------------------------------------------------------------------------

class PipelineSlots(BaseModel):
    """Parameters for pipeline-related intents (trigger_build, view_build_log, deploy, rollback)."""

    model_config = ConfigDict(extra="ignore")

    project: str = Field(default="", description="Project name or GitLab project ID")
    branch: str = Field(default="", description="Branch or tag to build / deploy")
    env: str = Field(default="", description="Target environment: test / staging / prod")
    pipeline_id: str = Field(default="", description="Pipeline ID to query (for view_build_log)")
    version: str = Field(default="", description="Version tag for rollback")

    @field_validator("project", "branch", "env", "pipeline_id", "version", mode="before")
    @classmethod
    def _str_field(cls, v: Any) -> str:
        if v is None:
            return ""
        return str(v).strip()[:200] if isinstance(v, str) else str(v)[:200]


class RequirementDraftSlot(BaseModel):
    """One draft requirement on workspace create (home NLP). At most 3 total on ``WorkspaceCreateSlots``."""

    model_config = ConfigDict(extra="ignore")

    title: str = Field(default="", description="Short requirement title")
    description: str = Field(default="", description="Optional one-line detail")

    @field_validator("title", mode="before")
    @classmethod
    def _title(cls, v: Any) -> str:
        if v is None:
            return ""
        if isinstance(v, str):
            s = v.strip()
            return s[:200] if s else ""
        return ""

    @field_validator("description", mode="before")
    @classmethod
    def _desc(cls, v: Any) -> str:
        if v is None:
            return ""
        if isinstance(v, str):
            s = v.strip()
            return s[:2000] if s else ""
        return ""


class WorkspaceCreateSlots(BaseModel):
    """Parameters when ``intent == create_workspace``."""

    model_config = ConfigDict(extra="ignore")

    naming: Literal["explicit", "random", "unspecified"] = "unspecified"
    """explicit: user gave a name (``title`` required). random: 随机/随便. unspecified: default title."""

    title: str | None = Field(default=None, description="Workspace name when naming is explicit")

    @field_validator("title", mode="before")
    @classmethod
    def _clip_title(cls, v: Any) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s[:80] if s else None
        return None

    description: str | None = Field(
        default=None,
        description="Optional workspace purpose / 描述 / 用途 — not the display name",
    )

    @field_validator("description", mode="before")
    @classmethod
    def _clip_description(cls, v: Any) -> str | None:
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            return s[:2000] if s else None
        return None

    initial_requirements: list[RequirementDraftSlot] = Field(
        default_factory=list,
        description="1–3 draft requirements when user names distinct features / epics",
    )

    @field_validator("initial_requirements", mode="before")
    @classmethod
    def _initial_requirements(cls, v: Any) -> list[Any]:
        if not isinstance(v, list):
            return []
        out: list[Any] = []
        for item in v[:3]:
            if isinstance(item, dict):
                out.append(dict(item))
        return out


# ---------------------------------------------------------------------------
# Structured NLU prompt (JSON-only response)
# ---------------------------------------------------------------------------

def _structured_nlu_prompt() -> str:
    intent_guide = "\n".join(f"- {d.name}: {d.hint}" for d in INTENT_REGISTRY)
    example = json.dumps(
        {
            "intent": "create_workspace",
            "summary": "创建钱磊的工作空间，用于电商后台",
            "confidence": 0.95,
            "slots": {
                "workspace_create": {
                    "naming": "explicit",
                    "title": "钱磊",
                    "description": "电商后台相关协作与交付",
                    "initial_requirements": [
                        {"title": "商品与库存管理", "description": "SKU、上下架、库存同步"},
                        {"title": "订单与支付", "description": "下单、支付回调、对账"},
                    ],
                },
            },
            "alternatives": [],
        },
        ensure_ascii=False,
    )
    example_pleasant = json.dumps(
        {
            "intent": "create_workspace",
            "summary": "想要一个好听的工作空间名称",
            "confidence": 0.95,
            "slots": {
                "workspace_create": {
                    "naming": "unspecified",
                    "title": "听澜斋",
                    "description": None,
                },
            },
            "alternatives": [],
        },
        ensure_ascii=False,
    )
    return (
        "You are an NLU module. Given the user message, reply with ONLY one JSON object (no markdown).\n"
        "Schema:\n"
        "{\n"
        '  "intent": "<one of INTENT_TYPES>",\n'
        '  "summary": "<one short line in the user\'s language; what they want, not system meta>",\n'
        '  "confidence": <number 0.0-1.0>,\n'
        '  "slots": { ... },\n'
        '  "alternatives": [{"intent": "<type>", "summary": "<why>"}]\n'
        "}\n\n"
        "slots rules:\n"
        '- For almost all intents use "slots": {}.\n'
        '- For create_workspace ONLY, set slots.workspace_create:\n'
        '    { "naming": "explicit", "title": "<exact name>" } when the user gives a concrete name '
        '(e.g. 名字叫X, named X, 「X」).\n'
        '    { "naming": "random", "title": null } when they want a machine-picked name: '
        "随机、随便、随机取、random、起个名就行（不要求好听或文艺）等。\n"
        '    { "naming": "unspecified", "title": "<short invented name>" } when they want a new workspace and ask you '
        "to come up with a pleasant/creative name but do NOT give exact characters: e.g. 好听、好听一点、文艺、诗意、"
        "有意思、帮我想个名字、起个好听的名字. Invent 2–10 Chinese characters only, no full sentence.\n"
        '    { "naming": "unspecified", "title": null } ONLY when they want a blank new workspace with no naming '
        "hint at all (e.g. just「新建工作空间」).\n"
        "- Optional \"description\": purpose — 描述/用途/用来/用于/做… 项目. Use null if they mention only naming style, "
        "no project goal.\n"
        '- Optional \"initial_requirements\": array of 1–3 objects {\"title\": \"...\", \"description\": \"...\"} when the '
        "user names distinct features, epics, or bullets (e.g. 「先做A再做B」, login + payment, 包括…和…). "
        "Titles short; description optional one line. Use [] or omit if they only want a workspace shell "
        "(no separate requirement breakdown).\n"
        "- For trigger_build, view_build_log, deploy, rollback set slots.pipeline:\n"
        '    { "project": "<project name or ID>", "branch": "<branch>", "env": "<test|staging|prod>", '
        '"pipeline_id": "<id if viewing logs>", "version": "<tag for rollback>" }.\n'
        "  Extract what the user provides; omit fields they don't mention.\n"
        "- Never copy the full user message into title; extracted or invented short name only.\n"
        "confidence: 1.0 = sure; use alternatives when 0.5-0.8.\n\n"
        f"INTENT_TYPES: {', '.join(INTENT_TYPES)}\n\n"
        f"Intent guide:\n{intent_guide}\n\n"
        f"Example (explicit name + purpose):\n{example}\n"
        f"Example (user wants a nice name, you invent title):\n{example_pleasant}\n"
        "Reply with JSON only."
    )


STRUCTURED_NLU_PROMPT: str = _structured_nlu_prompt()


# ---------------------------------------------------------------------------
# JSON extraction helpers
# ---------------------------------------------------------------------------

_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*\n?(.*?)\n?```", re.DOTALL)
_FIRST_BRACE_RE = re.compile(r"\{.*\}", re.DOTALL)


def _extract_json(text: str) -> dict[str, Any]:
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

    return {"intent": "general_chat", "summary": text[:120], "confidence": 0.2, "slots": {}, "alternatives": []}


def _normalize_slots_for_intent(intent_name: str, slots_raw: Any) -> dict[str, Any]:
    if not isinstance(slots_raw, dict):
        slotsraw: dict[str, Any] = {}
    else:
        slotsraw = dict(slots_raw)

    if intent_name == "create_workspace":
        try:
            wc = WorkspaceCreateSlots.model_validate(slotsraw.get("workspace_create") or {})
            return {"workspace_create": wc.model_dump()}
        except Exception:
            return {"workspace_create": WorkspaceCreateSlots().model_dump()}

    _PIPELINE_INTENTS = {"trigger_build", "view_build_log", "deploy", "rollback"}
    if intent_name in _PIPELINE_INTENTS:
        try:
            ps = PipelineSlots.model_validate(slotsraw.get("pipeline") or {})
            return {"pipeline": ps.model_dump()}
        except Exception:
            return {"pipeline": PipelineSlots().model_dump()}

    out = {k: v for k, v in slotsraw.items() if k != "workspace_create"}
    return out


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
    """Structured parameters per intent (e.g. slots['workspace_create'])."""
    slots: dict[str, Any] = Field(default_factory=dict)


def resolve_home_workspace_suggested_name(
    parsed: ParsedIntent,
    random_title: Callable[[], str],
) -> str:
    """Home page ``workspace_create`` action: concrete title for workspace-svc."""
    if parsed.intent != "create_workspace":
        s = (parsed.summary or "").strip()
        return (s[:40] if s else "") or "新工作空间"

    wc = parsed.slots.get("workspace_create") or {}
    if not isinstance(wc, dict):
        wc = {}
    naming = str(wc.get("naming", "unspecified") or "unspecified").lower()
    raw_title = wc.get("title")
    title = raw_title.strip() if isinstance(raw_title, str) else None
    if title == "":
        title = None

    if naming == "explicit":
        return (title[:80] if title else "新工作空间")
    if naming == "random":
        return random_title()
    if title:
        return title[:80]
    # LLM returned create_workspace but no title (e.g. misclassified「好听」as blank) — not model-chosen text
    return "新工作空间"


def resolve_home_workspace_description(parsed: ParsedIntent) -> str:
    """Optional workspace description for create API (create_workspace slots only)."""
    if parsed.intent != "create_workspace":
        return ""

    wc = parsed.slots.get("workspace_create") or {}
    if not isinstance(wc, dict):
        return ""

    raw = wc.get("description")
    if not isinstance(raw, str):
        return ""

    text = raw.strip()
    if not text:
        return ""

    return text[:2000]


def resolve_home_initial_requirements(parsed: ParsedIntent) -> list[dict[str, str]]:
    """1–3 draft requirements for home ``workspace_create`` action payload (non-empty titles only)."""
    if parsed.intent != "create_workspace":
        return []

    wc = parsed.slots.get("workspace_create") or {}
    if not isinstance(wc, dict):
        return []

    raw = wc.get("initial_requirements")
    if not isinstance(raw, list):
        return []

    out: list[dict[str, str]] = []
    for item in raw[:3]:
        if not isinstance(item, dict):
            continue
        title_raw = item.get("title")
        if not isinstance(title_raw, str) or not title_raw.strip():
            continue
        desc_raw = item.get("description")
        ds = desc_raw.strip() if isinstance(desc_raw, str) else ""
        out.append({"title": title_raw.strip()[:200], "description": ds[:2000]})

    return out


async def parse_intent(
    user_input: str,
    llm: LLMGatewayClient,
    *,
    extra_context: dict[str, Any] | None = None,
) -> ParsedIntent:
    messages: list[dict[str, str]] = [
        {"role": "system", "content": STRUCTURED_NLU_PROMPT},
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

    slots = _normalize_slots_for_intent(intent_name, data.get("slots"))

    alternatives: list[AlternativeIntent] = []
    for alt in data.get("alternatives", []):
        if not isinstance(alt, dict):
            continue
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
        summary=str(data.get("summary", "") or ""),
        target_agent=_AGENT_MAP.get(intent_name, AgentType.PM),
        confidence=confidence,
        is_ambiguous=is_ambiguous,
        is_fallback=is_fallback,
        alternatives=alternatives[:3],
        slots=slots,
    )
