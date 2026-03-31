"""Handlers for phase/project execution PM intents.

These handlers are called from the synchronous NLP endpoint ``/api/nlp``
and the streaming path ``_nlp_pm_path`` via ``execute_pm_intent``.
They iterate the unified SSE strings from WorkflowEngine and collect
results into a summary dict.
"""

from __future__ import annotations

from typing import Any

from vibeos_agent import WorkspaceClient

from ..context import phase_type_from_nlp_context, start_phase_from_nlp_context
from ..session import SessionManager
from ..workflow import WorkflowEngine


async def handle_execute_phase(
    workspace_id: str,
    user_message: str,
    workflow: WorkflowEngine,
    ws_client: WorkspaceClient,
    context: dict[str, Any] | None,
) -> dict[str, Any]:
    """Run one phase via WorkflowEngine (mirrors /api/workflow/run-phase)."""
    phase_type = phase_type_from_nlp_context(context)
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

    async for sse_str in workflow.run_phase(workspace_id, phase_type, user_message):
        parsed = SessionManager.parse(sse_str)
        if not parsed:
            continue
        cat, action, data = parsed
        if cat == "phase" and action == "skip":
            skipped = True
            skip_reason = str(data.get("reason", ""))
            break
        if cat == "task" and action == "complete":
            tasks_done += 1
        if cat == "task" and action == "error":
            errors.append({"phase": data.get("phase"), "task_title": data.get("task_title"), "error": data.get("error")})

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
            if tasks_done else f"No pending tasks executed in {phase_type} phase"
        ),
        "phase": phase_type,
        "tasks_completed": tasks_done,
    }


async def handle_run_project(
    workspace_id: str,
    user_message: str,
    workflow: WorkflowEngine,
    context: dict[str, Any] | None,
) -> dict[str, Any]:
    """Full lifecycle via WorkflowEngine (mirrors /api/workflow/run-project)."""
    start_phase = start_phase_from_nlp_context(context)
    phases_run: list[str] = []
    tasks_done = 0
    errors: list[dict[str, Any]] = []
    success = False

    async for sse_str in workflow.run_project(workspace_id, user_message, start_phase=start_phase):
        parsed = SessionManager.parse(sse_str)
        if not parsed:
            continue
        cat, action, data = parsed
        if cat == "phase" and action == "start":
            phases_run.append(str(data.get("phase", "")))
        elif cat == "task" and action == "complete":
            tasks_done += 1
        elif cat == "task" and action == "error":
            errors.append({"phase": data.get("phase"), "task_title": data.get("task_title"), "error": data.get("error")})
        elif cat == "project" and action == "complete":
            success = bool(data.get("success", False))

    if errors:
        summary = f"Project run stopped ({errors[0].get('error', 'unknown')})"
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
