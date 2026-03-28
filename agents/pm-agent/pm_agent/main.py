"""PM Agent – FastAPI application (the orchestrator)."""

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
    WSGatewayClient,
    WorkspaceClient,
    Task,
    config,
)

from .dispatch import Dispatcher
from .intent import parse_intent, ParsedIntent

_TASK_EXTRACT_PROMPT = (
    "You are a project management assistant. Given the user's request and workspace phases, "
    "extract structured task info. Reply with ONLY a JSON object:\n"
    '{"title": "<short task title>", "description": "<1-2 sentence description>", '
    '"phase_type": "<best matching phase type from the list>", '
    '"priority": "<p0|p1|p2|p3>"}\n'
    "Priority mapping: p0 = critical, p1 = high, p2 = medium, p3 = low.\n"
    "Available phase types: requirements, design, architecture, development, testing, deployment, operations"
)

_PRIORITY_NORMALIZE: dict[str, str] = {
    "critical": "p0", "p0": "p0",
    "high": "p1", "p1": "p1",
    "medium": "p2", "p2": "p2",
    "low": "p3", "p3": "p3",
}


async def _handle_create_task(
    workspace_id: str,
    user_message: str,
    summary: str,
    llm: LLMGatewayClient,
    ws_client: WorkspaceClient,
    ws_gw: WSGatewayClient,
) -> dict[str, Any]:
    """Extract task details via LLM and create the task in workspace-svc."""
    await ws_gw.publish_log(workspace_id, "pm", "Extracting task details from request…")

    messages = [
        {"role": "system", "content": _TASK_EXTRACT_PROMPT},
        {"role": "user", "content": user_message},
    ]
    result = await llm.chat(messages, temperature=0.0)
    raw = result.get("choices", [{}])[0].get("message", {}).get("content", "")

    from .intent import _extract_json
    task_data = _extract_json(raw)

    title = task_data.get("title", summary[:80])
    description = task_data.get("description", summary)
    phase_type = task_data.get("phase_type", "requirements")
    raw_priority = task_data.get("priority", "medium").lower()
    priority = _PRIORITY_NORMALIZE.get(raw_priority, "p2")

    phase_id = await ws_client.find_phase_by_type(workspace_id, phase_type)
    if not phase_id:
        phases = await ws_client.get_phases(workspace_id)
        if phases:
            phase_id = phases[0]["id"]

    if not phase_id:
        return {"error": "No phases found in workspace", "summary": summary}

    task = Task(title=title, description=description, priority=priority)
    created = await ws_client.create_task(workspace_id, task, phase_id=phase_id)

    await ws_gw.publish_log(
        workspace_id, "pm",
        f"Task '{title}' created in {phase_type} phase",
        level="success",
    )

    return {
        "handled_by": "pm",
        "action": "task_created",
        "summary": f"Created task: {title}",
        "task": created.get("data", created),
        "phase_type": phase_type,
    }


async def _handle_query_progress(
    workspace_id: str,
    llm: LLMGatewayClient,
    ws_client: WorkspaceClient,
) -> dict[str, Any]:
    """Query workspace progress and return a summary."""
    ws_data = await ws_client.get_workspace(workspace_id)
    if isinstance(ws_data, dict) and "data" in ws_data:
        ws_data = ws_data["data"]

    phases = ws_data.get("phases", []) if isinstance(ws_data, dict) else []
    total_tasks = sum(len(p.get("tasks", [])) for p in phases)
    completed = sum(
        1 for p in phases for t in p.get("tasks", []) if t.get("status") == "completed"
    )

    phase_summary = "; ".join(
        f"{p.get('name', '?')}: {p.get('status', 'pending')}" for p in phases
    )

    return {
        "handled_by": "pm",
        "action": "progress_report",
        "summary": f"Workspace has {total_tasks} tasks ({completed} completed). Phases: {phase_summary}",
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm = LLMGatewayClient()
    app.state.dispatcher = Dispatcher()
    app.state.ws = WSGatewayClient()
    app.state.ws_client = WorkspaceClient()
    yield
    await app.state.llm.close()
    await app.state.dispatcher.close()
    await app.state.ws.close()
    await app.state.ws_client.close()


app = FastAPI(title="PM Agent", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


async def _execute_pm_intent(
    parsed: ParsedIntent,
    req: NLPRequest,
    llm: LLMGatewayClient,
    ws: WSGatewayClient,
    ws_client: WorkspaceClient,
) -> dict[str, Any]:
    """Execute PM-handled intents (create_task, query_progress, etc.)."""
    if parsed.intent == "create_task":
        return await _handle_create_task(
            req.workspace_id, req.message, parsed.summary, llm, ws_client, ws,
        )
    if parsed.intent == "query_progress":
        return await _handle_query_progress(req.workspace_id, llm, ws_client)
    return {"handled_by": "pm", "summary": parsed.summary}


@app.post("/api/nlp", response_model=NLPResponse)
async def handle_nlp(req: NLPRequest) -> NLPResponse:
    """Parse user intent and dispatch to the appropriate domain agent."""
    llm: LLMGatewayClient = app.state.llm
    dispatcher: Dispatcher = app.state.dispatcher
    ws: WSGatewayClient = app.state.ws
    ws_client: WorkspaceClient = app.state.ws_client

    try:
        await ws.publish_log(req.workspace_id, "pm", f"Received message: {req.message[:80]}…")

        parsed = await parse_intent(req.message, llm)

        await ws.publish_log(
            req.workspace_id, "pm",
            f"Intent classified: {parsed.intent} → {parsed.target_agent.value}",
            level="success",
        )
        await ws.publish_agent_status(
            req.workspace_id,
            AgentType.PM,
            AgentStatus.THINKING,
            detail=f"Parsed intent: {parsed.intent}",
        )

        if parsed.target_agent == AgentType.PM:
            result = await _execute_pm_intent(parsed, req, llm, ws, ws_client)
            return NLPResponse(
                intent=parsed.intent,
                summary=result.get("summary", parsed.summary),
                target_agent=parsed.target_agent.value,
                result=result,
            )

        task = AgentTask(
            task_id=uuid.uuid4().hex,
            workspace_id=req.workspace_id,
            intent=parsed.intent,
            description=parsed.summary,
            context=req.context or {},
        )

        result = await dispatcher.dispatch(parsed.target_agent, task)

        return NLPResponse(
            intent=parsed.intent,
            summary=parsed.summary,
            target_agent=parsed.target_agent.value,
            result=result,
        )
    except Exception:
        await ws.publish_agent_status(
            req.workspace_id, AgentType.PM, AgentStatus.ERROR, detail="NLP processing failed"
        )
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

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            await ws.publish_log(req.workspace_id, "pm", f"Received message: {req.message[:80]}…")
            parsed = await parse_intent(req.message, llm)
            await ws.publish_log(
                req.workspace_id, "pm",
                f"Intent classified: {parsed.intent} → {parsed.target_agent.value}",
                level="success",
            )

            yield f"event: intent\ndata: {json.dumps({'intent': parsed.intent, 'summary': parsed.summary, 'target_agent': parsed.target_agent.value})}\n\n"

            await ws.publish_agent_status(
                req.workspace_id, AgentType.PM, AgentStatus.THINKING,
                detail=f"Parsed intent: {parsed.intent}",
            )

            if parsed.target_agent == AgentType.PM:
                result = await _execute_pm_intent(parsed, req, llm, ws, ws_client)
                yield f"event: result\ndata: {json.dumps(result)}\n\n"
                yield "data: [DONE]\n\n"
                return

            task = AgentTask(
                task_id=uuid.uuid4().hex,
                workspace_id=req.workspace_id,
                intent=parsed.intent,
                description=parsed.summary,
                context=req.context or {},
            )

            async for chunk in dispatcher.dispatch_stream(parsed.target_agent, task):
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

    return ChatResponse(
        agent_type=agent_type,
        reply=result.get("reply", ""),
        rich_blocks=result.get("rich_blocks", []),
    )


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


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "pm-agent"}
