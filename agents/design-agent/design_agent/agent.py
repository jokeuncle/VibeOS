"""Design Agent implementation."""

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
You are an expert UI/UX designer. You help teams create beautiful, usable, and \
accessible interfaces with strong design systems.

Your responsibilities:
- Make design decisions (layout, navigation, interaction patterns)
- Create wireframes (text-based descriptions of screen layouts)
- Define component hierarchies and reusable UI patterns
- Produce style guides (colors, typography, spacing, iconography)

When responding, structure your output as JSON with the following shape:
{
  "summary": "brief summary",
  "design_decisions": [
    {"area": "...", "decision": "...", "rationale": "..."}
  ],
  "wireframes": [
    {"screen": "...", "layout_description": "...", "components": ["..."]}
  ],
  "component_hierarchy": {
    "root": "...",
    "children": [{"name": "...", "children": []}]
  },
  "style_guide": {
    "colors": {"primary": "...", "secondary": "..."},
    "typography": {"heading": "...", "body": "..."},
    "spacing": "..."
  },
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}
Always prioritize usability, accessibility, and visual consistency.\
"""

CHAT_PROMPT = """\
You are an expert UI/UX designer having a conversation. Respond in clear, \
well-structured natural language (use markdown formatting when helpful). \
Discuss design decisions, suggest patterns, describe layouts, and provide \
design guidance. Do NOT respond with raw JSON—use prose, bullet points, \
and diagrams described in text.\
"""


class DesignAgent(BaseAgent):
    agent_type = AgentType.DESIGN
    system_prompt = SYSTEM_PROMPT
    chat_prompt = CHAT_PROMPT

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        self.tool_registry.register_many(create_workspace_tools(self.workspace_svc, "design"))
        self.tool_registry.register_many(create_delegation_tools("design"))

    capabilities = [
        CapabilityContract(
            name="design",
            required_context_window=16_000,
        ),
    ]

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

            await _log(task.workspace_id, agent_name, "Calling LLM for design analysis…", task_id=task.task_id)
            raw_reply = await self._call_llm_with_tools(prompt, workspace_id=task.workspace_id)
            await _log(task.workspace_id, agent_name, "LLM response received. Parsing structured output…", level="success", task_id=task.task_id)

            structured = self._extract_json(raw_reply)

            # Save design spec as artifact
            try:
                await self._save_artifact(
                    task.workspace_id,
                    artifact_type="design_spec",
                    title=f"Design: {task.description[:80]}",
                    content=raw_reply,
                )
                await _log(task.workspace_id, agent_name, "Design spec saved as artifact", level="success", task_id=task.task_id)
            except Exception as exc:
                await _log(task.workspace_id, agent_name, f"Failed to save artifact: {exc}", level="error", task_id=task.task_id)

            rich_blocks: list[RichBlock] = []
            for wf in structured.get("wireframes", []):
                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language="markdown",
                        content=wf.get("layout_description", ""),
                        metadata={"title": f"Wireframe – {wf.get('screen', 'untitled')}"},
                    )
                )

            if structured.get("style_guide"):
                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language="json",
                        content=json.dumps(structured["style_guide"], indent=2),
                        metadata={"title": "Style Guide"},
                    )
                )

            yield self._make_event(
                "progress", task.workspace_id, {"progress": 0.5, "detail": "Creating tasks"}
            )

            phase_id = await self.workspace_svc.find_phase_by_type(
                task.workspace_id, "design"
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
                    "design_decisions": structured.get("design_decisions", []),
                    "wireframes": structured.get("wireframes", []),
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
