"""Handlers for task-related PM intents: create_task, query_progress, execute_task."""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from vibeos_agent import AgentTask, AgentType, LLMGatewayClient, WSGatewayClient, WorkspaceClient, Task

from ..context import phase_type_from_nlp_context
from ..workflow import resolve_branch_name

if TYPE_CHECKING:
    from ..dispatch import Dispatcher

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
    "high": "p1",    "p1": "p1",
    "medium": "p2",  "p2": "p2",
    "low": "p3",     "p3": "p3",
}


async def handle_create_task(
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

    from ..intent import _extract_json
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


async def handle_query_progress(
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


async def handle_execute_task(
    workspace_id: str,
    user_message: str,
    dispatcher: "Dispatcher",
    ws_client: WorkspaceClient,
    ws_gw: WSGatewayClient,
    context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Find the right agent for a pending task and dispatch execution."""
    phases = await ws_client.get_phases(workspace_id)
    target_task = None
    target_phase = None
    phase_hint = phase_type_from_nlp_context(context)

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
        msg = f"No pending tasks in {phase_hint} phase to execute." if phase_hint else "No pending tasks found to execute."
        return {"handled_by": "pm", "summary": msg}

    phase_type = target_phase.get("type", "development")

    from vibeos_agent import AGENT_PHASE_MAP
    agent_type_str = next(
        (k for k, v in AGENT_PHASE_MAP.items() if v == phase_type), "development"
    )
    try:
        at = AgentType(agent_type_str)
    except ValueError:
        at = AgentType.DEVELOPMENT

    await ws_gw.publish_log(
        workspace_id, "pm",
        f"Dispatching task '{target_task.get('title', '')}' to {at.value} agent",
    )
    await ws_client.update_task(workspace_id, target_task["id"], {"status": "in_progress"})

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

    agent_task = AgentTask(
        task_id=target_task["id"],
        workspace_id=workspace_id,
        intent=f"execute_{phase_type}",
        description=task_title,
        user_message=user_message,
        context={"task_title": task_title, "task_description": target_task.get("description", ""), "phase_type": phase_type, **gitlab_ctx},
    )
    result = await dispatcher.dispatch(at, agent_task)

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
