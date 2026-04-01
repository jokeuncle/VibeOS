"""Architecture Agent implementation."""

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
You are an expert software architect. You help teams design robust, scalable systems.

Your responsibilities:
- Design system architectures (microservices, monoliths, event-driven, etc.)
- Design database schemas (relational, document, graph)
- Design REST / GraphQL / gRPC APIs
- Evaluate and recommend technology stacks
- Produce architecture decision records (ADRs)

When responding, structure your output as JSON with the following shape:
{
  "summary": "brief summary",
  "artifacts": [
    {"type": "schema" | "api" | "diagram" | "adr", "title": "...", "content": "..."}
  ],
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}
Always be specific and opinionated. Justify trade-offs.\
"""

CHAT_PROMPT = """\
You are an expert software architect having a conversation. Respond in clear, \
well-structured natural language (use markdown formatting when helpful). \
Be specific, opinionated, and justify trade-offs. \
Do NOT respond with raw JSON—use prose, bullet points, code blocks, and headings.\
"""


class ArchitectureAgent(BaseAgent):
    agent_type = AgentType.ARCHITECTURE
    system_prompt = SYSTEM_PROMPT
    chat_prompt = CHAT_PROMPT

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        self.tool_registry.register_many(create_workspace_tools(self.workspace_svc, "architecture"))
        self.tool_registry.register_many(create_delegation_tools("architecture"))

    capabilities = [
        CapabilityContract(
            name="architecture",
            required_context_window=16_000,
            supports_tool_use=True,
        ),
    ]

    async def execute(self, task: AgentTask) -> AsyncIterator[AgentEvent]:
        yield self._make_event("status", task.workspace_id, {"status": AgentStatus.RUNNING})
        _log = self.ws.publish_log
        agent_name = self.agent_type.value

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

            await _log(task.workspace_id, agent_name, "Calling LLM for architecture analysis…", task_id=task.task_id)
            raw_reply = await self._call_llm_with_tools(prompt, workspace_id=task.workspace_id)
            await _log(task.workspace_id, agent_name, "LLM response received. Parsing structured output…", level="success", task_id=task.task_id)

            structured = self._extract_json(raw_reply)

            rich_blocks: list[RichBlock] = []
            for artifact in structured.get("artifacts", []):
                art_title = artifact.get("title", "untitled")
                art_type = artifact.get("type", "unknown")
                art_content = artifact.get("content", "")
                await _log(
                    task.workspace_id, agent_name,
                    f"Generated artifact: {art_title} ({art_type})",
                    task_id=task.task_id,
                )

                try:
                    await self._save_artifact(
                        task.workspace_id,
                        artifact_type=art_type,
                        title=art_title,
                        content=art_content,
                    )
                    await _log(task.workspace_id, agent_name, f"Artifact saved: {art_title}", level="success", task_id=task.task_id)
                except Exception as exc:
                    await _log(task.workspace_id, agent_name, f"Failed to save artifact: {exc}", level="error", task_id=task.task_id)

                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language=_lang_for(art_type),
                        content=art_content,
                        metadata={"title": art_title},
                    )
                )

            yield self._make_event(
                "progress", task.workspace_id, {"progress": 0.5, "detail": "Creating tasks"}
            )

            arch_phase_id = await self.workspace_svc.find_phase_by_type(
                task.workspace_id, "architecture"
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
                        task.workspace_id, new_task, phase_id=arch_phase_id
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
                    "artifacts": structured.get("artifacts", []),
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


def _lang_for(artifact_type: str) -> str:
    return {
        "schema": "sql",
        "api": "yaml",
        "diagram": "mermaid",
        "adr": "markdown",
    }.get(artifact_type, "text")
