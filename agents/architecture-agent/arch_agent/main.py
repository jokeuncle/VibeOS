"""Architecture Agent – FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from vibeos_agent import AgentTask, config

from .agent import ArchitectureAgent


@asynccontextmanager
async def lifespan(app: FastAPI):
    agent = ArchitectureAgent()
    app.state.agent = agent
    yield
    await agent.close()


app = FastAPI(title="Architecture Agent", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
    agent: ArchitectureAgent = app.state.agent
    last_event: dict[str, Any] = {}
    async for event in agent.execute(task):
        last_event = event.model_dump(mode="json", exclude_none=True)
    return last_event


@app.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    agent: ArchitectureAgent = app.state.agent
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


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "architecture-agent"}
