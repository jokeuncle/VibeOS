"""Unified FastAPI app factory for VibeOS domain agents.

Every domain agent exposes a single streaming endpoint:
``POST /api/conversation/stream`` accepting :class:`ConversationRequest`.

Usage (in each agent's ``main.py``)::

    from vibeos_agent.app import create_agent_app
    from .agent import MyAgent
    app = create_agent_app(MyAgent, "My Agent", "my_type")
"""

from __future__ import annotations

import json
import logging
import sys
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .conversation import ConversationRequest
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


def create_agent_app(
    agent_class: type,
    title: str,
    agent_key: str,
    *,
    version: str = "0.1.0",
) -> FastAPI:
    """Build a fully-wired FastAPI app for ``agent_class``.

    Registers the unified ``POST /api/conversation/stream`` endpoint and
    ``GET /health``.
    """

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_telemetry(f"{agent_key}-agent")
        agent = agent_class()
        app.state.agent = agent

        _load_agent_manifest(agent)
        await agent.register()
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
    """Attach the unified conversation/stream endpoint and health check."""

    @app.post("/api/conversation/stream")
    async def conversation_stream(req: ConversationRequest) -> StreamingResponse:
        agent = app.state.agent

        if req.mode == "execute":
            return StreamingResponse(
                _execute_stream(agent, req, agent_key),
                media_type="text/event-stream",
            )
        return StreamingResponse(
            _conversation_stream(agent, req, agent_key),
            media_type="text/event-stream",
        )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": f"{agent_key}-agent"}


async def _execute_stream(
    agent: Any, req: ConversationRequest, agent_key: str,
) -> AsyncGenerator[str, None]:
    """Stream wrapper for mode=execute: converts AgentTask events to SSE."""
    sid, start = sse_session_start(agent_key, "agent_execute")
    yield start

    task = AgentTask(
        workspace_id=req.workspace_id,
        intent=req.intent or req.message,
        description=req.description or req.message,
        user_message=req.message,
        task_id=req.task_id,
        context=req.context or {},
        preferred_model=req.preferred_model,
    )
    if req.system_prompt:
        task.system_prompt = req.system_prompt

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


async def _conversation_stream(
    agent: Any, req: ConversationRequest, agent_key: str,
) -> AsyncGenerator[str, None]:
    """Stream wrapper for mode=conversation: runs the agent pipeline via SSE."""
    sid, start = sse_session_start(agent_key, "agent_chat")
    yield start

    try:
        async for event in agent._run_pipeline_stream(
            workspace_id=req.workspace_id,
            user_message=req.message,
            task_context=req.context,
            mode="conversation",
        ):
            if event.type == "content_delta":
                yield sse_delta(event.payload.get("delta", ""), sid=sid)
            else:
                data = event.model_dump(mode="json", exclude_none=True)
                yield sse_event("agent", event.type, data, sid=sid)
    except Exception as exc:
        _log.error("Agent %s conversation failed: %s", agent_key, exc, exc_info=True)
        yield sse_session_error(sid, str(exc))
        yield sse_done()
        return

    yield sse_session_complete(sid)
    yield sse_done()
