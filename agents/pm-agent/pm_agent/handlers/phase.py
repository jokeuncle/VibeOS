"""Handlers for phase/project execution PM intents."""

from __future__ import annotations

from typing import Any

from vibeos_agent import WorkspaceClient

from ..context import phase_type_from_nlp_context, start_phase_from_nlp_context
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

    async for event in workflow.run_phase(workspace_id, phase_type, user_message):
        et = event.get("type")
        if et == "workflow:phase_skip":
            skipped = True
            skip_reason = str(event.get("reason", ""))
            break
        if et == "workflow:task_complete":
            tasks_done += 1
        if et == "workflow:task_error":
            errors.append({"phase": event.get("phase"), "task_title": event.get("task_title"), "error": event.get("error")})

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

    async for event in workflow.run_project(workspace_id, user_message, start_phase=start_phase):
        et = event.get("type")
        if et == "workflow:phase_start":
            phases_run.append(str(event.get("phase", "")))
        elif et == "workflow:task_complete":
            tasks_done += 1
        elif et == "workflow:task_error":
            errors.append({"phase": event.get("phase"), "task_title": event.get("task_title"), "error": event.get("error")})
        elif et == "workflow:project_complete":
            success = bool(event.get("success", False))

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
