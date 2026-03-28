"""Workflow engine for VibeOS project lifecycle orchestration.

Orchestrates multi-phase, multi-agent project execution:

  requirement -> architecture -> design -> development -> testing -> deployment -> monitoring

Each phase:
1. Fetches pending tasks for the phase
2. Dispatches each task to the corresponding domain agent
3. Marks tasks complete
4. Emits real-time progress events via SSE + WebSocket
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import httpx

from vibeos_agent import (
    AGENT_PHASE_MAP,
    AgentStatus,
    AgentTask,
    AgentType,
    PhaseStatus,
    WSGatewayClient,
    WorkspaceClient,
    config,
)

from .dispatch import Dispatcher

_logger = logging.getLogger(__name__)

KNOWLEDGE_SVC_URL = os.getenv("KNOWLEDGE_SVC_URL", config.knowledge_svc_url)
RAG_SVC_URL = os.getenv("RAG_SVC_URL", config.rag_svc_url)
MEMORY_SVC_URL = os.getenv("MEMORY_SVC_URL", config.memory_svc_url)

PHASE_ORDER = [
    "requirement",
    "architecture",
    "design",
    "development",
    "testing",
    "deployment",
    "monitoring",
]


def resolve_branch_name(task_title: str, strategy: str, default_branch: str) -> str:
    """Compute a deterministic branch name from the task title and strategy.

    This eliminates LLM free-form branch naming which leads to inconsistency.
    """
    slug = re.sub(r"[^\w]+", "-", task_title.lower())[:40].strip("-")
    if strategy == "feature":
        return f"feat/{slug}"
    if strategy == "gitflow":
        return f"feature/{slug}"
    return default_branch  # "direct" – commit straight to default


async def _trigger_distill(workspace_id: str, access_level: str = "enterprise") -> None:
    """Fire-and-forget knowledge distillation after a phase completes.

    Follows EvolveR's offline self-distillation pattern: interaction
    trajectories are synthesised into reusable strategic principles for
    future retrieval.  Non-blocking — failures are logged, not raised.
    """
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{KNOWLEDGE_SVC_URL}/api/distill",
                json={
                    "workspace_id": workspace_id,
                    "target_access_level": access_level,
                },
            )
            resp.raise_for_status()
            body = resp.json()
            _logger.info(
                "Distillation complete for workspace=%s: stored %s items",
                workspace_id,
                body.get("stored_count", "?"),
            )
    except Exception as exc:
        _logger.warning("Async distillation failed (non-blocking): %s", exc)


async def _auto_index_to_rag(
    workspace_id: str,
    title: str,
    content: str,
    doc_type: str = "agent_output",
) -> None:
    """Index agent output to RAG for future retrieval.  Non-blocking."""
    if len(content) < 100:
        return
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.post(
                f"{RAG_SVC_URL}/api/index/documents",
                json={
                    "workspace_id": workspace_id,
                    "documents": [
                        {"title": title, "content": content[:8000], "doc_type": doc_type}
                    ],
                },
            )
    except Exception as exc:
        _logger.warning("Auto-RAG index failed (non-blocking): %s", exc)


async def _store_org_memory(workspace_id: str, content: str) -> None:
    """Promote key learnings to org-level memory for cross-workspace benefit."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(
                f"{MEMORY_SVC_URL}/api/memory/org/add",
                json={
                    "content": content,
                    "metadata": {"source_workspace": workspace_id, "layer": "org"},
                },
            )
    except Exception as exc:
        _logger.warning("Org memory store failed (non-blocking): %s", exc)


@dataclass
class WorkflowState:
    """Mutable state threaded through the workflow engine."""
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
    """Orchestrator for full project lifecycle execution."""

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

    async def _recover_after_project_error(
        self,
        workspace_id: str,
        phase_type: str,
        failed_task_id: str | None,
    ) -> None:
        """Avoid leaving phase/task stuck in in_progress when run_project aborts mid-phase."""
        phase_id = await self.ws_client.find_phase_by_type(workspace_id, phase_type)
        if not phase_id:
            return
        try:
            await self.ws_client.update_phase(
                workspace_id, phase_id,
                status=PhaseStatus.PENDING,
            )
        except Exception:
            pass
        if failed_task_id:
            try:
                await self.ws_client.update_task(
                    workspace_id, failed_task_id, {"status": "pending"},
                )
            except Exception:
                pass
        await self.ws_gw.publish_log(
            workspace_id, "pm",
            f"Project run stopped in {phase_type}; phase reset to pending "
            f"and failed task unlocked for retry.",
            level="warn",
        )

    async def run_task(
        self,
        workspace_id: str,
        task_id: str,
        user_message: str = "",
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute a single task by ID, yielding SSE events."""
        phases = await self.ws_client.get_phases(workspace_id)
        target_task: dict[str, Any] | None = None
        phase_type: str = "development"
        for phase in phases:
            for t in phase.get("tasks", []):
                if t.get("id") == task_id:
                    target_task = t
                    phase_type = phase.get("type", "development")
                    break
            if target_task:
                break

        if not target_task:
            yield {"type": "workflow:task_error", "task_id": task_id, "error": "Task not found"}
            return

        task_title = target_task.get("title", "Untitled")
        agent_type = _agent_for_phase(phase_type)

        task_start_evt = {
            "type": "workflow:task_start",
            "phase": phase_type,
            "task_id": task_id,
            "task_title": task_title,
            "index": 0,
            "total": 1,
        }
        yield task_start_evt
        await self._broadcast(workspace_id, task_start_evt)

        try:
            await self.ws_client.update_task(workspace_id, task_id, {"status": "in_progress"})
        except Exception:
            pass

        repos = await self.ws_client.get_repos_for_phase(workspace_id, phase_type)
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
            task_id=task_id,
            workspace_id=workspace_id,
            intent=f"execute_{phase_type}",
            description=task_title,
            user_message=user_message or target_task.get("description", ""),
            context={
                "task_title": task_title,
                "task_description": target_task.get("description", ""),
                "phase_type": phase_type,
                **gitlab_ctx,
            },
        )

        try:
            result = await self.dispatcher.dispatch(agent_type, agent_task)

            if isinstance(result, dict) and result.get("error"):
                try:
                    await self.ws_client.update_task(workspace_id, task_id, {"status": "pending"})
                except Exception:
                    pass
                err_evt = {
                    "type": "workflow:task_error",
                    "phase": phase_type,
                    "task_id": task_id,
                    "task_title": task_title,
                    "error": str(result["error"]),
                }
                yield err_evt
                await self._broadcast(workspace_id, err_evt)
            else:
                try:
                    await self.ws_client.complete_task(workspace_id, task_id)
                except Exception:
                    pass
                full_result = str(result)
                done_evt = {
                    "type": "workflow:task_complete",
                    "phase": phase_type,
                    "task_id": task_id,
                    "task_title": task_title,
                    "result_summary": full_result[:200],
                }
                yield done_evt
                await self._broadcast(workspace_id, done_evt)
                if len(full_result) > 100:
                    asyncio.create_task(
                        _auto_index_to_rag(workspace_id, f"[{phase_type}] {task_title}", full_result)
                    )
        except Exception as exc:
            try:
                await self.ws_client.update_task(workspace_id, task_id, {"status": "pending"})
            except Exception:
                pass
            err_evt = {
                "type": "workflow:task_error",
                "phase": phase_type,
                "task_id": task_id,
                "task_title": task_title,
                "error": str(exc),
            }
            yield err_evt
            await self._broadcast(workspace_id, err_evt)

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
                status=PhaseStatus.IN_PROGRESS,
            )
        except Exception:
            pass

        tasks_succeeded = 0
        tasks_failed = 0
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
                task_id=task["id"],
            )

            try:
                await self.ws_client.update_task(
                    workspace_id, task["id"], {"status": "in_progress"}
                )
            except Exception:
                pass

            # --- Resolve GitLab repo context for this task ---
            repos = await self.ws_client.get_repos_for_phase(workspace_id, phase_type)
            primary = next((r for r in repos if r.get("isPrimary")), repos[0] if repos else None)

            gitlab_ctx: dict[str, Any] = {}
            if primary:
                strategy = primary.get("branchStrategy", "feature")
                default_branch = primary.get("branchDefault", "main")
                computed_branch = resolve_branch_name(task_title, strategy, default_branch)
                gitlab_ctx = {
                    "gitlab_repos": repos,
                    "gitlab_primary_project": primary.get("projectId"),
                    "gitlab_primary_url": primary.get("gitlabUrl"),
                    "gitlab_branch_strategy": strategy,
                    "gitlab_branch_default": default_branch,
                    "gitlab_branch": computed_branch,
                    "gitlab_credential_id": primary.get("credentialId"),
                }
                await self.ws_gw.publish_log(
                    workspace_id, "pm",
                    f"Repo context: {primary.get('projectId')} branch={computed_branch}",
                    task_id=task["id"],
                )

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
                    **gitlab_ctx,
                },
            )

            await self.ws_gw.publish_log(
                workspace_id, "pm",
                f"Dispatching to {agent_type.value} agent...",
                task_id=task["id"],
            )

            try:
                result = await self.dispatcher.dispatch(agent_type, agent_task)

                if isinstance(result, dict) and result.get("error"):
                    tasks_failed += 1
                    err_msg = str(result["error"])
                    await self.ws_gw.publish_log(
                        workspace_id, "pm",
                        f"Task error: {err_msg[:200]}",
                        level="error",
                        task_id=task["id"],
                    )
                    err_evt = {
                        "type": "workflow:task_error",
                        "phase": phase_type,
                        "task_id": task["id"],
                        "task_title": task_title,
                        "error": err_msg,
                    }
                    yield err_evt
                    await self._broadcast(workspace_id, err_evt)
                else:
                    tasks_succeeded += 1
                    result_summary = str(result)[:200]
                    await self.ws_gw.publish_log(
                        workspace_id, "pm",
                        f"Task completed: {result_summary}",
                        level="success",
                        task_id=task["id"],
                    )
                    task_done_evt = {
                        "type": "workflow:task_complete",
                        "phase": phase_type,
                        "task_id": task["id"],
                        "task_title": task_title,
                        "result_summary": result_summary,
                    }
                    yield task_done_evt
                    await self._broadcast(workspace_id, task_done_evt)

                    try:
                        await self.ws_client.complete_task(workspace_id, task["id"])
                    except Exception:
                        pass

                    full_result = str(result)
                    if len(full_result) > 100:
                        asyncio.create_task(
                            _auto_index_to_rag(
                                workspace_id,
                                f"[{phase_type}] {task_title}",
                                full_result,
                            )
                        )

            except Exception as exc:
                tasks_failed += 1
                err_evt = {
                    "type": "workflow:task_error",
                    "phase": phase_type,
                    "task_id": task["id"],
                    "task_title": task_title,
                    "error": str(exc),
                }
                yield err_evt
                await self._broadcast(workspace_id, err_evt)

        final_status = PhaseStatus.COMPLETED if tasks_failed == 0 else PhaseStatus.IN_PROGRESS
        try:
            await self.ws_client.update_phase(
                workspace_id, phase_id, status=final_status,
            )
        except Exception:
            pass

        phase_done_evt = {
            "type": "workflow:phase_complete",
            "phase": phase_type,
            "tasks_executed": tasks_succeeded,
            "tasks_total": len(pending),
            "tasks_failed": tasks_failed,
        }
        yield phase_done_evt
        await self._broadcast(workspace_id, phase_done_evt)

        if tasks_failed:
            await self.ws_gw.publish_log(
                workspace_id, "pm",
                f"Phase {phase_type} finished: {tasks_succeeded} succeeded, {tasks_failed} failed",
                level="error" if tasks_succeeded == 0 else "warn",
            )
        else:
            await self.ws_gw.publish_log(
                workspace_id, "pm",
                f"Phase {phase_type} complete: {tasks_succeeded} tasks executed",
                level="success",
            )
            asyncio.create_task(_trigger_distill(workspace_id))
            asyncio.create_task(
                _store_org_memory(
                    workspace_id,
                    f"Phase '{phase_type}' completed with {tasks_succeeded} tasks "
                    f"in workspace {workspace_id}.",
                )
            )

    async def run_project(
        self,
        workspace_id: str,
        user_message: str = "",
        *,
        start_phase: str | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Execute the full project lifecycle end-to-end."""
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

        has_error = False
        for phase_type in PHASE_ORDER[start_idx:]:
            failed_task_id: str | None = None
            async for event in self.run_phase(workspace_id, phase_type, user_message):
                yield event

                if event.get("type") == "workflow:task_error":
                    failed_task_id = event.get("task_id")
                    proj_err_evt = {
                        "type": "workflow:project_error",
                        "phase": phase_type,
                        "error": event.get("error", "unknown"),
                        "task_id": failed_task_id,
                    }
                    yield proj_err_evt
                    await self._broadcast(workspace_id, proj_err_evt)
                    has_error = True
                    break
            if has_error:
                await self._recover_after_project_error(
                    workspace_id, phase_type, failed_task_id,
                )
                break

        proj_done_evt = {
            "type": "workflow:project_complete",
            "workspace_id": workspace_id,
            "success": not has_error,
        }
        yield proj_done_evt
        await self._broadcast(workspace_id, proj_done_evt)

        await self.ws_gw.publish_agent_status(
            workspace_id, AgentType.PM, AgentStatus.IDLE,
        )

        await self.ws_gw.publish_log(
            workspace_id, "pm",
            "Full project lifecycle complete" if not has_error else "Project stopped due to errors",
            level="success" if not has_error else "error",
        )
