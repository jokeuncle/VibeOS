"""Monitoring Agent implementation."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

from vibeos_agent import (
    AgentEvent,
    AgentStatus,
    AgentTask,
    AgentType,
    BaseAgent,
    CapabilityContract,
    RichBlock,
    Task,
)

SYSTEM_PROMPT = """\
You are an expert SRE and monitoring engineer. You help teams build robust \
observability stacks and incident-response playbooks.

Your responsibilities:
- Design monitoring plans (metrics, logs, traces)
- Create alert rules with conditions and severity levels
- Design dashboards for operational visibility
- Write runbooks for incident response

When responding, structure your output as JSON with the following shape:
{
  "summary": "brief summary",
  "monitoring_plan": {
    "metrics": ["..."],
    "logs": ["..."],
    "traces": ["..."],
    "tools": ["..."]
  },
  "alerts": [
    {"name": "...", "condition": "...", "severity": "critical|warning|info"}
  ],
  "dashboards": [
    {"name": "...", "panels": ["..."]}
  ],
  "runbooks": [
    {"title": "...", "trigger": "...", "steps": ["..."]}
  ],
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}
Prioritize actionable alerts, low MTTR, and avoiding alert fatigue.\
"""

CHAT_PROMPT = """\
You are an expert SRE and observability engineer having a conversation. \
Respond in clear, well-structured natural language (use markdown formatting \
when helpful). Discuss monitoring strategies, alert design, dashboard layouts, \
and incident response. Do NOT respond with raw JSON—use prose, bullet points, \
tables, and config examples.\
"""


class MonitoringAgent(BaseAgent):
    agent_type = AgentType.MONITORING
    system_prompt = SYSTEM_PROMPT
    chat_prompt = CHAT_PROMPT
    capabilities = [
        CapabilityContract(
            name="monitoring",
            required_context_window=16_000,
        ),
    ]

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        self.tool_registry.register_many(create_workspace_tools(self.workspace_svc, "monitoring"))
        self.tool_registry.register_many(create_delegation_tools("monitoring"))

    async def execute(self, task: AgentTask) -> AsyncIterator[AgentEvent]:
        yield self._make_event("status", task.workspace_id, {"status": AgentStatus.RUNNING})
        _log = self.ws.publish_log
        agent_name = self.agent_type

        try:
            await self.ws.publish_agent_status(
                task.workspace_id, self.agent_type, AgentStatus.RUNNING, detail=task.intent
            )
            await _log(task.workspace_id, agent_name, f"Starting task: {task.intent}", task_id=task.task_id)

            user_msg = task.user_message or task.description
            prompt = (
                f"Task: {task.intent}\n"
                f"Description: {task.description}\n"
                f"User request: {user_msg}\n"
                f"Context: {json.dumps(task.context)}"
            )

            self._current_task_context = task.context

            await _log(task.workspace_id, agent_name, "Calling LLM for monitoring design…", task_id=task.task_id)
            raw_reply = await self._call_llm_with_tools(prompt, workspace_id=task.workspace_id)
            await _log(task.workspace_id, agent_name, "LLM response received. Parsing structured output…", level="success", task_id=task.task_id)

            structured = self._extract_json(raw_reply)

            # Save monitoring output as artifact
            try:
                await self._save_artifact(
                    task.workspace_id,
                    artifact_type="monitoring_config",
                    title=f"Monitoring: {task.description[:80]}",
                    content=raw_reply,
                )
                await _log(task.workspace_id, agent_name, "Monitoring config saved as artifact", level="success", task_id=task.task_id)
            except Exception as exc:
                await _log(task.workspace_id, agent_name, f"Failed to save artifact: {exc}", level="error", task_id=task.task_id)

            rich_blocks: list[RichBlock] = []

            for alert in structured.get("alerts", []):
                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language="yaml",
                        content=f"alert: {alert.get('name', 'untitled')}\ncondition: {alert.get('condition', '')}\nseverity: {alert.get('severity', 'warning')}",
                        metadata={"title": f"Alert – {alert.get('name', 'untitled')}"},
                    )
                )

            for runbook in structured.get("runbooks", []):
                steps = "\n".join(f"  {i+1}. {s}" for i, s in enumerate(runbook.get("steps", [])))
                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language="markdown",
                        content=f"# {runbook.get('title', 'Runbook')}\n\n**Trigger:** {runbook.get('trigger', 'N/A')}\n\n## Steps\n{steps}",
                        metadata={"title": runbook.get("title", "Runbook")},
                    )
                )

            yield self._make_event(
                "progress", task.workspace_id, {"progress": 0.5, "detail": "Creating tasks"}
            )

            phase_id = await self.workspace_svc.find_phase_by_type(
                task.workspace_id, "monitoring"
            )

            created_tasks: list[dict[str, Any]] = []
            task_list = structured.get("tasks", [])
            if task_list:
                await _log(task.workspace_id, agent_name, f"Creating {len(task_list)} tasks in workspace…", task_id=task.task_id)

            for t in task_list:
                title = t.get("title", "Untitled")
                new_task = Task(title=title, description=t.get("description", ""))
                try:
                    result = await self.workspace_svc.create_task(
                        task.workspace_id, new_task, phase_id=phase_id
                    )
                    created_tasks.append(result)
                    await _log(task.workspace_id, agent_name, f"Task created: {title}", level="success", task_id=task.task_id)
                    rich_blocks.append(
                        RichBlock(
                            type="task_card",
                            content=title,
                            metadata={"task": result},
                        )
                    )
                except Exception as exc:
                    await _log(task.workspace_id, agent_name, f"Failed to create task '{title}': {exc}", level="error", task_id=task.task_id)
                    rich_blocks.append(
                        RichBlock(
                            type="task_card",
                            content=title,
                            metadata={"description": t.get("description", "")},
                        )
                    )

            msg = self._make_message(
                task.workspace_id,
                structured.get("summary", raw_reply),
                rich_blocks=rich_blocks,
            )
            await self.session.append(task.workspace_id, self.agent_type, msg)
            await self.ws.publish_message(task.workspace_id, msg)

            await _log(task.workspace_id, agent_name, f"Execution complete. {len(created_tasks)} tasks created.", level="success", task_id=task.task_id)

            yield self._make_event(
                "result",
                task.workspace_id,
                {
                    "summary": structured.get("summary", ""),
                    "monitoring_plan": structured.get("monitoring_plan", {}),
                    "alerts": structured.get("alerts", []),
                    "dashboards": structured.get("dashboards", []),
                    "runbooks": structured.get("runbooks", []),
                    "created_tasks": created_tasks,
                },
            )
        except Exception as exc:
            try:
                await _log(task.workspace_id, agent_name, f"Execution failed: {exc}", level="error", task_id=task.task_id)
            except Exception:
                pass
            yield self._make_event("error", task.workspace_id, {"error": "execute failed"})
            raise
        finally:
            try:
                await self.ws.publish_agent_status(
                    task.workspace_id, self.agent_type, AgentStatus.IDLE
                )
            except Exception:
                pass
