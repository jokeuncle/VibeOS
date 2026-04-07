"""PM Agent -- unified conversation gateway.

Single entry point for all AI interactions via ConversationEngine.
"""

from __future__ import annotations

import asyncio
import json
import logging as _logging
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
    RegistryClient,
    WorkspaceClient,
    load_manifest_from_yaml,
    sse_event,
)
from vibeos_agent.mcp_discovery import check_mcp_health, discover_and_register_mcp_tools
from vibeos_agent.skills import Skill, SkillRegistry, SkillToolProvider
from vibeos_agent.tools.mcp_provider import MCPToolProvider
from vibeos_agent.tools.provider import ToolManager

from .agent import PMAgent
from .workflow import WorkflowEngine


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    agent = PMAgent()
    app.state.agent = agent

    if HAS_LANGGRAPH:
        from vibeos_agent.config import AGENT_ENDPOINTS
        app.state.graph_executor = GraphExecutor(
            agent.clients.registry, llm=agent.llm, tool_manager=agent.tool_manager,
            endpoint_overrides=AGENT_ENDPOINTS,
        )
    else:
        app.state.graph_executor = None

    from .dispatch import Dispatcher
    app.state.dispatcher = Dispatcher()

    from .session import SessionManager as PMSessionManager
    app.state.sm = PMSessionManager(agent.workspace_svc, agent.ws)

    app.state.workflow = WorkflowEngine(
        app.state.dispatcher, agent.workspace_svc, agent.ws, app.state.sm,
        graph_executor=app.state.graph_executor,
        llm=agent.llm,
        tool_manager=agent.tool_manager,
        registry=agent.clients.registry,
    )

    agent.register_pm_tools(app.state.workflow, app.state.graph_executor)

    app.state.conversation = ConversationEngine(agent)

    _manifest_path = Path(__file__).resolve().parent.parent / "agent-manifest.yaml"
    if _manifest_path.exists():
        try:
            manifest = load_manifest_from_yaml(_manifest_path)
            await agent.clients.registry.register_manifest(manifest)
        except Exception:
            pass

    async def _capability_sync_loop() -> None:
        while True:
            await asyncio.sleep(60)
            for ws_id in set(agent.tool_manager._ws_loaded.keys()):
                try:
                    await discover_and_register_mcp_tools(
                        agent.workspace_svc, agent.clients.registry, ws_id,
                    )
                    await check_mcp_health(
                        agent.workspace_svc, agent.clients.registry, ws_id,
                    )
                except Exception:
                    _log.debug("Sync loop error ws=%s", ws_id, exc_info=True)

    health_task = asyncio.create_task(_capability_sync_loop())

    yield

    health_task.cancel()
    for prov in agent.tool_manager._providers:
        if isinstance(prov, MCPToolProvider):
            await prov.close()
    await agent.close()
    await app.state.dispatcher.close()


app = FastAPI(title="PM Agent", version="2.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Unified conversation endpoint
# ---------------------------------------------------------------------------

@app.get("/api/conversation/tools")
async def list_tools() -> dict[str, Any]:
    """Return all registered tool descriptors for frontend dynamic display."""
    tm: ToolManager = app.state.agent.tool_manager
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
    agent: PMAgent = app.state.agent
    from .session import SessionManager as PMSessionManager
    sm: PMSessionManager = app.state.sm

    async def event_gen() -> AsyncGenerator[str, None]:
        sid = await sm.create(
            "graph", req.workspace_id or "__graph__",
            user_message="", intent_type="graph_execute",
            triggered_by="user",
        )
        yield sm.session_start(sid, "graph", req.workspace_id or "__graph__")

        if not executor:
            yield sm.session_error(sid, "LangGraph not available")
            yield sm.done()
            return

        graph_def = req.graph_def
        if not graph_def and req.workspace_id:
            try:
                resp = await agent.workspace_svc._http.get(
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
            templates = await agent.clients.registry.list_templates(enabled_only=False)
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
    agent: PMAgent = app.state.agent
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
            caps = await agent.clients.registry.list_capabilities()
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
    agent: PMAgent = app.state.agent
    results: dict[str, Any] = {}

    if "mcp" in req.source_types:
        agent.tool_manager._ws_loaded.pop(req.workspace_id, None)
        defs = await discover_and_register_mcp_tools(
            agent.workspace_svc, agent.clients.registry, req.workspace_id,
        )
        results["mcp"] = [{"name": d.name, "provider": d.provider} for d in defs]

    if "skill" in req.source_types:
        results["skill"] = await _sync_skills(agent, req.workspace_id)

    return {"data": results}


async def _sync_skills(agent: PMAgent, workspace_id: str) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    try:
        db_skills = await agent.workspace_svc.list_skills(workspace_id)
    except Exception:
        return result

    from vibeos_agent.registry import CapabilityDef
    agent.tool_manager.remove_providers(f"skill:{workspace_id}")
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
            await agent.clients.registry.upsert_capability(cap)
            result.append({"name": cap.name, "provider": cap.provider})
        except Exception:
            pass

    skill_prov = SkillToolProvider(skill_registry)
    skill_prov.provider_key = f"skill:{workspace_id}"
    agent.tool_manager.register_provider(skill_prov)
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
    agent: PMAgent = app.state.agent
    try:
        result = await agent.memory.record_feedback(
            workspace_id=req.workspace_id, agent_type=req.agent_type,
            action_type=req.action_type, context=req.context or {},
            original_output=req.original_output,
            modified_output=req.modified_output,
        )
    except Exception as exc:
        return {"status": "error", "error": str(exc)}

    if req.action_type in ("approve", "reject") and req.agent_type:
        try:
            await agent.llm.report_trust_outcome(
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
        await agent.workspace_svc._http.post(
            f"/api/workspaces/{req.workspace_id}/feedback", json=body,
        )
    except Exception:
        pass
    return {"status": "ok", "result": result}


@app.post("/api/workflow/approve", response_model=None)
async def handle_approval(req: dict[str, Any]) -> dict[str, Any] | StreamingResponse:
    workflow: WorkflowEngine = app.state.workflow
    approval_key = req.get("approval_key", "")
    approved = req.get("approved", False)

    if approval_key.startswith("graph:") and approved:
        ctx = workflow._pending_graph_approvals.pop(approval_key, None)
        if not ctx:
            return {"status": "not_found", "message": "No pending graph approval with that key"}

        async def event_gen() -> AsyncGenerator[str, None]:
            try:
                async for evt in workflow.resume_graph(ctx["workspace_id"], ctx["graph_def"], ctx["thread_id"]):
                    yield evt
            except Exception as exc:
                _log.error("resume_graph via approve failed: %s", exc)
                yield sse_event("task", "error", {"error": str(exc)})

        return StreamingResponse(event_gen(), media_type="text/event-stream")

    if approval_key.startswith("graph:") and not approved:
        workflow._pending_graph_approvals.pop(approval_key, None)
        return {"status": "ok", "approved": False, "message": "Graph approval rejected"}

    resolved = workflow.resolve_approval(approval_key, approved)
    if not resolved:
        return {"status": "not_found", "message": "No pending approval with that key"}
    return {"status": "ok", "approved": approved}


@app.post("/api/workflow/resume-graph", response_model=None)
async def handle_resume_graph(req: dict[str, Any]) -> StreamingResponse:
    """Resume a graph paused at a human_in_loop node after approval."""
    workflow: WorkflowEngine = app.state.workflow
    ws_id = req.get("workspace_id", "")
    graph_def = req.get("graph_def", {})
    thread_id = req.get("thread_id", "")

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for evt in workflow.resume_graph(ws_id, graph_def, thread_id):
                yield evt
        except Exception as exc:
            _log.error("resume_graph failed: %s", exc)
            yield sse_event("task", "error", {"error": str(exc)})

    return StreamingResponse(event_gen(), media_type="text/event-stream")


class ToolConfirmRequest(BaseModel):
    """Payload for approving / rejecting a pending tool confirmation."""
    confirmation_key: str
    approved: bool
    workspace_id: str = ""
    tool_name: str = ""
    arguments: dict[str, Any] = {}


@app.post("/api/conversation/confirm", response_model=None)
async def handle_tool_confirmation(req: ToolConfirmRequest) -> StreamingResponse | dict[str, Any]:
    """Resolve a pending tool confirmation."""
    if not req.approved:
        return {"status": "rejected"}

    engine: ConversationEngine = app.state.conversation
    agent: PMAgent = app.state.agent
    ws_id = req.workspace_id or "__home__"

    async def event_gen() -> AsyncGenerator[str, None]:
        args = dict(req.arguments)
        args["_workspace_id"] = ws_id
        result = await agent.tool_manager.execute(req.tool_name, args)
        display = await agent.tool_manager.get_display_name(req.tool_name)
        call_id = req.confirmation_key.rsplit(":", 1)[-1] if req.confirmation_key else req.tool_name

        async for frame in engine.run_tool_continuation(
            workspace_id=ws_id,
            tool_call_id=call_id,
            tool_name=req.tool_name,
            arguments=req.arguments,
            result_text=result.output[:2000],
            result_ok=result.ok,
            display_name=display or req.tool_name,
        ):
            yield frame

    return StreamingResponse(event_gen(), media_type="text/event-stream")


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
