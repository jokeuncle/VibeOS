"""LangGraph-based workflow engine for VibeOS project lifecycle orchestration.

Defines a state graph that orchestrates multi-phase, multi-agent project execution:

  requirement -> architecture -> design -> development -> testing -> deployment -> monitoring

Each phase node:
1. Fetches pending tasks for the phase
2. Dispatches each task to the corresponding domain agent
3. Marks tasks complete
4. Emits real-time progress events via SSE
"""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from langgraph.graph import StateGraph, END

from vibeos_agent import (
    AGENT_PHASE_MAP,
    PHASE_CONTEXT,
    AgentStatus,
    AgentTask,
    AgentType,
    WSGatewayClient,
    WorkspaceClient,
)

from .dispatch import Dispatcher

PHASE_ORDER = [
    "requirement",
    "architecture",
    "design",
    "development",
    "testing",
    "deployment",
    "monitoring",
]


@dataclass
class WorkflowState:
    """Mutable state threaded through the LangGraph workflow."""
    workspace_id: str = ""
    user_message: str = ""
    current_phase_idx: int = 0
    phase_results: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    completed: bool = False
    events: list[dict[str, Any]] = field(default_factory=list)


def _agent_for_phase(phase_type: str) -> AgentType:
    """Map a phase type to the agent type responsible for it."""
    for agent_key, phase_key in AGENT_PHASE_MAP.items():
        if phase_key == phase_type:
            try:
                return AgentType(agent_key)
            except ValueError:
                pass
    return AgentType.DEVELOPMENT


class WorkflowEngine:
    """LangGraph-powered orchestrator for full project lifecycle."""

    def __init__(
        self,
        dispatcher: Dispatcher,
        ws_client: WorkspaceClient,
        ws_gw: WSGatewayClient,
    ) -> None:
        self.dispatcher = dispatcher
        self.ws_client = ws_client
        self.ws_gw = ws_gw

    async def _broadcast(self, workspace_id: str, event: dict[str, Any]) -> None:
        """Broadcast a workflow event through WebSocket gateway."""
        try:
            await self.ws_gw.publish({
                **event,
                "workspaceId": workspace_id,
            })
        except Exception:
            pass

    async def run_phase(
        self,
        workspace_id: str,
        phase_type: str,
        user_message: str = "",
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute all pending tasks in a single phase, yielding SSE events."""
        phase_start_event = {
            "type": "workflow:phase_start",
            "phase": phase_type,
            "workspace_id": workspace_id,
        }
        yield phase_start_event
        await self._broadcast(workspace_id, phase_start_event)

        await self.ws_gw.publish_agent_status(
            workspace_id, AgentType.PM, AgentStatus.RUNNING,
            detail=f"Running phase: {phase_type}",
        )

        phase_id = await self.ws_client.find_phase_by_type(workspace_id, phase_type)
        if not phase_id:
            skip_evt = {"type": "workflow:phase_skip", "phase": phase_type, "reason": "not found"}
            yield skip_evt
            await self._broadcast(workspace_id, skip_evt)
            return

        tasks = await self.ws_client.get_tasks_by_phase(workspace_id, phase_id)
        pending = [t for t in tasks if t.get("status") != "completed"]

        if not pending:
            skip_evt = {"type": "workflow:phase_skip", "phase": phase_type, "reason": "no pending tasks"}
            yield skip_evt
            await self._broadcast(workspace_id, skip_evt)
            return

        agent_type = _agent_for_phase(phase_type)

        try:
            await self.ws_client.update_phase(
                workspace_id, phase_id,
                status=__import__("vibeos_agent").PhaseStatus.IN_PROGRESS,
            )
        except Exception:
            pass

        for i, task in enumerate(pending):
            task_title = task.get("title", "Untitled")
            task_start_evt = {
                "type": "workflow:task_start",
                "phase": phase_type,
                "task_id": task["id"],
                "task_title": task_title,
                "index": i,
                "total": len(pending),
            }
            yield task_start_evt
            await self._broadcast(workspace_id, task_start_evt)

            await self.ws_gw.publish_log(
                workspace_id, "pm",
                f"[{phase_type}] Executing task {i+1}/{len(pending)}: {task_title}",
            )

            try:
                await self.ws_client.update_task(
                    workspace_id, task["id"], {"status": "in_progress"}
                )
            except Exception:
                pass

            agent_task = AgentTask(
                task_id=task["id"],
                workspace_id=workspace_id,
                intent=f"execute_{phase_type}",
                description=task_title,
                user_message=user_message or task.get("description", ""),
                context={
                    "task_title": task_title,
                    "task_description": task.get("description", ""),
                    "phase_type": phase_type,
                },
            )

            try:
                result = await self.dispatcher.dispatch(agent_type, agent_task)
                task_done_evt = {
                    "type": "workflow:task_complete",
                    "phase": phase_type,
                    "task_id": task["id"],
                    "task_title": task_title,
                    "result_summary": str(result)[:200],
                }
                yield task_done_evt
                await self._broadcast(workspace_id, task_done_evt)

                try:
                    await self.ws_client.complete_task(workspace_id, task["id"])
                except Exception:
                    pass

            except Exception as exc:
                err_evt = {
                    "type": "workflow:task_error",
                    "phase": phase_type,
                    "task_id": task["id"],
                    "error": str(exc),
                }
                yield err_evt
                await self._broadcast(workspace_id, err_evt)

        phase_done_evt = {
            "type": "workflow:phase_complete",
            "phase": phase_type,
            "tasks_executed": len(pending),
        }
        yield phase_done_evt
        await self._broadcast(workspace_id, phase_done_evt)

        await self.ws_gw.publish_log(
            workspace_id, "pm",
            f"Phase {phase_type} complete: {len(pending)} tasks executed",
            level="success",
        )

    async def run_project(
        self,
        workspace_id: str,
        user_message: str = "",
        *,
        start_phase: str | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute the full project lifecycle using LangGraph state machine."""
        proj_start_evt = {
            "type": "workflow:project_start",
            "workspace_id": workspace_id,
            "phases": PHASE_ORDER,
        }
        yield proj_start_evt
        await self._broadcast(workspace_id, proj_start_evt)

        await self.ws_gw.publish_agent_status(
            workspace_id, AgentType.PM, AgentStatus.RUNNING,
            detail="Running full project lifecycle",
        )

        start_idx = 0
        if start_phase and start_phase in PHASE_ORDER:
            start_idx = PHASE_ORDER.index(start_phase)

        for phase_type in PHASE_ORDER[start_idx:]:
            async for event in self.run_phase(workspace_id, phase_type, user_message):
                yield event

                if event.get("type") == "workflow:task_error":
                    proj_err_evt = {
                        "type": "workflow:project_error",
                        "phase": phase_type,
                        "error": event.get("error", "unknown"),
                    }
                    yield proj_err_evt
                    await self._broadcast(workspace_id, proj_err_evt)

        proj_done_evt = {
            "type": "workflow:project_complete",
            "workspace_id": workspace_id,
        }
        yield proj_done_evt
        await self._broadcast(workspace_id, proj_done_evt)

        await self.ws_gw.publish_agent_status(
            workspace_id, AgentType.PM, AgentStatus.IDLE,
        )

        await self.ws_gw.publish_log(
            workspace_id, "pm",
            "Full project lifecycle complete",
            level="success",
        )
