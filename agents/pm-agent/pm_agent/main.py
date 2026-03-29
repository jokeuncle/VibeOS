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
    MemoryClient,
    WSGatewayClient,
    WorkspaceClient,
    Task,
    config,
)

from .dispatch import Dispatcher
from .intent import parse_intent, ParsedIntent
from .workflow import PHASE_ORDER, WorkflowEngine, resolve_branch_name

_TASK_EXTRACT_PROMPT = (
    "You are a project management assistant. Given the user's request and workspace phases, "
    "extract structured task info. Reply with ONLY a JSON object:\n"
    '{"title": "<short task title>", "description": "<1-2 sentence description>", '
    '"phase_type": "<best matching phase type from the list>", '
    '"priority": "<p0|p1|p2|p3>"}\n'
    "Priority mapping: p0 = critical, p1 = high, p2 = medium, p3 = low.\n"
    "Available phase types: requirement, design, architecture, development, testing, deployment, monitoring"
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
    phase_type = task_data.get("phase_type", "requirement")
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
    app.state.memory = MemoryClient()
    app.state.workflow = WorkflowEngine(
        app.state.dispatcher, app.state.ws_client, app.state.ws,
    )
    yield
    await app.state.llm.close()
    await app.state.dispatcher.close()
    await app.state.ws.close()
    await app.state.ws_client.close()
    await app.state.memory.close()


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


async def _handle_execute_task(
    workspace_id: str,
    user_message: str,
    dispatcher: "Dispatcher",
    ws_client: WorkspaceClient,
    ws_gw: WSGatewayClient,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Find the right agent for a task and dispatch execution."""
    phases = await ws_client.get_phases(workspace_id)
    target_task = None
    target_phase = None
    phase_hint = _phase_type_from_nlp_context(context)

    if phase_hint:
        for phase in phases:
            if str(phase.get("type", "")).lower() != phase_hint:
                continue
            for t in phase.get("tasks", []):
                if t.get("status") != "completed":
                    target_task = t
                    target_phase = phase
                    break
            break
    else:
        for phase in phases:
            for t in phase.get("tasks", []):
                if t.get("status") != "completed":
                    target_task = t
                    target_phase = phase
                    break
            if target_task:
                break

    if not target_task:
        if phase_hint:
            return {
                "handled_by": "pm",
                "summary": f"No pending tasks in {phase_hint} phase to execute.",
            }
        return {"handled_by": "pm", "summary": "No pending tasks found to execute."}

    phase_type = target_phase.get("type", "development")

    from vibeos_agent import AGENT_PHASE_MAP
    agent_type_str = None
    for agent_key, phase_key in AGENT_PHASE_MAP.items():
        if phase_key == phase_type:
            agent_type_str = agent_key
            break
    if not agent_type_str:
        agent_type_str = "development"

    try:
        at = AgentType(agent_type_str)
    except ValueError:
        at = AgentType.DEVELOPMENT

    await ws_gw.publish_log(
        workspace_id, "pm",
        f"Dispatching task '{target_task.get('title', '')}' to {at.value} agent",
    )

    await ws_client.update_task(workspace_id, target_task["id"], {"status": "in_progress"})

    # Resolve GitLab repo context (same logic as workflow.py run_phase)
    task_title = target_task.get("title", "")
    repos = await ws_client.get_repos_for_phase(workspace_id, phase_type)
    primary = next((r for r in repos if r.get("isPrimary")), repos[0] if repos else None)
    gitlab_ctx: dict[str, Any] = {}
    if primary:
        strategy = primary.get("branchStrategy", "feature")
        default_branch = primary.get("branchDefault", "main")
        gitlab_ctx = {
            "gitlab_repos": repos,
            "gitlab_primary_project": primary.get("projectId"),
            "gitlab_primary_url": primary.get("gitlabUrl"),
            "gitlab_branch_strategy": strategy,
            "gitlab_branch_default": default_branch,
            "gitlab_branch": resolve_branch_name(task_title, strategy, default_branch),
            "gitlab_credential_id": primary.get("credentialId"),
        }

    task = AgentTask(
        task_id=target_task["id"],
        workspace_id=workspace_id,
        intent=f"execute_{phase_type}",
        description=task_title,
        user_message=user_message,
        context={
            "task_title": task_title,
            "task_description": target_task.get("description", ""),
            "phase_type": phase_type,
            **gitlab_ctx,
        },
    )

    result = await dispatcher.dispatch(at, task)

    if isinstance(result, dict) and result.get("error"):
        return {
            "handled_by": "pm",
            "action": "task_failed",
            "summary": f"Task '{target_task.get('title', '')}' failed: {result['error']}",
            "result": result,
        }

    try:
        await ws_client.complete_task(workspace_id, target_task["id"])
    except Exception:
        pass

    return {
        "handled_by": "pm",
        "action": "task_executed",
        "summary": f"Executed task: {target_task.get('title', '')} via {at.value} agent",
        "result": result,
    }


async def _enrich_context_with_gitlab(
    workspace_id: str,
    client_context: dict[str, Any] | None,
    ws_client: WorkspaceClient,
) -> dict[str, Any]:
    """Merge client-supplied context with server-side GitLab repo information.

    This ensures the domain agent always receives credential_id, project_id,
    and branch info even when the NLP path (not workflow) is used.
    """
    ctx = dict(client_context or {})
    if ctx.get("gitlab_credential_id"):
        return ctx

    phase_type = ctx.get("phase_type", "development")
    try:
        repos = await ws_client.get_repos_for_phase(workspace_id, phase_type)
        primary = next((r for r in repos if r.get("isPrimary")), repos[0] if repos else None)
        if primary:
            strategy = primary.get("branchStrategy", "feature")
            default_branch = primary.get("branchDefault", "main")
            ctx.setdefault("gitlab_repos", repos)
            ctx.setdefault("gitlab_primary_project", primary.get("projectId"))
            ctx.setdefault("gitlab_primary_url", primary.get("gitlabUrl"))
            ctx.setdefault("gitlab_branch_strategy", strategy)
            ctx.setdefault("gitlab_branch_default", default_branch)
            ctx.setdefault("gitlab_credential_id", primary.get("credentialId"))
            task_hint = ctx.get("task_title", "task")
            ctx.setdefault("gitlab_branch", resolve_branch_name(task_hint, strategy, default_branch))
    except Exception:
        pass
    return ctx


def _phase_type_from_nlp_context(context: dict[str, Any] | None) -> str | None:
    """Optional UI hint: current phase tab (same semantics as /api/workflow/run-phase)."""
    if not context:
        return None
    for key in ("phase_type", "current_phase_type"):
        raw = context.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip().lower()
    return None


def _start_phase_from_nlp_context(context: dict[str, Any] | None) -> str | None:
    if not context:
        return None
    raw = context.get("start_phase")
    if isinstance(raw, str) and raw.strip():
        s = raw.strip().lower()
        if s in PHASE_ORDER:
            return s
    return None


async def _handle_execute_phase(
    workspace_id: str,
    user_message: str,
    workflow: WorkflowEngine,
    ws_client: WorkspaceClient,
    context: dict[str, Any] | None,
) -> dict[str, Any]:
    """Run one phase via WorkflowEngine (matches SSE /api/workflow/run-phase)."""
    phase_type = _phase_type_from_nlp_context(context)
    if not phase_type:
        phases = await ws_client.get_phases(workspace_id)
        for phase in phases:
            if phase.get("status") != "completed":
                phase_type = phase.get("type", "development")
                break

    if not phase_type:
        return {"handled_by": "pm", "summary": "All phases are completed."}

    tasks_done = 0
    errors: list[dict[str, Any]] = []
    skipped = False
    skip_reason = ""

    async for event in workflow.run_phase(workspace_id, phase_type, user_message):
        et = event.get("type")
        if et == "workflow:phase_skip":
            skipped = True
            skip_reason = str(event.get("reason", ""))
            break
        if et == "workflow:task_complete":
            tasks_done += 1
        if et == "workflow:task_error":
            errors.append(
                {
                    "phase": event.get("phase"),
                    "task_title": event.get("task_title"),
                    "error": event.get("error"),
                },
            )

    if skipped:
        return {
            "handled_by": "pm",
            "action": "phase_skipped",
            "summary": f"Phase {phase_type} skipped: {skip_reason or 'no work'}",
            "phase": phase_type,
        }

    if errors:
        err0 = errors[0].get("error", "unknown")
        return {
            "handled_by": "pm",
            "action": "phase_partial_failure",
            "summary": f"Phase {phase_type}: task failed — {err0}",
            "phase": phase_type,
            "tasks_completed": tasks_done,
            "errors": errors,
        }

    return {
        "handled_by": "pm",
        "action": "phase_executed",
        "summary": (
            f"Executed {tasks_done} task(s) in {phase_type} phase"
            if tasks_done
            else f"No pending tasks executed in {phase_type} phase"
        ),
        "phase": phase_type,
        "tasks_completed": tasks_done,
    }


async def _handle_run_project(
    workspace_id: str,
    user_message: str,
    workflow: WorkflowEngine,
    context: dict[str, Any] | None,
) -> dict[str, Any]:
    """Full lifecycle via WorkflowEngine (matches SSE /api/workflow/run-project)."""
    start_phase = _start_phase_from_nlp_context(context)
    phases_run: list[str] = []
    tasks_done = 0
    errors: list[dict[str, Any]] = []
    success = False

    async for event in workflow.run_project(
        workspace_id, user_message, start_phase=start_phase,
    ):
        et = event.get("type")
        if et == "workflow:phase_start":
            phases_run.append(str(event.get("phase", "")))
        elif et == "workflow:task_complete":
            tasks_done += 1
        elif et == "workflow:task_error":
            errors.append(
                {
                    "phase": event.get("phase"),
                    "task_title": event.get("task_title"),
                    "error": event.get("error"),
                },
            )
        elif et == "workflow:project_complete":
            success = bool(event.get("success", False))

    if errors:
        err0 = errors[0].get("error", "unknown")
        summary = f"Project run stopped ({err0})"
    elif success:
        summary = f"Full project run finished ({tasks_done} task(s) completed)."
    else:
        summary = "Project run finished."

    return {
        "handled_by": "pm",
        "action": "project_executed",
        "summary": summary,
        "success": success,
        "tasks_completed": tasks_done,
        "phases_touched": phases_run,
        "errors": errors,
    }


async def _handle_create_requirement(
    workspace_id: str, summary: str, user_message: str, ws_client: WorkspaceClient
) -> dict[str, Any]:
    req = await ws_client.create_requirement(workspace_id, title=summary, description=user_message)
    return {"handled_by": "pm", "action": "create_requirement", "requirement": req}


async def _execute_pm_intent(
    parsed: ParsedIntent,
    req: NLPRequest,
    llm: LLMGatewayClient,
    ws: WSGatewayClient,
    ws_client: WorkspaceClient,
    workflow: WorkflowEngine,
    dispatcher: "Dispatcher | None" = None,
) -> dict[str, Any]:
    """Execute PM-handled intents (create_task, query_progress, execute_task, execute_phase, etc.)."""
    if parsed.intent == "create_task":
        return await _handle_create_task(
            req.workspace_id, req.message, parsed.summary, llm, ws_client, ws,
        )
    if parsed.intent == "create_requirement":
        return await _handle_create_requirement(
            req.workspace_id, parsed.summary, req.message, ws_client,
        )
    if parsed.intent == "query_progress":
        return await _handle_query_progress(req.workspace_id, llm, ws_client)
    if parsed.intent == "execute_task" and dispatcher:
        return await _handle_execute_task(
            req.workspace_id, req.message, dispatcher, ws_client, ws, req.context,
        )
    if parsed.intent == "execute_phase":
        return await _handle_execute_phase(
            req.workspace_id, req.message, workflow, ws_client, req.context,
        )
    if parsed.intent == "run_project":
        return await _handle_run_project(
            req.workspace_id, req.message, workflow, req.context,
        )
    return {"handled_by": "pm", "summary": parsed.summary}


@app.post("/api/nlp", response_model=NLPResponse)
async def handle_nlp(req: NLPRequest) -> NLPResponse:
    """Parse user intent and dispatch to the appropriate domain agent."""
    llm: LLMGatewayClient = app.state.llm
    dispatcher: Dispatcher = app.state.dispatcher
    ws: WSGatewayClient = app.state.ws
    ws_client: WorkspaceClient = app.state.ws_client
    workflow: WorkflowEngine = app.state.workflow

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
            AgentStatus.RUNNING,
            detail=f"Parsed intent: {parsed.intent}",
        )

        if parsed.target_agent == AgentType.PM:
            result = await _execute_pm_intent(
                parsed, req, llm, ws, ws_client, workflow, dispatcher,
            )
            return NLPResponse(
                intent=parsed.intent,
                summary=result.get("summary", parsed.summary),
                target_agent=parsed.target_agent.value,
                result=result,
            )

        enriched_ctx = await _enrich_context_with_gitlab(
            req.workspace_id, req.context, ws_client,
        )

        task = AgentTask(
            task_id=uuid.uuid4().hex,
            workspace_id=req.workspace_id,
            intent=parsed.intent,
            description=parsed.summary,
            user_message=req.message,
            context=enriched_ctx,
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


async def _yield_text_as_deltas(
    text: str, chunk_size: int = 6,
) -> AsyncGenerator[str, None]:
    """Break *text* into small chunks and yield them as SSE delta events.

    This turns a pre-computed response into a gradual stream so the UI renders
    it progressively instead of dumping everything at once.
    """
    import asyncio

    i = 0
    while i < len(text):
        end = min(i + chunk_size, len(text))
        # Extend to the next word boundary to avoid mid-word splits
        if end < len(text) and text[end] not in (" ", "\n", "\t", "，", "。", "、", "；"):
            space = text.find(" ", end)
            newline = text.find("\n", end)
            candidates = [c for c in (space, newline) if c != -1]
            if candidates and min(candidates) - i < chunk_size * 3:
                end = min(candidates) + 1
        chunk = text[i:end]
        if chunk:
            yield f"data: {json.dumps({'delta': chunk})}\n\n"
            await asyncio.sleep(0.012)
        i = end


@app.post("/api/nlp/stream")
async def handle_nlp_stream(req: NLPRequest) -> StreamingResponse:
    """SSE streaming NLP: parse intent then forward agent streaming response."""
    llm: LLMGatewayClient = app.state.llm
    dispatcher: Dispatcher = app.state.dispatcher
    ws: WSGatewayClient = app.state.ws
    ws_client: WorkspaceClient = app.state.ws_client
    workflow: WorkflowEngine = app.state.workflow

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

            if parsed.intent != "general_chat" and parsed.intent != "query_progress" and workflow.is_busy(req.workspace_id):
                yield f"data: {json.dumps({'delta': '⏳ 当前工作空间正在执行任务，请等待完成后再操作。 / Workspace is busy, please wait for the current operation to finish.'})}\n\n"
                yield "data: [DONE]\n\n"
                return

            await ws.publish_agent_status(
                req.workspace_id, AgentType.PM, AgentStatus.RUNNING,
                detail=f"Parsed intent: {parsed.intent}",
            )

            if parsed.target_agent == AgentType.PM:
                if parsed.intent == "general_chat":
                    messages = [
                        {"role": "system", "content": "You are VibeOS PM assistant. Help the user with project management, planning, and general questions. Respond in clear natural language."},
                        {"role": "user", "content": req.message},
                    ]
                    async for chunk in llm.chat_stream(messages):
                        delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                        if delta:
                            yield f"data: {json.dumps({'delta': delta})}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                result = await _execute_pm_intent(
                    parsed, req, llm, ws, ws_client, workflow, dispatcher,
                )
                summary = result.get("summary", parsed.summary)
                async for evt in _yield_text_as_deltas(summary):
                    yield evt

                payload_extras: dict[str, Any] = {}
                if result.get("created_tasks"):
                    payload_extras["created_tasks"] = result["created_tasks"]
                if result.get("artifacts"):
                    payload_extras["artifacts"] = result["artifacts"]
                if payload_extras:
                    yield f"data: {json.dumps({'payload': payload_extras})}\n\n"

                yield "data: [DONE]\n\n"
                return

            enriched_ctx = await _enrich_context_with_gitlab(
                req.workspace_id, req.context, ws_client,
            )

            task = AgentTask(
                task_id=uuid.uuid4().hex,
                workspace_id=req.workspace_id,
                intent=parsed.intent,
                description=parsed.summary,
                user_message=req.message,
                context=enriched_ctx,
            )

            async for chunk in dispatcher.dispatch_stream(parsed.target_agent, task):
                chunk_type = chunk.get("type", "")

                if chunk_type == "result":
                    payload = chunk.get("payload", {})
                    summary_text = payload.get("summary", "") or chunk.get("summary", "")
                    if summary_text:
                        async for evt in _yield_text_as_deltas(summary_text):
                            yield evt

                    rich_payload: dict[str, Any] = {}
                    for key in ("artifacts", "code_artifacts", "created_tasks"):
                        if payload.get(key):
                            rich_payload[key] = payload[key]
                    if rich_payload:
                        yield f"data: {json.dumps({'payload': rich_payload})}\n\n"
                elif chunk.get("delta"):
                    yield f"data: {json.dumps(chunk)}\n\n"
                elif chunk.get("error"):
                    yield f"data: {json.dumps(chunk)}\n\n"
                else:
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


class RunTaskRequest(BaseModel):
    workspace_id: str
    task_id: str
    user_message: str = ""


class RunPhaseRequest(BaseModel):
    workspace_id: str
    phase_type: str
    user_message: str = ""


class RunProjectRequest(BaseModel):
    workspace_id: str
    user_message: str = ""
    start_phase: str | None = None


@app.post("/api/workflow/run-task")
async def handle_run_task(req: RunTaskRequest) -> StreamingResponse:
    """SSE: execute a single task by ID."""
    workflow: WorkflowEngine = app.state.workflow

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in workflow.run_task(
                req.workspace_id, req.task_id, req.user_message
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/workflow/run-phase")
async def handle_run_phase(req: RunPhaseRequest) -> StreamingResponse:
    """SSE: execute all pending tasks in a single phase."""
    workflow: WorkflowEngine = app.state.workflow

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in workflow.run_phase(
                req.workspace_id, req.phase_type, req.user_message
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.post("/api/workflow/run-project")
async def handle_run_project(req: RunProjectRequest) -> StreamingResponse:
    """SSE: execute the full project lifecycle end-to-end."""
    workflow: WorkflowEngine = app.state.workflow

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in workflow.run_project(
                req.workspace_id, req.user_message, start_phase=req.start_phase
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


class RunRequirementRequest(BaseModel):
    workspace_id: str
    requirement_id: str
    phase_type: str | None = None
    user_message: str = ""


@app.post("/api/workflow/run-requirement")
async def handle_run_requirement(req: RunRequirementRequest) -> StreamingResponse:
    """SSE: execute all pending tasks for a requirement in a specific phase."""
    workflow: WorkflowEngine = app.state.workflow

    async def event_gen() -> AsyncGenerator[str, None]:
        try:
            async for event in workflow.run_requirement(
                req.workspace_id, req.requirement_id, req.user_message, req.phase_type
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


class FeedbackRequest(BaseModel):
    workspace_id: str
    message_id: str = ""
    agent_type: str = ""
    action_type: str  # approve | reject
    original_output: str = ""
    context: dict[str, Any] | None = None


@app.post("/api/feedback")
async def handle_feedback(req: FeedbackRequest) -> dict[str, Any]:
    """Record user feedback (approve/reject) on agent output.

    Forwards to memory-service which converts it into preference memory,
    enabling Hindsight-style reflect operations that improve future outputs.
    Also stores the signal in workspace-svc for trust score tracking.
    """
    memory: MemoryClient = app.state.memory
    ws_client: WorkspaceClient = app.state.ws_client

    try:
        result = await memory.record_feedback(
            workspace_id=req.workspace_id,
            agent_type=req.agent_type,
            action_type=req.action_type,
            context=req.context or {},
            original_output=req.original_output,
        )
    except Exception as exc:
        return {"status": "error", "error": str(exc)}

    try:
        import json as _json
        await ws_client._http.post(
            f"/api/workspaces/{req.workspace_id}/feedback",
            json={
                "agentType": req.agent_type,
                "actionType": req.action_type,
                "originalOutput": req.original_output[:1000] if req.original_output else "",
                "context": _json.dumps(req.context or {}),
            },
        )
    except Exception:
        pass

    return {"status": "ok", "result": result}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "pm-agent"}
