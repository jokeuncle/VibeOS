from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import settings
from .feedback import FeedbackProcessor, FeedbackSignal
from .mem0_client import VibeOSMemory

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

memory_client: VibeOSMemory | None = None
feedback_processor: FeedbackProcessor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global memory_client, feedback_processor  # noqa: PLW0603
    memory_client = VibeOSMemory(settings)
    feedback_processor = FeedbackProcessor(memory_client)
    logger.info("Memory service started on port %s", settings.port)
    yield


app = FastAPI(title="VibeOS Memory Service", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response Models ────────────────────────────────────────


class AddMemoryRequest(BaseModel):
    content: str
    user_id: str = ""
    workspace_id: str = ""
    agent_type: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class FeedbackRequest(BaseModel):
    workspace_id: str
    agent_type: str = ""
    action_type: str  # approve | reject | edit | ignore
    context: dict[str, Any] = Field(default_factory=dict)
    original_output: str = ""
    modified_output: str = ""


class ContextAssembleRequest(BaseModel):
    workspace_id: str
    agent_type: str = ""
    user_message: str = ""
    include_preferences: bool = True
    include_project_memory: bool = True
    include_org_memory: bool = True


# ── Memory CRUD ──────────────────────────────────────────────────────


@app.post("/api/memory/add")
async def add_memory(req: AddMemoryRequest) -> dict[str, Any]:
    assert memory_client is not None
    user_id = req.user_id or f"ws:{req.workspace_id}"
    metadata = {**req.metadata}
    if req.agent_type:
        metadata["agent_type"] = req.agent_type
    if req.workspace_id:
        metadata["workspace_id"] = req.workspace_id

    layer = metadata.get("layer", "project")
    metadata.setdefault("layer", layer)

    result = await asyncio.to_thread(memory_client.add, content=req.content, user_id=user_id, metadata=metadata)
    return {"status": "ok", "result": result}


@app.get("/api/memory/search")
async def search_memory(
    query: str,
    workspace_id: str = "",
    user_id: str = "",
    agent_type: str = "",
    limit: int = Query(default=10, ge=1, le=100),
) -> dict[str, Any]:
    assert memory_client is not None
    uid = user_id or (f"ws:{workspace_id}" if workspace_id else "")
    if not uid:
        raise HTTPException(status_code=400, detail="workspace_id or user_id required")

    results = await asyncio.to_thread(memory_client.search, query=query, user_id=uid, limit=limit)

    if agent_type:
        results = [
            r for r in results if r.get("metadata", {}).get("agent_type", "") == agent_type
        ]

    return {"memories": results}


@app.get("/api/memory/all")
async def list_memories(
    workspace_id: str = "",
    user_id: str = "",
    agent_type: str = "",
) -> dict[str, Any]:
    assert memory_client is not None
    uid = user_id or (f"ws:{workspace_id}" if workspace_id else "")
    if not uid:
        raise HTTPException(status_code=400, detail="workspace_id or user_id required")

    results = await asyncio.to_thread(memory_client.get_all, user_id=uid)

    if agent_type:
        results = [
            r for r in results if r.get("metadata", {}).get("agent_type", "") == agent_type
        ]

    return {"memories": results}


@app.delete("/api/memory/{memory_id}")
async def delete_memory(memory_id: str) -> dict[str, str]:
    assert memory_client is not None
    try:
        await asyncio.to_thread(memory_client.delete, memory_id)
    except Exception as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"status": "deleted"}


# ── Preference / Feedback ────────────────────────────────────────────


@app.post("/api/feedback")
async def record_feedback(req: FeedbackRequest) -> dict[str, Any]:
    assert feedback_processor is not None
    signal = FeedbackSignal(
        workspace_id=req.workspace_id,
        agent_type=req.agent_type,
        action_type=req.action_type,
        context=req.context,
        original_output=req.original_output,
        modified_output=req.modified_output,
    )
    result = await asyncio.to_thread(feedback_processor.process, signal)
    return result


@app.get("/api/preferences/{workspace_id}")
async def get_preferences(workspace_id: str) -> dict[str, Any]:
    assert feedback_processor is not None
    prefs = await asyncio.to_thread(feedback_processor.get_aggregated_preferences, workspace_id)
    return {"workspace_id": workspace_id, "preferences": prefs}


# ── Context Assembly ─────────────────────────────────────────────────


@app.post("/api/context/assemble")
async def assemble_context(req: ContextAssembleRequest) -> dict[str, Any]:
    assert memory_client is not None

    sections: list[str] = []

    if req.include_project_memory and req.user_message:
        project_hits = await asyncio.to_thread(
            memory_client.search_project_memory,
            query=req.user_message, workspace_id=req.workspace_id, limit=10,
        )
        if project_hits:
            lines = [f"- {m.get('memory', m.get('text', ''))}" for m in project_hits]
            sections.append("## Project Memory\n" + "\n".join(lines))

    if req.include_org_memory and req.user_message:
        org_hits = await asyncio.to_thread(
            memory_client.search_org_memory,
            query=req.user_message, org_id=req.workspace_id, limit=5,
        )
        if org_hits:
            lines = [f"- {m.get('memory', m.get('text', ''))}" for m in org_hits]
            sections.append("## Organization Memory\n" + "\n".join(lines))

    if req.include_preferences:
        pref_hits = await asyncio.to_thread(
            memory_client.search_preferences,
            query=req.user_message or "preferences",
            workspace_id=req.workspace_id,
            limit=10,
        )
        if pref_hits:
            lines = [f"- {m.get('memory', m.get('text', ''))}" for m in pref_hits]
            sections.append("## Learned Preferences\n" + "\n".join(lines))

    assembled = "\n\n".join(sections) if sections else ""

    return {
        "workspace_id": req.workspace_id,
        "agent_type": req.agent_type,
        "context": assembled,
        "section_count": len(sections),
    }


# ── Health ───────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "memory-service"}


# ── Entrypoint ───────────────────────────────────────────────────────


def main() -> None:
    uvicorn.run(
        "memory_service.main:app",
        host="0.0.0.0",
        port=settings.port,
        reload=True,
    )


if __name__ == "__main__":
    main()
