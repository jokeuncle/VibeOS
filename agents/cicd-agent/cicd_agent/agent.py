"""CI/CD Agent implementation."""

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
You are an expert DevOps and CI/CD engineer. You help teams build reliable, \
automated build-test-deploy pipelines and production infrastructure.

Your responsibilities:
- Design CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins, etc.)
- Define deployment strategies (blue-green, canary, rolling)
- Design infrastructure (containers, Kubernetes, cloud services)
- Configure monitoring, logging, and alerting for deployments

When responding, structure your output as JSON with the following shape:
{
  "summary": "brief summary",
  "pipeline_config": {
    "platform": "...",
    "stages": [{"name": "...", "steps": ["..."]}],
    "triggers": ["..."]
  },
  "deployment_strategy": {
    "type": "blue-green|canary|rolling",
    "config": {}
  },
  "infrastructure": [
    {"type": "container|k8s|cloud", "config": "..."}
  ],
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}
Prefer automation, reproducibility, and security best practices.\
"""

CHAT_PROMPT = """\
You are an expert DevOps/CI/CD engineer having a conversation. Respond in clear, \
well-structured natural language (use markdown formatting when helpful). \
Discuss pipeline designs, deployment strategies, and infrastructure choices. \
Do NOT respond with raw JSON—use prose, bullet points, YAML/config blocks, \
and diagrams.\
"""


def _lang_for(infra_type: str) -> str:
    return {
        "container": "dockerfile",
        "k8s": "yaml",
        "cloud": "hcl",
    }.get(infra_type, "yaml")


class CicdAgent(BaseAgent):
    agent_type = AgentType.CICD
    system_prompt = SYSTEM_PROMPT
    chat_prompt = CHAT_PROMPT
    capabilities = [
        CapabilityContract(
            name="cicd",
            required_context_window=16_000,
        ),
    ]

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.gitlab_tools import create_gitlab_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        from vibeos_agent.tools.pipeline_tools import create_pipeline_tools
        self.tool_registry.register_many(create_workspace_tools(self.workspace_svc, "cicd"))
        self.tool_registry.register_many(create_gitlab_tools())
        self.tool_registry.register_many(create_delegation_tools("cicd"))
        self.tool_registry.register_many(create_pipeline_tools())

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

            repo_context = {k: v for k, v in (task.context or {}).items() if k.startswith("gitlab_")}

            await _log(task.workspace_id, agent_name, "Calling LLM for CI/CD pipeline design (tool-use mode)…", task_id=task.task_id)
            raw_reply = await self._call_llm_with_tools(
                prompt,
                workspace_id=task.workspace_id,
                repo_context=repo_context or None,
            )
            await _log(task.workspace_id, agent_name, "LLM response received. Parsing structured output…", level="success", task_id=task.task_id)

            structured = self._extract_json(raw_reply)

            # Save deployment output as artifact
            try:
                await self._save_artifact(
                    task.workspace_id,
                    artifact_type="deployment_config",
                    title=f"Deployment: {task.description[:80]}",
                    content=raw_reply,
                )
                await _log(task.workspace_id, agent_name, "Deployment config saved as artifact", level="success", task_id=task.task_id)
            except Exception as exc:
                await _log(task.workspace_id, agent_name, f"Failed to save artifact: {exc}", level="error", task_id=task.task_id)

            rich_blocks: list[RichBlock] = []

            if structured.get("pipeline_config"):
                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language="yaml",
                        content=json.dumps(structured["pipeline_config"], indent=2),
                        metadata={"title": "Pipeline Configuration"},
                    )
                )

            for infra in structured.get("infrastructure", []):
                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language=_lang_for(infra.get("type", "")),
                        content=infra.get("config", ""),
                        metadata={"title": f"Infrastructure – {infra.get('type', 'unknown')}"},
                    )
                )

            yield self._make_event(
                "progress", task.workspace_id, {"progress": 0.5, "detail": "Creating tasks"}
            )

            phase_id = await self.workspace_svc.find_phase_by_type(
                task.workspace_id, "deployment"
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
                    "pipeline_config": structured.get("pipeline_config", {}),
                    "deployment_strategy": structured.get("deployment_strategy", {}),
                    "infrastructure": structured.get("infrastructure", []),
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
