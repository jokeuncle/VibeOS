"""PM Agent -- unified conversation gateway.

Single entry point for all AI interactions via ConversationEngine.
Replaces the previous NLP/chat/workflow/home split.
"""

from __future__ import annotations

import asyncio
import json
import logging as _logging
import time as _time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncGenerator

_log = _logging.getLogger(__name__)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from vibeos_agent import (
    ConversationEngine,
    ConversationRequest,
    GraphExecutor,
    HAS_LANGGRAPH,
    LLMGatewayClient,
    MemoryClient,
    RegistryClient,
    WSGatewayClient,
    WorkspaceClient,
    create_pm_tools,
    load_manifest_from_yaml,
)
from vibeos_agent.mcp_discovery import check_mcp_health, discover_and_register_mcp_tools
from vibeos_agent.session import SessionManager as AgentSessionManager
from vibeos_agent.skills import Skill, SkillRegistry, SkillToolProvider
from vibeos_agent.tools.delegation_tools import create_delegation_tools
from vibeos_agent.tools.dev_tools import create_dev_tools
from vibeos_agent.tools.feishu_tools import create_feishu_tools
from vibeos_agent.tools.gitlab_tools import create_gitlab_tools
from vibeos_agent.tools.mcp_provider import MCPServerConfig, MCPToolProvider
from vibeos_agent.tools.pipeline_tools import create_pipeline_tools
from vibeos_agent.tools.provider import ToolManager
from vibeos_agent.tools.workspace_tools import create_workspace_tools

from .workflow import WorkflowEngine


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.llm = LLMGatewayClient()
    app.state.ws = WSGatewayClient()
    app.state.ws_client = WorkspaceClient()
    app.state.memory = MemoryClient()
    app.state.registry = RegistryClient()
    app.state.session = AgentSessionManager()

    tool_manager = ToolManager()
    app.state.tool_manager = tool_manager

    if HAS_LANGGRAPH:
        from .dispatch import AGENT_ENDPOINTS
        app.state.graph_executor = GraphExecutor(
            app.state.registry, llm=app.state.llm, tool_manager=tool_manager,
            endpoint_overrides=AGENT_ENDPOINTS,
        )
    else:
        app.state.graph_executor = None

    from .dispatch import Dispatcher
    dispatcher = Dispatcher()
    app.state.dispatcher = dispatcher

    from .session import SessionManager as PMSessionManager
    app.state.sm = PMSessionManager(app.state.ws_client, app.state.ws)

    app.state.workflow = WorkflowEngine(
        dispatcher, app.state.ws_client, app.state.ws, app.state.sm,
        graph_executor=app.state.graph_executor,
        llm=app.state.llm,
        tool_manager=tool_manager,
        registry=app.state.registry,
    )

    tool_manager.register_many(create_pm_tools(
        app.state.ws_client,
        workflow_engine=app.state.workflow,
        graph_executor=app.state.graph_executor,
    ))
    tool_manager.register_many(create_workspace_tools(app.state.ws_client, "pm"))
    tool_manager.register_many(create_delegation_tools("pm"))
    tool_manager.register_many(create_dev_tools(app.state.llm))
    tool_manager.register_many(create_gitlab_tools())
    tool_manager.register_many(create_pipeline_tools())
    tool_manager.register_many(create_feishu_tools())

    app.state.conversation = ConversationEngine(
        llm=app.state.llm,
        tool_manager=tool_manager,
        session=app.state.session,
        workspace_client=app.state.ws_client,
        ws_gateway=app.state.ws,
        memory_client=app.state.memory,
    )

    _manifest_path = Path(__file__).resolve().parent.parent / "agent-manifest.yaml"
    if _manifest_path.exists():
        try:
            manifest = load_manifest_from_yaml(_manifest_path)
            await app.state.registry.register_manifest(manifest)
        except Exception:
            pass

    async def _capability_sync_loop() -> None:
        while True:
            await asyncio.sleep(60)
            for ws_id in set(_provider_loaded.keys()):
                try:
                    await discover_and_register_mcp_tools(
                        app.state.ws_client, app.state.registry, ws_id
                    )
                    await check_mcp_health(
                        app.state.ws_client, app.state.registry, ws_id
                    )
                except Exception:
                    _log.debug("Sync loop error ws=%s", ws_id, exc_info=True)

    health_task = asyncio.create_task(_capability_sync_loop())

    yield

    health_task.cancel()
    for prov in tool_manager._providers:
        if isinstance(prov, MCPToolProvider):
            await prov.close()
    await app.state.llm.close()
    await app.state.dispatcher.close()
    await app.state.ws.close()
    await app.state.ws_client.close()
    await app.state.memory.close()
    await app.state.registry.close()
    await app.state.session.close()


app = FastAPI(title="PM Agent", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# MCP provider loading (reused by capabilities sync)
# ---------------------------------------------------------------------------

_provider_loaded: dict[str, float] = {}
_PROVIDER_TTL = 300


async def _load_mcp_providers(
    ws_client: WorkspaceClient, tool_manager: ToolManager, workspace_id: str,
) -> None:
    ts = _provider_loaded.get(workspace_id)
    if ts is not None and (_time.monotonic() - ts) < _PROVIDER_TTL:
        return
    try:
        tool_manager.remove_providers(f"mcp:{workspace_id}")
        servers = await ws_client.list_mcp_servers(workspace_id)
        for srv in servers:
            try:
                cfg = MCPServerConfig.from_db_row(srv)
            except Exception:
                continue
            if cfg.enabled:
                prov = MCPToolProvider(cfg)
                prov.provider_key = f"mcp:{workspace_id}:{cfg.name}"
                tool_manager.register_provider(prov)
        _provider_loaded[workspace_id] = _time.monotonic()
    except Exception:
        _provider_loaded.pop(workspace_id, None)
        _log.warning("Failed to load MCP providers for ws=%s", workspace_id, exc_info=True)


# ---------------------------------------------------------------------------
# Unified conversation endpoint
# ---------------------------------------------------------------------------

@app.get("/api/conversation/tools")
async def list_tools() -> dict[str, Any]:
    """Return all registered tool descriptors for frontend dynamic display."""
    tm: ToolManager = app.state.tool_manager
    descriptors = await tm.list_all_descriptors()
    return {
        "data": [
            {
                "name": d.name,
                "displayName": d.display_name or d.name,
                "description": d.description,
                "provider": d.provider_key,
            }
            for d in descriptors
        ]
    }


@app.post("/api/conversation/stream")
async def handle_conversation(req: ConversationRequest) -> StreamingResponse:
    """Single streaming endpoint for all AI interactions."""
    engine: ConversationEngine = app.state.conversation
    tool_manager: ToolManager = app.state.tool_manager
    ws_client: WorkspaceClient = app.state.ws_client

    if req.workspace_id and req.workspace_id != "__home__":
        await _load_mcp_providers(ws_client, tool_manager, req.workspace_id)

    async def event_gen() -> AsyncGenerator[str, None]:
        async for sse_frame in engine.run(req):
            yield sse_frame

    return StreamingResponse(event_gen(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Graph routes (kept for visual graph editor)
# ---------------------------------------------------------------------------

class GraphExecuteRequest(BaseModel):
    template_id: str = ""
    graph_def: dict[str, Any] | None = None
    input_state: dict[str, Any] = {}
    workspace_id: str = ""


class GraphValidateRequest(BaseModel):
    graphDef: dict[str, Any]


@app.post("/api/graph/execute")
async def handle_graph_execute(req: GraphExecuteRequest) -> StreamingResponse:
    executor: GraphExecutor | None = app.state.graph_executor
    registry: RegistryClient = app.state.registry
    ws_client: WorkspaceClient = app.state.ws_client
    from .session import SessionManager as PMSessionManager
    sm: PMSessionManager = app.state.sm

    async def event_gen() -> AsyncGenerator[str, None]:
        sid = await sm.create(
            "graph", req.workspace_id or "__graph__",
            user_message="", intent_type="graph_execute",
            triggered_by="user",
        )
        yield sm.session_start(sid, "graph", req.workspace_id or "__graph__")

        if req.workspace_id:
            await _load_mcp_providers(ws_client, app.state.tool_manager, req.workspace_id)

        if not executor:
            yield sm.session_error(sid, "LangGraph not available")
            yield sm.done()
            return

        graph_def = req.graph_def
        if not graph_def and req.workspace_id:
            try:
                resp = await ws_client._http.get(
                    f"/api/workspaces/{req.workspace_id}/graphs/active"
                )
                if resp.status_code == 200:
                    body = resp.json()
                    data = body.get("data")
                    if data and isinstance(data, dict) and data.get("graphDef"):
                        gd = data["graphDef"]
                        if isinstance(gd, dict) and gd.get("nodes"):
                            graph_def = gd
            except Exception:
                pass

        if not graph_def and req.template_id:
            templates = await registry.list_templates(enabled_only=False)
            for t in templates:
                if t.get("id") == req.template_id:
                    graph_def = t.get("graphDef", {})
                    break

        if not graph_def or not graph_def.get("nodes"):
            yield sm.session_error(sid, "No graph definition found")
            yield sm.done()
            return

        try:
            async for event in executor.execute(graph_def, req.input_state):
                action = event["event"].split(":")[-1] if ":" in event["event"] else event["event"]
                yield sm.ev(sid, "graph", action, event.get("data", {}))
        except Exception as exc:
            yield sm.ev(sid, "graph", "error", {"error": str(exc)})

        yield sm.session_complete(sid)
        await sm.finish(sid, req.workspace_id or "__graph__")
        yield sm.done()

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/graph/validate")
async def handle_graph_validate(req: GraphValidateRequest) -> dict[str, Any]:
    registry: RegistryClient = app.state.registry
    errors: list[str] = []
    nodes = req.graphDef.get("nodes", [])
    edges = req.graphDef.get("edges", [])
    if not nodes:
        errors.append("Graph has no nodes")
    node_ids = {n.get("id", "") for n in nodes}
    node_ids.add("__start__")
    node_ids.add("__end__")
    for edge in edges:
        src, tgt = edge.get("source", ""), edge.get("target", "")
        if src not in node_ids:
            errors.append(f"Edge source '{src}' not found in nodes")
        if tgt not in node_ids:
            errors.append(f"Edge target '{tgt}' not found in nodes")
    cap_refs = [
        n.get("capability_ref", n.get("capabilityRef", ""))
        for n in nodes if n.get("type") == "capability"
    ]
    if cap_refs:
        try:
            caps = await registry.list_capabilities()
            known = {c.get("name", "") for c in caps}
            for ref in cap_refs:
                if ref and ref not in known:
                    errors.append(f"Capability '{ref}' not found in registry")
        except Exception:
            errors.append("Could not verify capabilities (registry unavailable)")
    return {"data": {"valid": len(errors) == 0, "errors": errors}}


# ---------------------------------------------------------------------------
# Capabilities sync
# ---------------------------------------------------------------------------

class CapSyncRequest(BaseModel):
    workspace_id: str
    source_types: list[str] = ["mcp", "skill"]


@app.post("/api/capabilities/sync")
async def handle_cap_sync(req: CapSyncRequest) -> dict[str, Any]:
    ws_client: WorkspaceClient = app.state.ws_client
    registry: RegistryClient = app.state.registry
    tool_manager: ToolManager = app.state.tool_manager
    results: dict[str, Any] = {}

    if "mcp" in req.source_types:
        _provider_loaded.pop(req.workspace_id, None)
        defs = await discover_and_register_mcp_tools(ws_client, registry, req.workspace_id)
        results["mcp"] = [{"name": d.name, "provider": d.provider} for d in defs]

    if "skill" in req.source_types:
        results["skill"] = await _sync_skills(ws_client, registry, tool_manager, req.workspace_id)

    return {"data": results}


async def _sync_skills(
    ws_client: WorkspaceClient, registry: RegistryClient,
    tool_manager: ToolManager, workspace_id: str,
) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    try:
        db_skills = await ws_client.list_skills(workspace_id)
    except Exception:
        return result

    from vibeos_agent.registry import CapabilityDef
    tool_manager.remove_providers(f"skill:{workspace_id}")
    skill_registry = SkillRegistry()
    for row in db_skills:
        sk = Skill.from_db_config(
            row.get("config", {}), id=row.get("id", ""), name=row.get("name", ""),
        )
        skill_registry.register(sk)
        cap = CapabilityDef(
            name=f"skill.{sk.name}", provider=f"skill:{workspace_id}",
            description=sk.description or sk.name, source_type="skill",
            workspace_id=workspace_id, skill_config=row.get("config", {}),
            source="skill",
        )
        try:
            await registry.upsert_capability(cap)
            result.append({"name": cap.name, "provider": cap.provider})
        except Exception:
            pass

    skill_prov = SkillToolProvider(skill_registry)
    skill_prov.provider_key = f"skill:{workspace_id}"
    tool_manager.register_provider(skill_prov)
    return result


# ---------------------------------------------------------------------------
# Feedback & health
# ---------------------------------------------------------------------------

class FeedbackRequest(BaseModel):
    workspace_id: str
    message_id: str = ""
    agent_type: str = ""
    action_type: str
    original_output: str = ""
    modified_output: str = ""
    context: dict[str, Any] | None = None


@app.post("/api/feedback")
async def handle_feedback(req: FeedbackRequest) -> dict[str, Any]:
    memory: MemoryClient = app.state.memory
    ws_client: WorkspaceClient = app.state.ws_client
    llm: LLMGatewayClient = app.state.llm
    try:
        result = await memory.record_feedback(
            workspace_id=req.workspace_id, agent_type=req.agent_type,
            action_type=req.action_type, context=req.context or {},
            original_output=req.original_output,
            modified_output=req.modified_output,
        )
    except Exception as exc:
        return {"status": "error", "error": str(exc)}

    if req.action_type in ("approve", "reject") and req.agent_type:
        try:
            await llm.report_trust_outcome(
                "default", req.agent_type,
                success=(req.action_type == "approve"),
            )
        except Exception:
            pass

    try:
        body: dict[str, Any] = {
            "agentType": req.agent_type,
            "actionType": req.action_type,
            "originalOutput": req.original_output[:1000] if req.original_output else "",
            "context": json.dumps(req.context or {}),
        }
        if req.modified_output:
            body["modifiedOutput"] = req.modified_output[:1000]
        await ws_client._http.post(
            f"/api/workspaces/{req.workspace_id}/feedback", json=body,
        )
    except Exception:
        pass
    return {"status": "ok", "result": result}


@app.post("/api/workflow/approve")
async def handle_approval(req: dict[str, Any]) -> dict[str, Any]:
    workflow: WorkflowEngine = app.state.workflow
    resolved = workflow.resolve_approval(
        req.get("approval_key", ""), req.get("approved", False)
    )
    if not resolved:
        return {"status": "not_found", "message": "No pending approval with that key"}
    return {"status": "ok", "approved": req.get("approved")}


@app.post("/api/workflow/run-project")
async def run_project_direct(req: dict[str, Any]) -> StreamingResponse:
    """Direct workflow trigger — bypasses LLM tool calling."""
    workflow: WorkflowEngine = app.state.workflow
    ws_id = req.get("workspace_id", "")
    start_phase = req.get("start_phase", "requirement")
    user_message = req.get("user_message", "")

    async def event_gen() -> AsyncGenerator[str, None]:
        import traceback as _tb
        try:
            async for evt in workflow.run_project(ws_id, user_message, start_phase=start_phase):
                yield evt
        except Exception as exc:
            _log.error("run_project failed: %s\n%s", exc, _tb.format_exc())
            import json as _j
            yield f"event: project:error\ndata: {_j.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/workflow/run-requirement")
async def run_requirement_pipeline_direct(req: dict[str, Any]) -> StreamingResponse:
    """Trigger the requirement pipeline with phase-level stop-and-go."""
    workflow: WorkflowEngine = app.state.workflow
    ws_id = req.get("workspace_id", "")
    requirement_id = req.get("requirement_id", "")
    start_phase = req.get("start_phase")
    approved_phase = req.get("approved_phase")
    user_message = req.get("user_message", "")

    async def event_gen() -> AsyncGenerator[str, None]:
        import traceback as _tb
        try:
            async for evt in workflow.run_requirement_pipeline(
                ws_id, requirement_id, user_message,
                start_phase=start_phase,
                approved_phase=approved_phase,
            ):
                yield evt
        except Exception as exc:
            _log.error("run_requirement_pipeline failed: %s\n%s", exc, _tb.format_exc())
            import json as _j
            yield f"event: project:error\ndata: {_j.dumps({'error': str(exc)})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "pm-agent"}
