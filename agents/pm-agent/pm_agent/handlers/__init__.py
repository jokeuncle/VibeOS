"""PM intent dispatcher – routes parsed intents to the correct handler."""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from vibeos_agent import LLMGatewayClient, WSGatewayClient, WorkspaceClient

from ..intent import ParsedIntent
from .task import handle_create_task, handle_query_progress, handle_execute_task
from .requirement import handle_discovery_or_preview, handle_create_requirement, handle_discovery_chat
from .phase import handle_execute_phase, handle_run_project
from .pipeline import handle_trigger_build, handle_view_build_log
from ..workflow import WorkflowEngine

if TYPE_CHECKING:
    from ..dispatch import Dispatcher

_PIPELINE_INTENTS = {"trigger_build", "view_build_log", "deploy", "rollback"}


async def execute_pm_intent(
    parsed: ParsedIntent,
    workspace_id: str,
    message: str,
    context: dict[str, Any] | None,
    llm: LLMGatewayClient,
    ws: WSGatewayClient,
    ws_client: WorkspaceClient,
    workflow: WorkflowEngine,
    dispatcher: "Dispatcher | None" = None,
) -> dict[str, Any]:
    """Route PM-handled intents to the appropriate handler function."""
    zero_reqs = bool((context or {}).get("zero_requirements"))

    if parsed.intent == "create_task":
        return await handle_create_task(workspace_id, message, parsed.summary, llm, ws_client, ws)

    if parsed.intent == "create_requirement":
        if zero_reqs:
            return await handle_discovery_or_preview(workspace_id, parsed.summary, message, llm, ws_client)
        return await handle_create_requirement(workspace_id, parsed.summary, message, ws_client)

    if zero_reqs and parsed.intent == "general_chat":
        return await handle_discovery_chat(message, parsed.summary, llm)

    if parsed.intent == "query_progress":
        return await handle_query_progress(workspace_id, llm, ws_client)

    if parsed.intent == "execute_task" and dispatcher:
        return await handle_execute_task(workspace_id, message, dispatcher, ws_client, ws, context)

    if parsed.intent == "execute_phase":
        return await handle_execute_phase(workspace_id, message, workflow, ws_client, context)

    if parsed.intent == "run_project":
        return await handle_run_project(workspace_id, message, workflow, context)

    pipeline_slots = parsed.slots.get("pipeline", {})
    if parsed.intent == "trigger_build":
        return await handle_trigger_build(workspace_id, message, pipeline_slots, ws_client, ws)

    if parsed.intent == "view_build_log":
        return await handle_view_build_log(workspace_id, message, pipeline_slots, ws_client, ws)

    if parsed.intent in ("deploy", "rollback"):
        return await handle_trigger_build(workspace_id, message, pipeline_slots, ws_client, ws)

    return {"handled_by": "pm", "summary": parsed.summary}
