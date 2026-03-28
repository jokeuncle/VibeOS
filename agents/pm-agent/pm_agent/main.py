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
    config,
)

from .dispatch import Dispatcher
from .intent import parse_intent


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm = LLMGatewayClient()
    app.state.dispatcher = Dispatcher()
    app.state.ws = WSGatewayClient()
    yield
    await app.state.llm.close()
    await app.state.dispatcher.close()
    await app.state.ws.close()


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


@app.post("/api/nlp", response_model=NLPResponse)
async def handle_nlp(req: NLPRequest) -> NLPResponse:
    """Parse user intent and dispatch to the appropriate domain agent."""
    llm: LLMGatewayClient = app.state.llm
    dispatcher: Dispatcher = app.state.dispatcher
    ws: WSGatewayClient = app.state.ws

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
            return NLPResponse(
                intent=parsed.intent,
                summary=parsed.summary,
                target_agent=parsed.target_agent.value,
                result={"handled_by": "pm", "summary": parsed.summary},
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
                yield f"event: result\ndata: {json.dumps({'handled_by': 'pm', 'summary': parsed.summary})}\n\n"
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
