"""SDLCAgent -- declarative base for standard SDLC domain agents.

Extracts the common execute() skeleton shared across requirement, architecture,
design, development, testing, CICD, and monitoring agents into a configurable
base class.  Subclasses provide ``artifact_configs`` and ``phase_key`` to
control how LLM output is parsed, persisted, and surfaced.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from typing import Any

from .base_agent import BaseAgent
from .phases import PHASE_TOOL_HINTS
from .clients._utils import _enum_val
from .models import (
    AgentEvent,
    AgentStatus,
    AgentTask,
    RichBlock,
    Task,
)

logger = logging.getLogger(__name__)


@dataclass
class ArtifactConfig:
    """Describes one artifact type this agent may produce."""

    type: str
    parse_path: str = ""
    language: str = "text"
    title_key: str = "title"
    content_key: str = "content"


class SDLCAgent(BaseAgent):
    """Standard SDLC agent with declarative task execution.

    Subclasses set ``phase_key``, ``artifact_configs``, and optionally
    override ``_build_execute_prompt`` or ``_post_process`` for domain logic.
    """

    phase_key: str = ""
    artifact_configs: list[ArtifactConfig] = []

    async def execute(self, task: AgentTask) -> AsyncGenerator[AgentEvent, None]:
        yield self._make_event("status", task.workspace_id, {"status": AgentStatus.RUNNING})
        agent_name = _enum_val(self.agent_type)
        _log = self.ws.publish_log

        try:
            await self.ws.publish_agent_status(
                task.workspace_id, self.agent_type, AgentStatus.RUNNING, detail=task.intent
            )
            await _log(task.workspace_id, agent_name, f"Starting task: {task.intent}", task_id=task.task_id)

            prompt = self._build_execute_prompt(task)
            self._current_task_context = task.context
            self._set_current_task(task)

            repo_context = await self._resolve_repo_context(task)

            system_prompt = getattr(self, "_task_system_override", None) or self.system_prompt
            if hasattr(self, "_task_system_override"):
                del self._task_system_override

            await _log(task.workspace_id, agent_name, "Calling LLM (tool-use enabled)...", task_id=task.task_id)
            raw_reply = await self._run_pipeline(
                workspace_id=task.workspace_id,
                user_message=prompt,
                task_context=task.context,
                repo_context=repo_context,
                system_prompt=system_prompt,
                model=task.preferred_model,
            )
            await _log(task.workspace_id, agent_name, "LLM response received.", level="success", task_id=task.task_id)

            structured = self._extract_json(raw_reply)

            rich_blocks: list[RichBlock] = []
            self._collect_tool_rich_blocks(rich_blocks)

            yield self._make_event("progress", task.workspace_id, {"progress": 0.5, "detail": "Creating tasks"})

            created_tasks = await self._create_phase_tasks(task, structured, rich_blocks, agent_name)

            await self._post_process(task, structured, rich_blocks)

            msg = self._make_message(
                task.workspace_id,
                structured.get("summary", raw_reply[:500]),
                rich_blocks=rich_blocks,
            )
            await self.session.append(task.workspace_id, self.agent_type, msg)
            await self.ws.publish_message(task.workspace_id, msg)

            tool_artifact_count = sum(
                1 for r in self._tool_results
                if r.get("ok") and r.get("tool") == "workspace_create_artifact"
            )

            if tool_artifact_count == 0 and raw_reply and len(raw_reply) > 200:
                await _log(
                    task.workspace_id, agent_name,
                    "WARNING: LLM did not call workspace_create_artifact. No deliverables were persisted.",
                    level="warn", task_id=task.task_id,
                )

            await _log(
                task.workspace_id, agent_name,
                f"Execution complete. {tool_artifact_count} artifacts saved, {len(created_tasks)} tasks created.",
                level="success", task_id=task.task_id,
            )

            await self._report_trust_outcome(task, success=True)

            yield self._make_event("result", task.workspace_id, {
                "summary": structured.get("summary", ""),
                "artifacts": structured.get("artifacts", []),
                "created_tasks": created_tasks,
            })
        except Exception as exc:
            await self._report_trust_outcome(task, success=False)
            err_detail = str(exc) or f"{type(exc).__name__} (no message)"
            try:
                await _log(task.workspace_id, agent_name, f"Execution failed: {err_detail}", level="error", task_id=task.task_id)
            except Exception:
                pass
            yield self._make_event("error", task.workspace_id, {"error": err_detail})
            raise
        finally:
            try:
                await self.ws.publish_agent_status(task.workspace_id, self.agent_type, AgentStatus.IDLE)
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Overridable hooks
    # ------------------------------------------------------------------

    def _build_execute_prompt(self, task: AgentTask) -> str:
        user_msg = task.user_message or task.description
        phase_key = self.phase_key or _enum_val(self.agent_type)
        hints = PHASE_TOOL_HINTS.get(phase_key, [])

        parts = [
            f"Task: {task.intent}",
            f"Description: {task.description}",
            f"User request: {user_msg}",
            f"Context: {json.dumps(task.context)}",
        ]
        if hints:
            parts.append(
                "\n## Recommended tools for this phase\n"
                + ", ".join(f"`{h}`" for h in hints)
                + "\nAll other registered tools are also available if needed."
            )
        return "\n".join(parts)

    async def _resolve_repo_context(self, task: AgentTask) -> dict[str, Any] | None:
        """Override to provide repo context (dev/cicd agents)."""
        return None

    async def _post_process(
        self,
        task: AgentTask,
        structured: dict[str, Any],
        rich_blocks: list[RichBlock],
    ) -> None:
        """Hook for domain-specific post-processing after artifacts and tasks."""
        pass

    # ------------------------------------------------------------------
    # Trust / governance
    # ------------------------------------------------------------------

    async def _report_trust_outcome(self, task: AgentTask, *, success: bool) -> None:
        """Report execution outcome to llm-gateway trust score system.

        If the returned score drops below the agent's trust_threshold, a
        ``trust:degraded`` WS event is broadcast so the frontend can alert
        the user.
        """
        agent_name = _enum_val(self.agent_type)
        model = task.preferred_model or "default"
        try:
            result = await self.llm.report_trust_outcome(model, agent_name, success=success)
            score = result.get("score", 100) if isinstance(result, dict) else 100
            threshold = getattr(task, "trust_threshold", None) or 50.0
            if score < threshold:
                await self.ws.publish({
                    "type": "trust:degraded",
                    "workspaceId": task.workspace_id,
                    "payload": {
                        "agent_type": agent_name,
                        "model": model,
                        "score": score,
                        "threshold": threshold,
                        "suggestion": "Consider switching model or enabling approval",
                    },
                })
        except Exception:
            logger.debug("Failed to report trust outcome for %s", agent_name, exc_info=True)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _collect_tool_rich_blocks(self, rich_blocks: list[RichBlock]) -> None:
        """Build rich blocks from tool call results (artifact saves, gitlab pushes, etc.)."""
        for r in self._tool_results:
            if not r.get("ok"):
                continue
            tool = r.get("tool", "")
            if tool == "workspace_create_artifact":
                try:
                    data = json.loads(r.get("result", "{}"))
                    title = data.get("title", "artifact")
                    art_type = data.get("type", "unknown")
                    lang_map = {
                        cfg.type: cfg.language for cfg in self.artifact_configs
                    } if self.artifact_configs else {}
                    lang = lang_map.get(art_type, "text")
                    rich_blocks.append(RichBlock(
                        type="code", language=lang,
                        content=f"[Artifact saved] {title} ({art_type})",
                        metadata={"title": title, "fileUrl": data.get("fileUrl")},
                    ))
                except Exception:
                    pass
            elif tool == "gitlab_push_file":
                try:
                    data = json.loads(r.get("result", "{}"))
                    rich_blocks.append(RichBlock(
                        type="code", language="text",
                        content=f"[Pushed] {data.get('file_path', '?')}",
                        metadata=data,
                    ))
                except Exception:
                    pass

    async def _create_phase_tasks(
        self,
        task: AgentTask,
        structured: dict[str, Any],
        rich_blocks: list[RichBlock],
        agent_name: str,
    ) -> list[dict[str, Any]]:
        _log = self.ws.publish_log
        phase_key = self.phase_key or _enum_val(self.agent_type)
        phase_id = await self.workspace_svc.find_phase_by_type(task.workspace_id, phase_key)

        created: list[dict[str, Any]] = []
        task_list = structured.get("tasks", [])
        if task_list:
            await _log(task.workspace_id, agent_name, f"Creating {len(task_list)} tasks...", task_id=task.task_id)

        for t in task_list:
            title = t.get("title", "Untitled")
            new_task = Task(title=title, description=t.get("description", ""))
            try:
                result = await self.workspace_svc.create_task(task.workspace_id, new_task, phase_id=phase_id)
                created.append(result)
                await _log(task.workspace_id, agent_name, f"Task created: {title}", level="success", task_id=task.task_id)
                rich_blocks.append(RichBlock(type="task_card", content=title, metadata={"task": result}))
            except Exception as exc:
                await _log(task.workspace_id, agent_name, f"Failed to create task: {exc}", level="error", task_id=task.task_id)
                rich_blocks.append(RichBlock(type="task_card", content=title, metadata={"description": t.get("description", "")}))
        return created
