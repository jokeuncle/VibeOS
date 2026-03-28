"""Development Agent – FastAPI application."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from vibeos_agent import AgentTask

from .agent import DevelopmentAgent


@asynccontextmanager
async def lifespan(app: FastAPI):
    agent = DevelopmentAgent()
    app.state.agent = agent
    yield
    await agent.close()


app = FastAPI(title="Development Agent", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    workspace_id: str
    message: str


class ChatResponse(BaseModel):
    reply: str
    rich_blocks: list[dict[str, Any]] = []


@app.post("/api/execute")
async def execute_task(task: AgentTask) -> dict[str, Any]:
    agent: DevelopmentAgent = app.state.agent
    last_event: dict[str, Any] = {}
    try:
        async for event in agent.execute(task):
            last_event = event.model_dump(mode="json", exclude_none=True)
    except Exception as exc:
        return {"error": str(exc), "type": "error", "agent_type": "development"}
    return last_event


@app.post("/api/execute/stream")
async def execute_task_stream(task: AgentTask) -> StreamingResponse:
    """Stream execute events as SSE."""
    agent: DevelopmentAgent = app.state.agent

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in agent.execute(task):
                data = event.model_dump(mode="json", exclude_none=True)
                yield f"event: {event.type}\ndata: {json.dumps(data)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    agent: DevelopmentAgent = app.state.agent
    last_msg = None
    async for msg in agent.chat(req.message, workspace_id=req.workspace_id):
        last_msg = msg

    if last_msg is None:
        return ChatResponse(reply="No response generated.")

    return ChatResponse(
        reply=last_msg.content,
        rich_blocks=[
            rb.model_dump(mode="json", exclude_none=True)
            for rb in last_msg.rich_blocks
        ],
    )


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest) -> StreamingResponse:
    """Stream chat response token-by-token as SSE."""
    agent: DevelopmentAgent = app.state.agent

    async def token_gen() -> AsyncGenerator[str, None]:
        async for delta in agent.chat_stream(req.message, workspace_id=req.workspace_id):
            yield f"data: {json.dumps({'delta': delta})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(token_gen(), media_type="text/event-stream")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "dev-agent"}
