"""Unified FastAPI app factory for VibeOS domain agents.

Eliminates the near-identical ``main.py`` boilerplate across all agents.

Usage (in each agent's ``main.py``)::

    from vibeos_agent.app import create_agent_app
    from .agent import MyAgent
    app = create_agent_app(MyAgent, "My Agent", "my_type")
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .models import AgentTask
from .telemetry import init_telemetry
from .sse import (
    sse_delta,
    sse_done,
    sse_event,
    sse_session_complete,
    sse_session_error,
    sse_session_start,
)

_log = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    workspace_id: str
    message: str


class ChatResponse(BaseModel):
    reply: str
    rich_blocks: list[dict[str, Any]] = []


def create_agent_app(
    agent_class: type,
    title: str,
    agent_key: str,
    *,
    version: str = "0.1.0",
) -> FastAPI:
    """Build a fully-wired FastAPI app for ``agent_class``.

    Registers the standard routes (``/health``, ``/api/execute``,
    ``/api/execute/stream``, ``/api/chat``, ``/api/chat/stream``)
    with correct SSE session labels derived from *agent_key*.
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_telemetry(f"{agent_key}-agent")
        agent = agent_class()
        app.state.agent = agent

        # Auto-discover agent-manifest.yaml next to the agent module
        _load_agent_manifest(agent)

        try:
            await agent.register_with_registry()
            agent.start_heartbeat()
        except Exception:
            _log.warning(
                "Registry registration failed for %s (service may be starting)", agent_key,
            )
        yield
        await agent.close()

    app = FastAPI(title=title, version=version, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    _mount_routes(app, agent_key)
    return app


def _load_agent_manifest(agent: Any) -> None:
    """Discover and load ``agent-manifest.yaml`` from the agent's package directory."""
    agent_module = type(agent).__module__
    mod = sys.modules.get(agent_module)
    if not mod or not hasattr(mod, "__file__") or not mod.__file__:
        return
    pkg_dir = Path(mod.__file__).resolve().parent
    for candidate in (pkg_dir / "agent-manifest.yaml", pkg_dir.parent / "agent-manifest.yaml"):
        if candidate.is_file():
            try:
                from .registry import load_manifest_from_yaml
                manifest = load_manifest_from_yaml(str(candidate))
                agent.manifest = manifest
                _log.info("Loaded manifest from %s", candidate)
            except Exception:
                _log.warning("Failed to load manifest from %s", candidate, exc_info=True)
            return


def _mount_routes(app: FastAPI, agent_key: str) -> None:
    """Attach the standard five endpoints every agent exposes."""

    @app.post("/api/execute")
    async def execute_task(task: AgentTask) -> dict[str, Any]:
        agent = app.state.agent
        last_event: dict[str, Any] = {}
        try:
            async for event in agent.execute(task):
                last_event = event.model_dump(mode="json", exclude_none=True)
        except Exception as exc:
            return {"error": str(exc), "type": "error", "agent_type": agent_key}
        return last_event

    @app.post("/api/execute/stream")
    async def execute_task_stream(task: AgentTask) -> StreamingResponse:
        agent = app.state.agent

        async def event_gen() -> AsyncGenerator[str, None]:
            sid, start = sse_session_start(agent_key, "agent_execute")
            yield start
            try:
                async for event in agent.execute(task):
                    data = event.model_dump(mode="json", exclude_none=True)
                    yield sse_event("agent", event.type, data, sid=sid)
            except Exception as exc:
                yield sse_session_error(sid, str(exc))
                yield sse_done()
                return
            yield sse_session_complete(sid)
            yield sse_done()

        return StreamingResponse(event_gen(), media_type="text/event-stream")

    @app.post("/api/chat", response_model=ChatResponse)
    async def chat(req: ChatRequest) -> ChatResponse:
        agent = app.state.agent
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
        agent = app.state.agent

        async def token_gen() -> AsyncGenerator[str, None]:
            sid, start = sse_session_start(agent_key, "agent_chat")
            yield start
            async for delta in agent.chat_stream(
                req.message, workspace_id=req.workspace_id
            ):
                yield sse_delta(delta, sid=sid)
            yield sse_session_complete(sid)
            yield sse_done()

        return StreamingResponse(token_gen(), media_type="text/event-stream")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": f"{agent_key}-agent"}
