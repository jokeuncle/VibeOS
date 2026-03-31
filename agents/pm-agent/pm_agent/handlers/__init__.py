"""PM intent dispatcher – routes parsed intents via the task resolver.

Handlers are registered with ``@intent_handler("intent_name")`` so the
resolver can look them up without an if-chain.  The ``execute_pm_intent``
function tries the remote task-template registry first, then falls back
to locally registered handlers.
"""

from __future__ import annotations

from typing import Any, TYPE_CHECKING

from vibeos_agent import LLMGatewayClient, RegistryClient, WSGatewayClient, WorkspaceClient

from ..intent import ParsedIntent
from ..resolver import dispatch_intent, intent_handler
from .task import handle_create_task, handle_query_progress, handle_execute_task
from .requirement import handle_discovery_or_preview, handle_create_requirement, handle_discovery_chat
from .phase import handle_execute_phase, handle_run_project
from .pipeline import handle_trigger_build, handle_view_build_log
from .workspace_repo import handle_bind_workspace_repo
from ..workflow import WorkflowEngine

if TYPE_CHECKING:
    from ..dispatch import Dispatcher


# ---------------------------------------------------------------------------
# Register PM handlers (replaces the old if-chain)
# ---------------------------------------------------------------------------

@intent_handler("create_task")
async def _h_create_task(*, parsed: ParsedIntent, workspace_id: str, message: str,
                         llm: LLMGatewayClient, ws_client: WorkspaceClient, ws: WSGatewayClient, **_: Any) -> dict[str, Any]:
    return await handle_create_task(workspace_id, message, parsed.summary, llm, ws_client, ws)


@intent_handler("create_requirement")
async def _h_create_requirement(*, parsed: ParsedIntent, workspace_id: str, message: str,
                                context: dict[str, Any] | None, llm: LLMGatewayClient,
                                ws_client: WorkspaceClient, **_: Any) -> dict[str, Any]:
    zero_reqs = bool((context or {}).get("zero_requirements"))
    if zero_reqs:
        return await handle_discovery_or_preview(workspace_id, parsed.summary, message, llm, ws_client)
    return await handle_create_requirement(workspace_id, parsed.summary, message, ws_client)


@intent_handler("bind_workspace_repo")
async def _h_bind_repo(*, parsed: ParsedIntent, workspace_id: str, message: str,
                       context: dict[str, Any] | None, ws_client: WorkspaceClient, **_: Any) -> dict[str, Any]:
    return await handle_bind_workspace_repo(workspace_id, message, parsed.slots, context, ws_client)


@intent_handler("general_chat")
async def _h_general_chat(*, parsed: ParsedIntent, context: dict[str, Any] | None,
                          message: str, llm: LLMGatewayClient, **_: Any) -> dict[str, Any]:
    zero_reqs = bool((context or {}).get("zero_requirements"))
    if zero_reqs:
        return await handle_discovery_chat(message, parsed.summary, llm)
    return {"handled_by": "pm", "summary": parsed.summary}


@intent_handler("query_progress")
async def _h_query_progress(*, workspace_id: str, llm: LLMGatewayClient,
                            ws_client: WorkspaceClient, **_: Any) -> dict[str, Any]:
    return await handle_query_progress(workspace_id, llm, ws_client)


@intent_handler("execute_task")
async def _h_execute_task(*, workspace_id: str, message: str,
                          dispatcher: "Dispatcher | None", ws_client: WorkspaceClient,
                          ws: WSGatewayClient, context: dict[str, Any] | None, **_: Any) -> dict[str, Any]:
    if not dispatcher:
        return {"handled_by": "pm", "error": "no dispatcher"}
    return await handle_execute_task(workspace_id, message, dispatcher, ws_client, ws, context)


@intent_handler("execute_phase")
async def _h_execute_phase(*, workspace_id: str, message: str, workflow: WorkflowEngine,
                           ws_client: WorkspaceClient, context: dict[str, Any] | None, **_: Any) -> dict[str, Any]:
    return await handle_execute_phase(workspace_id, message, workflow, ws_client, context)


@intent_handler("run_project")
async def _h_run_project(*, workspace_id: str, message: str, workflow: WorkflowEngine,
                         context: dict[str, Any] | None, **_: Any) -> dict[str, Any]:
    return await handle_run_project(workspace_id, message, workflow, context)


@intent_handler("trigger_build")
async def _h_trigger_build(*, parsed: ParsedIntent, workspace_id: str, message: str,
                           ws_client: WorkspaceClient, ws: WSGatewayClient, **_: Any) -> dict[str, Any]:
    return await handle_trigger_build(workspace_id, message, parsed.slots.get("pipeline", {}), ws_client, ws)


@intent_handler("view_build_log")
async def _h_view_build_log(*, parsed: ParsedIntent, workspace_id: str, message: str,
                            ws_client: WorkspaceClient, ws: WSGatewayClient, **_: Any) -> dict[str, Any]:
    return await handle_view_build_log(workspace_id, message, parsed.slots.get("pipeline", {}), ws_client, ws)


@intent_handler("deploy")
async def _h_deploy(*, parsed: ParsedIntent, workspace_id: str, message: str,
                    ws_client: WorkspaceClient, ws: WSGatewayClient, **_: Any) -> dict[str, Any]:
    return await handle_trigger_build(workspace_id, message, parsed.slots.get("pipeline", {}), ws_client, ws)


@intent_handler("rollback")
async def _h_rollback(*, parsed: ParsedIntent, workspace_id: str, message: str,
                      ws_client: WorkspaceClient, ws: WSGatewayClient, **_: Any) -> dict[str, Any]:
    return await handle_trigger_build(workspace_id, message, parsed.slots.get("pipeline", {}), ws_client, ws)


# ---------------------------------------------------------------------------
# Main entry point (used by main.py)
# ---------------------------------------------------------------------------

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
    registry: RegistryClient | None = None,
) -> dict[str, Any]:
    """Route PM-handled intents via task-template resolution + local handlers."""
    result = await dispatch_intent(
        parsed,
        context_scope="workspace",
        registry=registry,
        handler_kwargs={
            "workspace_id": workspace_id,
            "message": message,
            "context": context,
            "llm": llm,
            "ws": ws,
            "ws_client": ws_client,
            "workflow": workflow,
            "dispatcher": dispatcher,
        },
    )
    if result is not None:
        return result

    return {"handled_by": "pm", "summary": parsed.summary}
