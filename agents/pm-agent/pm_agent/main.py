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
from .intent import parse_intent
from .stream import yield_text_as_deltas
from .workflow import WorkflowEngine


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


class FeedbackRequest(BaseModel):
    workspace_id: str
    message_id: str = ""
    agent_type: str = ""
    action_type: str  # approve | reject
    original_output: str = ""
    context: dict[str, Any] | None = None


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
        return NLPResponse(intent=parsed.intent, summary=parsed.summary, target_agent=parsed.target_agent.value, result=result)
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

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            await ws.publish_log(req.workspace_id, "pm", f"Received message: {req.message[:80]}…")
            parsed = await parse_intent(req.message, llm)
            await ws.publish_log(req.workspace_id, "pm", f"Intent: {parsed.intent} → {parsed.target_agent.value}", level="success")
            yield f"event: intent\ndata: {json.dumps({'intent': parsed.intent, 'summary': parsed.summary, 'target_agent': parsed.target_agent.value})}\n\n"

            if parsed.intent not in ("general_chat", "query_progress") and workflow.is_busy(req.workspace_id):
                yield f"data: {json.dumps({'delta': '⏳ 当前工作空间正在执行任务，请等待完成后再操作。 / Workspace is busy, please wait.'})}\n\n"
                yield "data: [DONE]\n\n"
                return

            await ws.publish_agent_status(req.workspace_id, AgentType.PM, AgentStatus.RUNNING, detail=f"Parsed intent: {parsed.intent}")

            if parsed.target_agent == AgentType.PM:
                if parsed.intent == "general_chat" and not (req.context or {}).get("zero_requirements"):
                    messages = [
                        {"role": "system", "content": "You are VibeOS PM assistant. Help the user with project management, planning, and general questions. Respond in clear natural language."},
                        {"role": "user", "content": req.message},
                    ]
                    async for chunk in llm.chat_stream(messages):
                        delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if delta:
                            yield f"data: {json.dumps({'delta': delta})}\n\n"
                    yield "data: [DONE]\n\n"
                    return

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

                yield "data: [DONE]\n\n"
                return

            enriched_ctx = await enrich_context_with_gitlab(req.workspace_id, req.context, ws_client)
            task = AgentTask(
                task_id=uuid.uuid4().hex,
                workspace_id=req.workspace_id,
                intent=parsed.intent,
                description=parsed.summary,
                user_message=req.message,
                context=enriched_ctx,
            )

            async for chunk in dispatcher.dispatch_stream(parsed.target_agent, task):
                chunk_type = chunk.get("type", "")
                if chunk_type == "result":
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

            yield "data: [DONE]\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
            yield "data: [DONE]\n\n"
        finally:
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
    try:
        at = AgentType(agent_type)
    except ValueError:
        return ChatResponse(agent_type=agent_type, reply=f"Unknown agent type: {agent_type}")
    try:
        result = await dispatcher.forward_chat(at, req.workspace_id, req.message)
    except Exception as exc:
        return ChatResponse(agent_type=agent_type, reply=f"Agent error: {exc}")
    return ChatResponse(agent_type=agent_type, reply=result.get("reply", ""), rich_blocks=result.get("rich_blocks", []))


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
