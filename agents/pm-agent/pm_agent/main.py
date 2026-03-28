"""PM Agent – FastAPI application (the orchestrator)."""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response schemas
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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/nlp", response_model=NLPResponse)
async def handle_nlp(req: NLPRequest) -> NLPResponse:
    """Parse user intent and dispatch to the appropriate domain agent."""
    llm: LLMGatewayClient = app.state.llm
    dispatcher: Dispatcher = app.state.dispatcher

    parsed = await parse_intent(req.message, llm)

    await app.state.ws.publish_agent_status(
        req.workspace_id,
        AgentType.PM,
        AgentStatus.THINKING,
        detail=f"Parsed intent: {parsed.intent}",
    )

    if parsed.target_agent == AgentType.PM:
        await app.state.ws.publish_agent_status(
            req.workspace_id, AgentType.PM, AgentStatus.IDLE
        )
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

    await app.state.ws.publish_agent_status(
        req.workspace_id, AgentType.PM, AgentStatus.IDLE
    )

    return NLPResponse(
        intent=parsed.intent,
        summary=parsed.summary,
        target_agent=parsed.target_agent.value,
        result=result,
    )


@app.post("/api/chat/{agent_type}", response_model=ChatResponse)
async def handle_chat(agent_type: str, req: ChatRequest) -> ChatResponse:
    """Forward a chat message to a specific domain agent."""
    dispatcher: Dispatcher = app.state.dispatcher
    try:
        at = AgentType(agent_type)
    except ValueError:
        return ChatResponse(agent_type=agent_type, reply=f"Unknown agent type: {agent_type}")

    result = await dispatcher.forward_chat(at, req.workspace_id, req.message)
    return ChatResponse(
        agent_type=agent_type,
        reply=result.get("reply", ""),
        rich_blocks=result.get("rich_blocks", []),
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "pm-agent"}
