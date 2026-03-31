"""PM Agent – FastAPI application (orchestrator entry point).

Business logic is split into:
  handlers/   – intent handlers (task, requirement, phase)
  context.py  – GitLab context enrichment and phase extraction
  stream.py   – SSE delta streaming helper
  intent.py   – LLM-based intent classification
  workflow.py – WorkflowEngine for phase/project execution
  dispatch.py – Agent dispatcher (HTTP forwarding)
  session.py  – Unified execution session manager
"""

from __future__ import annotations

import json
import random
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from vibeos_agent import (
    AgentStatus,
    AgentTask,
    AgentType,
    GraphExecutor,
    HAS_LANGGRAPH,
    LLMGatewayClient,
    MemoryClient,
    RegistryClient,
    WSGatewayClient,
    WorkspaceClient,
    load_manifest_from_yaml,
)

from .context import enrich_context_with_gitlab
from .dispatch import Dispatcher
from .handlers import execute_pm_intent
from .home_actions import yield_home_events
from .intent import (
    INTENT_LABELS,
    load_intents_from_registry,
    parse_intent,
)
from .session import SessionManager
from .stream import yield_text_as_deltas
from .workflow import WorkflowEngine

AGENT_LABELS: dict[str, dict[str, str]] = {
    "pm": {"zh": "项目管理 Agent", "en": "PM Agent"},
    "requirement": {"zh": "需求 Agent", "en": "Req Agent"},
    "architecture": {"zh": "架构 Agent", "en": "Arch Agent"},
    "design": {"zh": "设计 Agent", "en": "Design Agent"},
    "development": {"zh": "开发 Agent", "en": "Dev Agent"},
    "testing": {"zh": "测试 Agent", "en": "Test Agent"},
    "cicd": {"zh": "CI/CD Agent", "en": "CI/CD Agent"},
    "monitoring": {"zh": "监控 Agent", "en": "Mon Agent"},
}


_HOME_WS_PREFIXES_ZH = ("雾屿", "星澜", "云洲", "青谷", "极客", "灵境", "数智", "光年")
_HOME_WS_SUFFIXES_ZH = ("智研空间", "实验室", "工作台", "创新坊", "工作室", "工场")


def _random_workspace_title() -> str:
    return f"{random.choice(_HOME_WS_PREFIXES_ZH)}{random.choice(_HOME_WS_SUFFIXES_ZH)}"


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm = LLMGatewayClient()
    app.state.dispatcher = Dispatcher()
    app.state.ws = WSGatewayClient()
    app.state.ws_client = WorkspaceClient()
    app.state.memory = MemoryClient()
    app.state.registry = RegistryClient()
    app.state.sm = SessionManager(app.state.ws_client, app.state.ws)
    app.state.graph_executor = GraphExecutor(app.state.registry) if HAS_LANGGRAPH else None
    app.state.workflow = WorkflowEngine(
        app.state.dispatcher, app.state.ws_client, app.state.ws, app.state.sm,
        graph_executor=app.state.graph_executor,
    )
    _manifest_path = Path(__file__).resolve().parent.parent / "agent-manifest.yaml"
    if _manifest_path.exists():
        try:
            manifest = load_manifest_from_yaml(_manifest_path)
            await app.state.registry.register_manifest(manifest)
        except Exception:
            pass
    await load_intents_from_registry(app.state.registry)
    yield
    await app.state.llm.close()
    await app.state.dispatcher.close()
    await app.state.ws.close()
    await app.state.ws_client.close()
    await app.state.memory.close()
    await app.state.registry.close()


app = FastAPI(title="PM Agent", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class NLPRequest(BaseModel):
    workspace_id: str
    message: str
    context: dict[str, Any] | None = None

class NLPResponse(BaseModel):
    intent: str
    summary: str
    target_agent: str
    result: dict[str, Any] | None = None
    slots: dict[str, Any] = {}

class ChatRequest(BaseModel):
    workspace_id: str
    message: str

class ChatResponse(BaseModel):
    agent_type: str
    reply: str
    rich_blocks: list[dict[str, Any]] = []

class RunTaskRequest(BaseModel):
    workspace_id: str
    task_id: str
    user_message: str = ""

class RunPhaseRequest(BaseModel):
    workspace_id: str
    phase_type: str
    user_message: str = ""

class RunProjectRequest(BaseModel):
    workspace_id: str
    user_message: str = ""
    start_phase: str | None = None

class RunRequirementRequest(BaseModel):
    workspace_id: str
    requirement_id: str
    phase_type: str | None = None
    user_message: str = ""

class ClassifyRequest(BaseModel):
    message: str

class ClassifyResponse(BaseModel):
    intent: str
    summary: str
    target_agent: str
    confidence: float
    is_ambiguous: bool
    intent_label: dict[str, str]
    agent_label: dict[str, str]
    alternatives: list[dict[str, Any]] = []
    slots: dict[str, Any] = {}

class FeedbackRequest(BaseModel):
    workspace_id: str
    message_id: str = ""
    agent_type: str = ""
    action_type: str
    original_output: str = ""
    context: dict[str, Any] | None = None

class GraphExecuteRequest(BaseModel):
    template_id: str = ""
    graph_def: dict[str, Any] | None = None
    input_state: dict[str, Any] = {}
    workspace_id: str = ""

class GraphValidateRequest(BaseModel):
    graphDef: dict[str, Any]


# ---------------------------------------------------------------------------
# Intent classification (lightweight, no workspace required)
# ---------------------------------------------------------------------------

@app.post("/api/nlp/classify", response_model=ClassifyResponse)
async def handle_classify(req: ClassifyRequest) -> ClassifyResponse:
    llm: LLMGatewayClient = app.state.llm
    parsed = await parse_intent(req.message, llm)
    alternatives = [
        {
            "intent": alt.intent, "summary": alt.summary,
            "target_agent": alt.target_agent.value,
            "intent_label": INTENT_LABELS.get(alt.intent, {}),
            "agent_label": AGENT_LABELS.get(alt.target_agent.value, {}),
        }
        for alt in parsed.alternatives
    ]
    return ClassifyResponse(
        intent=parsed.intent, summary=parsed.summary,
        target_agent=parsed.target_agent.value,
        confidence=parsed.confidence, is_ambiguous=parsed.is_ambiguous,
        intent_label=INTENT_LABELS.get(parsed.intent, {}),
        agent_label=AGENT_LABELS.get(parsed.target_agent.value, {}),
        alternatives=alternatives, slots=parsed.slots,
    )


# ---------------------------------------------------------------------------
# Helper: build intent event payload
# ---------------------------------------------------------------------------

def _intent_payload(parsed: Any) -> dict[str, Any]:
    agent_val = parsed.target_agent.value
    payload: dict[str, Any] = {
        "intent": parsed.intent,
        "summary": parsed.summary,
        "target_agent": agent_val,
        "confidence": parsed.confidence,
        "is_ambiguous": parsed.is_ambiguous,
        "is_fallback": parsed.is_fallback,
        "intent_label": INTENT_LABELS.get(parsed.intent, {}),
        "agent_label": AGENT_LABELS.get(agent_val, {}),
    }
    if parsed.alternatives:
        payload["alternatives"] = [
            {
                "intent": alt.intent, "summary": alt.summary,
                "target_agent": alt.target_agent.value,
                "intent_label": INTENT_LABELS.get(alt.intent, {}),
                "agent_label": AGENT_LABELS.get(alt.target_agent.value, {}),
            }
            for alt in parsed.alternatives
        ]
    if parsed.slots:
        payload["slots"] = parsed.slots
    return payload


# ---------------------------------------------------------------------------
# NLP routes
# ---------------------------------------------------------------------------

@app.post("/api/nlp", response_model=NLPResponse)
async def handle_nlp(req: NLPRequest) -> NLPResponse:
    llm: LLMGatewayClient = app.state.llm
    dispatcher: Dispatcher = app.state.dispatcher
    ws: WSGatewayClient = app.state.ws
    ws_client: WorkspaceClient = app.state.ws_client
    workflow: WorkflowEngine = app.state.workflow

    try:
        await ws.publish_log(req.workspace_id, "pm", f"Received message: {req.message[:80]}…")
        parsed = await parse_intent(req.message, llm, extra_context=req.context)
        await ws.publish_log(req.workspace_id, "pm", f"Intent: {parsed.intent} → {parsed.target_agent.value}", level="success")
        await ws.publish_agent_status(req.workspace_id, AgentType.PM, AgentStatus.RUNNING, detail=f"Parsed intent: {parsed.intent}")

        if parsed.target_agent == AgentType.PM:
            result = await execute_pm_intent(
                parsed, req.workspace_id, req.message, req.context, llm, ws, ws_client, workflow, dispatcher,
                registry=app.state.registry,
            )
            return NLPResponse(intent=parsed.intent, summary=result.get("summary", parsed.summary), target_agent=parsed.target_agent.value, result=result, slots=parsed.slots)

        enriched_ctx = await enrich_context_with_gitlab(req.workspace_id, req.context, ws_client)
        task = AgentTask(task_id=uuid.uuid4().hex, workspace_id=req.workspace_id, intent=parsed.intent, description=parsed.summary, user_message=req.message, context=enriched_ctx)
        result = await dispatcher.dispatch(parsed.target_agent, task)
        return NLPResponse(intent=parsed.intent, summary=parsed.summary, target_agent=parsed.target_agent.value, result=result, slots=parsed.slots)
    except Exception:
        await ws.publish_agent_status(req.workspace_id, AgentType.PM, AgentStatus.ERROR, detail="NLP processing failed")
        raise
    finally:
        try:
            await ws.publish_agent_status(req.workspace_id, AgentType.PM, AgentStatus.IDLE)
        except Exception:
            pass


@app.post("/api/nlp/stream")
async def handle_nlp_stream(req: NLPRequest) -> StreamingResponse:
    """SSE streaming NLP with unified protocol."""
    llm: LLMGatewayClient = app.state.llm
    dispatcher: Dispatcher = app.state.dispatcher
    ws: WSGatewayClient = app.state.ws
    ws_client: WorkspaceClient = app.state.ws_client
    workflow: WorkflowEngine = app.state.workflow
    sm: SessionManager = app.state.sm

    is_home = req.workspace_id == "__home__"

    async def event_gen() -> AsyncGenerator[str, None]:
        sid = await sm.create("nlp", req.workspace_id, user_message=req.message, triggered_by="user")
        yield sm.session_start(sid, "nlp", req.workspace_id)

        try:
            yield sm.timeline(sid, "parse", "理解意图 / Understanding intent", "running")
            if not is_home:
                await ws.publish_log(req.workspace_id, "pm", f"Received message: {req.message[:80]}…")
            parsed = await parse_intent(req.message, llm, extra_context=req.context)
            if not is_home:
                await ws.publish_log(req.workspace_id, "pm", f"Intent: {parsed.intent} → {parsed.target_agent.value}", level="success")

            yield sm.ev(sid, "intent", "parsed", _intent_payload(parsed))
            yield sm.timeline(sid, "parse", "理解意图 / Understanding intent", "completed", parsed.summary)

            # --- Home context ---
            if is_home:
                async for event in yield_home_events(
                    parsed, llm, req.message,
                    random_title=_random_workspace_title,
                    agent_labels=AGENT_LABELS, sm=sm, sid=sid,
                ):
                    yield event
                yield sm.session_complete(sid)
                yield sm.done()
                return

            # --- Ambiguous intent ---
            if parsed.is_ambiguous:
                options = [{"id": parsed.intent, "label": INTENT_LABELS.get(parsed.intent, {}).get("zh", parsed.intent), "intent": parsed.intent, "agent_type": parsed.target_agent.value}]
                for alt in parsed.alternatives:
                    options.append({"id": alt.intent, "label": INTENT_LABELS.get(alt.intent, {}).get("zh", alt.intent), "intent": alt.intent, "agent_type": alt.target_agent.value})
                yield sm.ev(sid, "intent", "ambiguous", {"prompt": "我不太确定你的意图，请选择最接近的操作：", "options": options})
                yield sm.session_complete(sid)
                yield sm.done()
                return

            # --- Fallback ---
            if parsed.is_fallback:
                yield sm.content_block(sid, "error_card", {
                    "error_type": "intent_unclear",
                    "message": "无法精确识别意图，已切换到自由对话模式。",
                    "hints": ["试试: \"帮我创建一个XXX功能的需求\"", "试试: \"@design 设计登录页面\"", "试试: \"/deploy 部署到测试环境\""],
                })

            # --- Busy workspace ---
            if parsed.intent not in ("general_chat", "query_progress") and workflow.is_busy(req.workspace_id):
                yield sm.content_block(sid, "error_card", {
                    "error_type": "system_error",
                    "message": "当前工作空间正在执行任务，请等待完成后再操作。",
                    "actions": [{"id": "wait", "label": "等待", "variant": "secondary"}],
                })
                yield sm.session_complete(sid, "cancelled")
                yield sm.done()
                return

            await ws.publish_agent_status(req.workspace_id, AgentType.PM, AgentStatus.RUNNING, detail=f"Parsed intent: {parsed.intent}")

            # --- PM agent path ---
            if parsed.target_agent == AgentType.PM:
                async for evt in _nlp_pm_path(sid, sm, parsed, req, llm, ws_client, workflow, dispatcher):
                    yield evt
                return

            # --- Non-PM agent dispatch ---
            async for evt in _nlp_dispatch_path(sid, sm, parsed, req, ws_client, dispatcher):
                yield evt

        except Exception as exc:
            error_str = str(exc)
            if "rate" in error_str.lower() or "limit" in error_str.lower():
                yield sm.content_block(sid, "error_card", {"error_type": "system_error", "message": "AI 模型已达到使用限制，请稍后重试。", "actions": [{"id": "retry", "label": "稍后重试", "variant": "primary"}]})
            elif "timeout" in error_str.lower():
                yield sm.content_block(sid, "error_card", {"error_type": "system_error", "message": "请求超时，请稍后重试。", "actions": [{"id": "retry", "label": "重试", "variant": "primary"}]})
            else:
                yield sm.content_block(sid, "error_card", {"error_type": "system_error", "message": f"处理时发生错误: {error_str}", "actions": [{"id": "retry", "label": "重试", "variant": "primary"}]})
            yield sm.session_error(sid, error_str)
            await sm.finish(sid, req.workspace_id, "failed", error_str)
            yield sm.done()
        finally:
            if not is_home:
                try:
                    await ws.publish_agent_status(req.workspace_id, AgentType.PM, AgentStatus.IDLE)
                except Exception:
                    pass

    return StreamingResponse(event_gen(), media_type="text/event-stream")


async def _nlp_pm_path(sid, sm, parsed, req, llm, ws_client, workflow, dispatcher):
    """PM agent execution within NLP stream."""
    # General chat — direct LLM response
    if parsed.intent == "general_chat" and not (req.context or {}).get("zero_requirements"):
        yield sm.timeline(sid, "exec", "生成回复 / Generating reply", "running")
        messages = [
            {"role": "system", "content": "You are VibeOS PM assistant. Help the user with project management, planning, and general questions. Respond in clear natural language."},
            {"role": "user", "content": req.message},
        ]
        async for chunk in llm.chat_stream(messages):
            delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
            if delta:
                yield sm.content_delta(sid, delta)
        yield sm.timeline(sid, "exec", "生成回复 / Generating reply", "completed")
        yield sm.content_block(sid, "nlp_action", {"action_type": "confirm", "action_label": "继续追问", "action_variant": "secondary"})
        yield sm.session_complete(sid)
        await sm.finish(sid, req.workspace_id)
        yield sm.done()
        return

    # PM intent execution
    _PIPELINE_INTENTS = {"trigger_build", "view_build_log", "deploy", "rollback"}
    is_pipeline = parsed.intent in _PIPELINE_INTENTS
    timeline_label = (
        {"trigger_build": "触发构建 / Triggering build", "view_build_log": "查询日志 / Fetching logs", "deploy": "部署中 / Deploying", "rollback": "回滚中 / Rolling back"}.get(parsed.intent, "执行中 / Executing")
        if is_pipeline else "执行中 / Executing"
    )
    yield sm.timeline(sid, "exec", timeline_label, "running")

    result = await execute_pm_intent(
        parsed, req.workspace_id, req.message, req.context, llm, app.state.ws, ws_client, workflow, dispatcher,
        registry=app.state.registry,
    )

    # Graph template resolved
    if result.get("handler_type") == "graph" and result.get("graph_def"):
        executor: GraphExecutor | None = app.state.graph_executor
        if not executor:
            yield sm.content_block(sid, "error_card", {"error_type": "system_error", "message": "LangGraph not available"})
            yield sm.session_complete(sid, "failed")
            yield sm.done()
            return
        yield sm.timeline(sid, "exec", "执行图工作流 / Executing graph workflow", "running")
        try:
            async for event in executor.execute(result["graph_def"], {"user_message": req.message, "workspace_id": req.workspace_id}):
                yield sm.ev(sid, "graph", event["event"].split(":")[-1], event.get("data", {}))
            yield sm.timeline(sid, "exec", "执行图工作流 / Executing graph workflow", "completed")
        except Exception as exc:
            yield sm.ev(sid, "graph", "error", {"error": str(exc)})
            yield sm.timeline(sid, "exec", "执行图工作流 / Executing graph workflow", "error")
        yield sm.content_block(sid, "nlp_action", {"action_type": "confirm", "action_label": "查看结果", "action_variant": "primary"})
        yield sm.session_complete(sid)
        await sm.finish(sid, req.workspace_id)
        yield sm.done()
        return

    summary = result.get("summary", parsed.summary)

    if result.get("action") == "requirement_preview" and result.get("requirement_preview"):
        yield sm.content_block(sid, "requirement_preview", result["requirement_preview"])

    async for evt in yield_text_as_deltas(sid, summary):
        yield evt

    payload_extras: dict[str, Any] = {}
    for key in ("created_tasks", "artifacts", "pipeline_task_id", "pipeline_url"):
        if result.get(key):
            payload_extras[key] = result[key]
    if payload_extras:
        yield sm.content_payload(sid, payload_extras)

    status = "completed" if "failed" not in result.get("action", "") else "error"
    yield sm.timeline(sid, "exec", timeline_label, status)

    action = result.get("action", "")
    if action in ("requirement_preview", "requirement_created"):
        yield sm.content_block(sid, "nlp_action", {"action_type": "navigate", "action_label": "查看详情", "action_variant": "primary", "action_payload": {"target": "requirement_detail"}})
        yield sm.content_block(sid, "nlp_action", {"action_type": "confirm", "action_label": "继续优化", "action_variant": "secondary"})
    elif is_pipeline and result.get("pipeline_url"):
        yield sm.content_block(sid, "nlp_action", {"action_type": "open_url", "action_label": "查看 Pipeline", "action_variant": "primary", "action_payload": {"url": result["pipeline_url"]}})
        yield sm.content_block(sid, "nlp_action", {"action_type": "confirm", "action_label": "查看日志", "action_variant": "secondary"})
    elif result.get("created_tasks"):
        yield sm.content_block(sid, "nlp_action", {"action_type": "navigate", "action_label": "查看任务", "action_variant": "primary", "action_payload": {"target": "task_list"}})
        yield sm.content_block(sid, "nlp_action", {"action_type": "phase_execute", "action_label": "开始执行", "action_variant": "secondary", "action_payload": {"phase": "requirement"}})
    else:
        yield sm.content_block(sid, "nlp_action", {"action_type": "confirm", "action_label": "继续追问", "action_variant": "secondary"})

    yield sm.session_complete(sid)
    await sm.finish(sid, req.workspace_id)
    yield sm.done()


async def _nlp_dispatch_path(sid, sm, parsed, req, ws_client, dispatcher):
    """Non-PM agent dispatch within NLP stream."""
    yield sm.timeline(sid, "dispatch", f"分发到 {parsed.target_agent.value} Agent", "running")

    enriched_ctx = await enrich_context_with_gitlab(req.workspace_id, req.context, ws_client)
    task = AgentTask(
        task_id=uuid.uuid4().hex, workspace_id=req.workspace_id,
        intent=parsed.intent, description=parsed.summary,
        user_message=req.message, context=enriched_ctx,
    )

    has_result = False
    async for chunk in dispatcher.dispatch_stream(parsed.target_agent, task):
        chunk_type = chunk.get("type", "")
        if chunk.get("error"):
            err_msg = chunk["error"]
            if "未启动" in err_msg or "not running" in err_msg.lower():
                yield sm.content_block(sid, "error_card", {"error_type": "agent_unavailable", "message": err_msg, "hints": ["请确保对应的 Agent 服务已启动"], "actions": [{"id": "retry", "label": "重试", "variant": "primary"}, {"id": "switch_agent", "label": "换个 Agent", "variant": "secondary"}]})
            else:
                yield sm.content_block(sid, "error_card", {"error_type": "system_error", "message": err_msg, "actions": [{"id": "retry", "label": "重试", "variant": "primary"}]})
            yield sm.timeline(sid, "dispatch", f"分发到 {parsed.target_agent.value} Agent", "error", err_msg)
            break

        if chunk_type == "result":
            has_result = True
            payload = chunk.get("payload", {})
            summary_text = payload.get("summary", "") or chunk.get("summary", "")
            if summary_text:
                async for evt in yield_text_as_deltas(sid, summary_text):
                    yield evt
            rich_payload = {k: payload[k] for k in ("artifacts", "code_artifacts", "created_tasks") if payload.get(k)}
            if rich_payload:
                yield sm.content_payload(sid, rich_payload)
        else:
            yield sm.content_payload(sid, chunk)

    if has_result:
        yield sm.timeline(sid, "dispatch", f"分发到 {parsed.target_agent.value} Agent", "completed")
        yield sm.content_block(sid, "nlp_action", {"action_type": "navigate", "action_label": "查看详情", "action_variant": "primary", "action_payload": {"target": "detail"}})
        yield sm.content_block(sid, "nlp_action", {"action_type": "confirm", "action_label": "继续追问", "action_variant": "secondary"})

    yield sm.session_complete(sid)
    await sm.finish(sid, req.workspace_id)
    yield sm.done()


# ---------------------------------------------------------------------------
# Chat routes
# ---------------------------------------------------------------------------

@app.post("/api/chat/{agent_type}", response_model=ChatResponse)
async def handle_chat(agent_type: str, req: ChatRequest) -> ChatResponse:
    dispatcher: Dispatcher = app.state.dispatcher
    llm: LLMGatewayClient = app.state.llm
    try:
        at = AgentType(agent_type)
    except ValueError:
        return ChatResponse(agent_type=agent_type, reply=f"未知的 Agent 类型: {agent_type}")
    try:
        if at == AgentType.PM:
            messages = [
                {"role": "system", "content": "你是VibeOS项目管理助手，帮助用户分析需求、规划任务和协调团队工作。"},
                {"role": "user", "content": req.message},
            ]
            result = await llm.chat(messages)
            reply = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            return ChatResponse(agent_type=agent_type, reply=reply)
        else:
            result = await dispatcher.forward_chat(at, req.workspace_id, req.message)
            return ChatResponse(agent_type=agent_type, reply=result.get("reply", ""), rich_blocks=result.get("rich_blocks", []))
    except Exception as exc:
        agent_names = {"requirement": "需求", "architecture": "架构", "design": "设计", "development": "开发", "testing": "测试", "cicd": "CI/CD", "monitoring": "监控", "pm": "项目管理"}
        return ChatResponse(agent_type=agent_type, reply=f"{agent_names.get(agent_type, agent_type)} Agent 处理时出错: {exc}")


@app.post("/api/chat/{agent_type}/stream")
async def handle_chat_stream(agent_type: str, req: ChatRequest) -> StreamingResponse:
    dispatcher: Dispatcher = app.state.dispatcher
    sm: SessionManager = app.state.sm

    try:
        at = AgentType(agent_type)
    except ValueError:
        async def err_gen() -> AsyncGenerator[str, None]:
            sid = uuid.uuid4().hex
            yield sm.session_error(sid, f"Unknown agent type: {agent_type}")
            yield sm.done()
        return StreamingResponse(err_gen(), media_type="text/event-stream")

    async def token_gen() -> AsyncGenerator[str, None]:
        llm: LLMGatewayClient = app.state.llm
        sid = await sm.create("chat", req.workspace_id, user_message=req.message, agent_type=agent_type, triggered_by="user")
        yield sm.session_start(sid, "chat", req.workspace_id)
        try:
            if at == AgentType.PM:
                messages = [
                    {"role": "system", "content": "你是VibeOS项目管理助手，帮助用户分析需求、规划任务和协调团队工作。"},
                    {"role": "user", "content": req.message},
                ]
                async for chunk in llm.chat_stream(messages):
                    delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if delta:
                        yield sm.content_delta(sid, delta)
            else:
                async for chunk in dispatcher.forward_chat_stream(at, req.workspace_id, req.message):
                    if chunk.get("error"):
                        yield sm.session_error(sid, chunk["error"])
                        await sm.finish(sid, req.workspace_id, "failed", chunk["error"])
                        yield sm.done()
                        return
                    if chunk.get("delta"):
                        yield sm.content_delta(sid, chunk["delta"])
                    elif chunk.get("summary"):
                        yield sm.content_delta(sid, chunk["summary"])
                    else:
                        yield sm.content_payload(sid, chunk)
        except Exception as exc:
            yield sm.session_error(sid, str(exc))
            await sm.finish(sid, req.workspace_id, "failed", str(exc))
            yield sm.done()
            return
        yield sm.session_complete(sid)
        await sm.finish(sid, req.workspace_id)
        yield sm.done()

    return StreamingResponse(token_gen(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Workflow routes
# ---------------------------------------------------------------------------

@app.post("/api/workflow/run-task")
async def handle_run_task(req: RunTaskRequest) -> StreamingResponse:
    workflow: WorkflowEngine = app.state.workflow

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in workflow.run_task(req.workspace_id, req.task_id, req.user_message):
                yield event
        except Exception as exc:
            sid = uuid.uuid4().hex
            yield app.state.sm.session_error(sid, str(exc))
        yield app.state.sm.done()

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/workflow/run-phase")
async def handle_run_phase(req: RunPhaseRequest) -> StreamingResponse:
    workflow: WorkflowEngine = app.state.workflow

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in workflow.run_phase(req.workspace_id, req.phase_type, req.user_message):
                yield event
        except Exception as exc:
            sid = uuid.uuid4().hex
            yield app.state.sm.session_error(sid, str(exc))
        yield app.state.sm.done()

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/workflow/run-project")
async def handle_run_project_route(req: RunProjectRequest) -> StreamingResponse:
    workflow: WorkflowEngine = app.state.workflow

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in workflow.run_project(req.workspace_id, req.user_message, start_phase=req.start_phase):
                yield event
        except Exception as exc:
            sid = uuid.uuid4().hex
            yield app.state.sm.session_error(sid, str(exc))
        yield app.state.sm.done()

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/workflow/run-requirement")
async def handle_run_requirement(req: RunRequirementRequest) -> StreamingResponse:
    workflow: WorkflowEngine = app.state.workflow

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in workflow.run_requirement(req.workspace_id, req.requirement_id, req.user_message, req.phase_type):
                yield event
        except Exception as exc:
            sid = uuid.uuid4().hex
            yield app.state.sm.session_error(sid, str(exc))
        yield app.state.sm.done()

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Graph execution routes
# ---------------------------------------------------------------------------

@app.post("/api/graph/execute")
async def handle_graph_execute(req: GraphExecuteRequest) -> StreamingResponse:
    executor: GraphExecutor | None = app.state.graph_executor
    registry: RegistryClient = app.state.registry
    ws_client: WorkspaceClient = app.state.ws_client
    sm: SessionManager = app.state.sm

    async def event_gen() -> AsyncGenerator[str, None]:
        sid = await sm.create("graph", req.workspace_id or "__graph__", user_message="", intent_type="graph_execute", triggered_by="user")
        yield sm.session_start(sid, "graph", req.workspace_id or "__graph__")

        if not executor:
            yield sm.session_error(sid, "LangGraph not available")
            yield sm.done()
            return

        graph_def = req.graph_def
        if not graph_def and req.workspace_id:
            try:
                resp = await ws_client._http.get(f"/api/workspaces/{req.workspace_id}/graphs/active")
                if resp.status_code == 200:
                    body = resp.json()
                    data = body.get("data")
                    if data and isinstance(data, dict) and data.get("graphDef"):
                        gd = data["graphDef"]
                        if isinstance(gd, dict) and gd.get("nodes"):
                            graph_def = gd
            except Exception:
                pass

        if not graph_def and req.template_id:
            templates = await registry.list_templates(enabled_only=False)
            for t in templates:
                if t.get("id") == req.template_id:
                    graph_def = t.get("graphDef", {})
                    break

        if not graph_def or not graph_def.get("nodes"):
            yield sm.session_error(sid, "No graph definition found")
            yield sm.done()
            return

        try:
            async for event in executor.execute(graph_def, req.input_state):
                action = event["event"].split(":")[-1] if ":" in event["event"] else event["event"]
                yield sm.ev(sid, "graph", action, event.get("data", {}))
        except Exception as exc:
            yield sm.ev(sid, "graph", "error", {"error": str(exc)})

        yield sm.session_complete(sid)
        await sm.finish(sid, req.workspace_id or "__graph__")
        yield sm.done()

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/graph/validate")
async def handle_graph_validate(req: GraphValidateRequest) -> dict[str, Any]:
    registry: RegistryClient = app.state.registry
    errors: list[str] = []
    nodes = req.graphDef.get("nodes", [])
    edges = req.graphDef.get("edges", [])
    if not nodes:
        errors.append("Graph has no nodes")
    node_ids = {n.get("id", "") for n in nodes}
    node_ids.add("__start__")
    node_ids.add("__end__")
    for edge in edges:
        src, tgt = edge.get("source", ""), edge.get("target", "")
        if src not in node_ids:
            errors.append(f"Edge source '{src}' not found in nodes")
        if tgt not in node_ids:
            errors.append(f"Edge target '{tgt}' not found in nodes")
    cap_refs = [n.get("capability_ref", n.get("capabilityRef", "")) for n in nodes if n.get("type") == "capability"]
    if cap_refs:
        try:
            caps = await registry.list_capabilities()
            known = {c.get("name", "") for c in caps}
            for ref in cap_refs:
                if ref and ref not in known:
                    errors.append(f"Capability '{ref}' not found in registry")
        except Exception:
            errors.append("Could not verify capabilities (registry unavailable)")
    return {"data": {"valid": len(errors) == 0, "errors": errors}}


# ---------------------------------------------------------------------------
# Feedback & health
# ---------------------------------------------------------------------------

@app.post("/api/feedback")
async def handle_feedback(req: FeedbackRequest) -> dict[str, Any]:
    memory: MemoryClient = app.state.memory
    ws_client: WorkspaceClient = app.state.ws_client
    try:
        result = await memory.record_feedback(
            workspace_id=req.workspace_id, agent_type=req.agent_type,
            action_type=req.action_type, context=req.context or {},
            original_output=req.original_output,
        )
    except Exception as exc:
        return {"status": "error", "error": str(exc)}
    try:
        await ws_client._http.post(
            f"/api/workspaces/{req.workspace_id}/feedback",
            json={"agentType": req.agent_type, "actionType": req.action_type, "originalOutput": req.original_output[:1000] if req.original_output else "", "context": json.dumps(req.context or {})},
        )
    except Exception:
        pass
    return {"status": "ok", "result": result}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "pm-agent"}
