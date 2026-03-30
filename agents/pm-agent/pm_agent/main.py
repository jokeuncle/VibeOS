"""PM Agent – FastAPI application (orchestrator entry point).

Business logic is split into:
  handlers/   – intent handlers (task, requirement, phase)
  context.py  – GitLab context enrichment and phase extraction
  stream.py   – SSE delta streaming helper
  intent.py   – LLM-based intent classification
  workflow.py – WorkflowEngine for phase/project execution
  dispatch.py – Agent dispatcher (HTTP forwarding)
"""

from __future__ import annotations

import json
import random
import uuid
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from vibeos_agent import (
    AgentStatus,
    AgentTask,
    AgentType,
    LLMGatewayClient,
    MemoryClient,
    WSGatewayClient,
    WorkspaceClient,
)

from .context import enrich_context_with_gitlab
from .dispatch import Dispatcher
from .handlers import execute_pm_intent
from .home_actions import yield_home_events
from .intent import (
    INTENT_LABELS,
    parse_intent,
)
from .stream import build_action_event, build_error_event, build_timeline_event, yield_text_as_deltas
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


def _build_intent_event(parsed: Any) -> str:
    """Build the enriched intent SSE event with feedback data."""
    agent_val = parsed.target_agent.value
    intent_label = INTENT_LABELS.get(parsed.intent, {})
    agent_label = AGENT_LABELS.get(agent_val, {})

    payload: dict[str, Any] = {
        "intent": parsed.intent,
        "summary": parsed.summary,
        "target_agent": agent_val,
        "confidence": parsed.confidence,
        "is_ambiguous": parsed.is_ambiguous,
        "is_fallback": parsed.is_fallback,
        "intent_label": intent_label,
        "agent_label": agent_label,
    }

    if parsed.alternatives:
        payload["alternatives"] = [
            {
                "intent": alt.intent,
                "summary": alt.summary,
                "target_agent": alt.target_agent.value,
                "intent_label": INTENT_LABELS.get(alt.intent, {}),
                "agent_label": AGENT_LABELS.get(alt.target_agent.value, {}),
            }
            for alt in parsed.alternatives
        ]

    if parsed.slots:
        payload["slots"] = parsed.slots

    return f"event: intent\ndata: {json.dumps(payload)}\n\n"


_build_error_event = build_error_event
_build_timeline_event = build_timeline_event


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
    app.state.workflow = WorkflowEngine(
        app.state.dispatcher, app.state.ws_client, app.state.ws,
    )
    yield
    await app.state.llm.close()
    await app.state.dispatcher.close()
    await app.state.ws.close()
    await app.state.ws_client.close()
    await app.state.memory.close()


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
    action_type: str  # approve | reject
    original_output: str = ""
    context: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Intent classification (lightweight, no workspace required)
# ---------------------------------------------------------------------------

@app.post("/api/nlp/classify", response_model=ClassifyResponse)
async def handle_classify(req: ClassifyRequest) -> ClassifyResponse:
    """Classify user intent without requiring a workspace.

    Used by the home page to decide whether to create a workspace
    or respond with a general chat reply.
    """
    llm: LLMGatewayClient = app.state.llm
    parsed = await parse_intent(req.message, llm)

    alternatives: list[dict[str, Any]] = []
    for alt in parsed.alternatives:
        alt_val = alt.target_agent.value
        alternatives.append({
            "intent": alt.intent,
            "summary": alt.summary,
            "target_agent": alt_val,
            "intent_label": INTENT_LABELS.get(alt.intent, {}),
            "agent_label": AGENT_LABELS.get(alt_val, {}),
        })

    return ClassifyResponse(
        intent=parsed.intent,
        summary=parsed.summary,
        target_agent=parsed.target_agent.value,
        confidence=parsed.confidence,
        is_ambiguous=parsed.is_ambiguous,
        intent_label=INTENT_LABELS.get(parsed.intent, {}),
        agent_label=AGENT_LABELS.get(parsed.target_agent.value, {}),
        alternatives=alternatives,
        slots=parsed.slots,
    )


# ---------------------------------------------------------------------------
# NLP routes
# ---------------------------------------------------------------------------

@app.post("/api/nlp", response_model=NLPResponse)
async def handle_nlp(req: NLPRequest) -> NLPResponse:
    """Parse user intent and dispatch to the appropriate domain agent."""
    llm: LLMGatewayClient = app.state.llm
    dispatcher: Dispatcher = app.state.dispatcher
    ws: WSGatewayClient = app.state.ws
    ws_client: WorkspaceClient = app.state.ws_client
    workflow: WorkflowEngine = app.state.workflow

    try:
        await ws.publish_log(req.workspace_id, "pm", f"Received message: {req.message[:80]}…")
        parsed = await parse_intent(req.message, llm)
        await ws.publish_log(req.workspace_id, "pm", f"Intent: {parsed.intent} → {parsed.target_agent.value}", level="success")
        await ws.publish_agent_status(req.workspace_id, AgentType.PM, AgentStatus.RUNNING, detail=f"Parsed intent: {parsed.intent}")

        if parsed.target_agent == AgentType.PM:
            result = await execute_pm_intent(
                parsed, req.workspace_id, req.message, req.context, llm, ws, ws_client, workflow, dispatcher,
            )
            return NLPResponse(
                intent=parsed.intent,
                summary=result.get("summary", parsed.summary),
                target_agent=parsed.target_agent.value,
                result=result,
                slots=parsed.slots,
            )

        enriched_ctx = await enrich_context_with_gitlab(req.workspace_id, req.context, ws_client)
        task = AgentTask(
            task_id=uuid.uuid4().hex,
            workspace_id=req.workspace_id,
            intent=parsed.intent,
            description=parsed.summary,
            user_message=req.message,
            context=enriched_ctx,
        )
        result = await dispatcher.dispatch(parsed.target_agent, task)
        return NLPResponse(
            intent=parsed.intent,
            summary=parsed.summary,
            target_agent=parsed.target_agent.value,
            result=result,
            slots=parsed.slots,
        )
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
    """SSE streaming NLP: parse intent then forward agent streaming response."""
    llm: LLMGatewayClient = app.state.llm
    dispatcher: Dispatcher = app.state.dispatcher
    ws: WSGatewayClient = app.state.ws
    ws_client: WorkspaceClient = app.state.ws_client
    workflow: WorkflowEngine = app.state.workflow

    is_home = req.workspace_id == "__home__"

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            # Step 1: Timeline – show "understanding" step
            yield _build_timeline_event("parse", "理解意图 / Understanding intent", "running")

            if not is_home:
                await ws.publish_log(req.workspace_id, "pm", f"Received message: {req.message[:80]}…")
            parsed = await parse_intent(req.message, llm)
            if not is_home:
                await ws.publish_log(req.workspace_id, "pm", f"Intent: {parsed.intent} → {parsed.target_agent.value}", level="success")

            # Step 2: Enriched intent event with confidence + labels
            yield _build_intent_event(parsed)
            yield _build_timeline_event("parse", "理解意图 / Understanding intent", "completed", parsed.summary)

            # --- Home context: delegate to home_actions registry ---
            if is_home:
                async for event in yield_home_events(
                    parsed, llm, req.message,
                    random_title=_random_workspace_title,
                    agent_labels=AGENT_LABELS,
                ):
                    yield event
                yield "data: [DONE]\n\n"
                return

            # Step 3: Ambiguous intent → send clarification instead of silent fallback
            if parsed.is_ambiguous:
                options = [
                    {
                        "id": parsed.intent,
                        "label": INTENT_LABELS.get(parsed.intent, {}).get("zh", parsed.intent),
                        "intent": parsed.intent,
                        "agent_type": parsed.target_agent.value,
                    }
                ]
                for alt in parsed.alternatives:
                    options.append({
                        "id": alt.intent,
                        "label": INTENT_LABELS.get(alt.intent, {}).get("zh", alt.intent),
                        "intent": alt.intent,
                        "agent_type": alt.target_agent.value,
                    })
                yield f"event: clarification\ndata: {json.dumps({'prompt': '我不太确定你的意图，请选择最接近的操作：', 'options': options})}\n\n"
                yield "data: [DONE]\n\n"
                return

            # Step 4: Fallback intent → transparent notification
            if parsed.is_fallback:
                yield _build_error_event(
                    "intent_unclear",
                    "无法精确识别意图，已切换到自由对话模式。",
                    hints=[
                        "试试: \"帮我创建一个XXX功能的需求\"",
                        "试试: \"@design 设计登录页面\"",
                        "试试: \"/deploy 部署到测试环境\"",
                    ],
                )

            # Step 5: Busy workspace check
            if parsed.intent not in ("general_chat", "query_progress") and workflow.is_busy(req.workspace_id):
                yield _build_error_event(
                    "system_error",
                    "当前工作空间正在执行任务，请等待完成后再操作。",
                    actions=[{"id": "wait", "label": "等待", "variant": "secondary"}],
                )
                yield "data: [DONE]\n\n"
                return

            await ws.publish_agent_status(req.workspace_id, AgentType.PM, AgentStatus.RUNNING, detail=f"Parsed intent: {parsed.intent}")

            if parsed.target_agent == AgentType.PM:
                if parsed.intent == "general_chat" and not (req.context or {}).get("zero_requirements"):
                    yield _build_timeline_event("exec", "生成回复 / Generating reply", "running")
                    messages = [
                        {"role": "system", "content": "You are VibeOS PM assistant. Help the user with project management, planning, and general questions. Respond in clear natural language."},
                        {"role": "user", "content": req.message},
                    ]
                    async for chunk in llm.chat_stream(messages):
                        delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if delta:
                            yield f"data: {json.dumps({'delta': delta})}\n\n"
                    yield _build_timeline_event("exec", "生成回复 / Generating reply", "completed")
                    yield build_action_event(
                        "confirm", label="继续追问", variant="secondary",
                    )
                    yield "data: [DONE]\n\n"
                    return

                # PM intent execution
                yield _build_timeline_event("exec", "执行中 / Executing", "running")

                result = await execute_pm_intent(
                    parsed, req.workspace_id, req.message, req.context, llm, ws, ws_client, workflow, dispatcher,
                )
                summary = result.get("summary", parsed.summary)

                if result.get("action") == "requirement_preview" and result.get("requirement_preview"):
                    yield f"event: requirement_preview\ndata: {json.dumps(result['requirement_preview'])}\n\n"

                async for evt in yield_text_as_deltas(summary):
                    yield evt

                payload_extras: dict[str, Any] = {}
                if result.get("created_tasks"):
                    payload_extras["created_tasks"] = result["created_tasks"]
                if result.get("artifacts"):
                    payload_extras["artifacts"] = result["artifacts"]
                if payload_extras:
                    yield f"data: {json.dumps({'payload': payload_extras})}\n\n"

                yield _build_timeline_event("exec", "执行中 / Executing", "completed")

                action = result.get("action", "")
                if action in ("requirement_preview", "requirement_created"):
                    yield build_action_event(
                        "navigate", label="查看详情", variant="primary",
                        payload={"target": "requirement_detail"},
                    )
                    yield build_action_event(
                        "confirm", label="继续优化", variant="secondary",
                    )
                elif result.get("created_tasks"):
                    yield build_action_event(
                        "navigate", label="查看任务", variant="primary",
                        payload={"target": "task_list"},
                    )
                    yield build_action_event(
                        "phase_execute", label="开始执行", variant="secondary",
                        payload={"phase": "requirement"},
                    )
                else:
                    yield build_action_event(
                        "confirm", label="继续追问", variant="secondary",
                    )
                yield "data: [DONE]\n\n"
                return

            # Non-PM agent dispatch
            yield _build_timeline_event("dispatch", f"分发到 {parsed.target_agent.value} Agent", "running")

            enriched_ctx = await enrich_context_with_gitlab(req.workspace_id, req.context, ws_client)
            task = AgentTask(
                task_id=uuid.uuid4().hex,
                workspace_id=req.workspace_id,
                intent=parsed.intent,
                description=parsed.summary,
                user_message=req.message,
                context=enriched_ctx,
            )

            has_result = False
            async for chunk in dispatcher.dispatch_stream(parsed.target_agent, task):
                chunk_type = chunk.get("type", "")

                if chunk.get("error"):
                    err_msg = chunk["error"]
                    if "未启动" in err_msg or "not running" in err_msg.lower():
                        yield _build_error_event(
                            "agent_unavailable",
                            err_msg,
                            hints=["请确保对应的 Agent 服务已启动"],
                            actions=[
                                {"id": "retry", "label": "重试", "variant": "primary"},
                                {"id": "switch_agent", "label": "换个 Agent", "variant": "secondary"},
                            ],
                        )
                    else:
                        yield _build_error_event("system_error", err_msg, actions=[
                            {"id": "retry", "label": "重试", "variant": "primary"},
                        ])
                    yield _build_timeline_event("dispatch", f"分发到 {parsed.target_agent.value} Agent", "error", err_msg)
                    break

                if chunk_type == "result":
                    has_result = True
                    payload = chunk.get("payload", {})
                    summary_text = payload.get("summary", "") or chunk.get("summary", "")
                    if summary_text:
                        async for evt in yield_text_as_deltas(summary_text):
                            yield evt
                    rich_payload: dict[str, Any] = {
                        k: payload[k] for k in ("artifacts", "code_artifacts", "created_tasks") if payload.get(k)
                    }
                    if rich_payload:
                        yield f"data: {json.dumps({'payload': rich_payload})}\n\n"
                else:
                    yield f"data: {json.dumps(chunk)}\n\n"

            if has_result:
                yield _build_timeline_event("dispatch", f"分发到 {parsed.target_agent.value} Agent", "completed")
                yield build_action_event(
                    "navigate", label="查看详情", variant="primary",
                    payload={"target": "detail"},
                )
                yield build_action_event(
                    "confirm", label="继续追问", variant="secondary",
                )

            yield "data: [DONE]\n\n"
        except Exception as exc:
            error_str = str(exc)
            if "rate" in error_str.lower() or "limit" in error_str.lower():
                yield _build_error_event(
                    "system_error",
                    "AI 模型已达到使用限制，请稍后重试。",
                    actions=[{"id": "retry", "label": "稍后重试", "variant": "primary"}],
                )
            elif "timeout" in error_str.lower():
                yield _build_error_event(
                    "system_error",
                    "请求超时，请稍后重试。",
                    actions=[{"id": "retry", "label": "重试", "variant": "primary"}],
                )
            else:
                yield _build_error_event(
                    "system_error",
                    f"处理时发生错误: {error_str}",
                    actions=[{"id": "retry", "label": "重试", "variant": "primary"}],
                )
            yield f"event: error\ndata: {json.dumps({'error': error_str})}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            if not is_home:
                try:
                    await ws.publish_agent_status(req.workspace_id, AgentType.PM, AgentStatus.IDLE)
                except Exception:
                    pass

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Chat routes
# ---------------------------------------------------------------------------

@app.post("/api/chat/{agent_type}", response_model=ChatResponse)
async def handle_chat(agent_type: str, req: ChatRequest) -> ChatResponse:
    """Forward a chat message to a specific domain agent."""
    dispatcher: Dispatcher = app.state.dispatcher
    llm: LLMGatewayClient = app.state.llm
    try:
        at = AgentType(agent_type)
    except ValueError:
        return ChatResponse(agent_type=agent_type, reply=f"未知的 Agent 类型: {agent_type}")
    try:
        # Handle PM chat directly using LLM
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
        agent_names = {
            "requirement": "需求",
            "architecture": "架构",
            "design": "设计",
            "development": "开发",
            "testing": "测试",
            "cicd": "CI/CD",
            "monitoring": "监控",
            "pm": "项目管理",
        }
        name = agent_names.get(agent_type, agent_type)
        return ChatResponse(agent_type=agent_type, reply=f"{name} Agent 处理时出错: {exc}")


@app.post("/api/chat/{agent_type}/stream")
async def handle_chat_stream(agent_type: str, req: ChatRequest) -> StreamingResponse:
    """SSE streaming chat: forward agent token streaming."""
    dispatcher: Dispatcher = app.state.dispatcher
    try:
        at = AgentType(agent_type)
    except ValueError:
        async def err_gen() -> AsyncGenerator[str, None]:
            yield f"event: error\ndata: {json.dumps({'error': f'Unknown agent type: {agent_type}'})}\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(err_gen(), media_type="text/event-stream")

    async def token_gen() -> AsyncGenerator[str, None]:
        try:
            async for chunk in dispatcher.forward_chat_stream(at, req.workspace_id, req.message):
                yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(token_gen(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Workflow routes
# ---------------------------------------------------------------------------

@app.post("/api/workflow/run-task")
async def handle_run_task(req: RunTaskRequest) -> StreamingResponse:
    """SSE: execute a single task by ID."""
    workflow: WorkflowEngine = app.state.workflow

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in workflow.run_task(req.workspace_id, req.task_id, req.user_message):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/workflow/run-phase")
async def handle_run_phase(req: RunPhaseRequest) -> StreamingResponse:
    """SSE: execute all pending tasks in a single phase."""
    workflow: WorkflowEngine = app.state.workflow

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in workflow.run_phase(req.workspace_id, req.phase_type, req.user_message):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/workflow/run-project")
async def handle_run_project_route(req: RunProjectRequest) -> StreamingResponse:
    """SSE: execute the full project lifecycle end-to-end."""
    workflow: WorkflowEngine = app.state.workflow

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in workflow.run_project(req.workspace_id, req.user_message, start_phase=req.start_phase):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/workflow/run-requirement")
async def handle_run_requirement(req: RunRequirementRequest) -> StreamingResponse:
    """SSE: execute all pending tasks for a requirement in a specific phase."""
    workflow: WorkflowEngine = app.state.workflow

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in workflow.run_requirement(req.workspace_id, req.requirement_id, req.user_message, req.phase_type):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Feedback & health
# ---------------------------------------------------------------------------

@app.post("/api/feedback")
async def handle_feedback(req: FeedbackRequest) -> dict[str, Any]:
    """Record user feedback (approve/reject) on agent output."""
    memory: MemoryClient = app.state.memory
    ws_client: WorkspaceClient = app.state.ws_client

    try:
        result = await memory.record_feedback(
            workspace_id=req.workspace_id,
            agent_type=req.agent_type,
            action_type=req.action_type,
            context=req.context or {},
            original_output=req.original_output,
        )
    except Exception as exc:
        return {"status": "error", "error": str(exc)}

    try:
        await ws_client._http.post(
            f"/api/workspaces/{req.workspace_id}/feedback",
            json={
                "agentType": req.agent_type,
                "actionType": req.action_type,
                "originalOutput": req.original_output[:1000] if req.original_output else "",
                "context": json.dumps(req.context or {}),
            },
        )
    except Exception:
        pass

    return {"status": "ok", "result": result}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "pm-agent"}
