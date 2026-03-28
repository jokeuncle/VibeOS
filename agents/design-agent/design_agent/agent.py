"""Design Agent implementation."""

from __future__ import annotations

import json
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

from vibeos_agent import (
    AgentEvent,
    AgentStatus,
    AgentTask,
    BaseAgent,
    CapabilityContract,
    Message,
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

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "design_component",
            "description": "Design a UI component with layout, states, and interactions",
            "parameters": {
                "type": "object",
                "properties": {
                    "component_name": {"type": "string"},
                    "requirements": {"type": "string"},
                    "platform": {
                        "type": "string",
                        "enum": ["web", "mobile", "desktop"],
                    },
                },
                "required": ["component_name", "requirements"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_wireframe",
            "description": "Create a text-based wireframe description for a screen or page",
            "parameters": {
                "type": "object",
                "properties": {
                    "screen_name": {"type": "string"},
                    "user_flow": {"type": "string"},
                },
                "required": ["screen_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "define_style_guide",
            "description": "Define a style guide covering colors, typography, spacing, and branding",
            "parameters": {
                "type": "object",
                "properties": {
                    "brand_description": {"type": "string"},
                    "target_audience": {"type": "string"},
                },
                "required": ["brand_description"],
            },
        },
    },
]


class DesignAgent(BaseAgent):
    agent_type = "design"
    system_prompt = SYSTEM_PROMPT
    tools = TOOLS
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

            await _log(task.workspace_id, agent_name, "Calling LLM for design analysis…", task_id=task.task_id)
            raw_reply = await self._call_llm(prompt, workspace_id=task.workspace_id)
            await _log(task.workspace_id, agent_name, "LLM response received. Parsing structured output…", level="success", task_id=task.task_id)

            try:
                structured = json.loads(raw_reply)
            except json.JSONDecodeError:
                structured = {"summary": raw_reply, "design_decisions": [], "wireframes": [], "tasks": []}

            # Save design spec as artifact
            try:
                design_phase_id = await self.workspace_svc.find_phase_by_type(task.workspace_id, "design")
                await self._save_artifact(
                    task.workspace_id,
                    artifact_type="design_spec",
                    title=f"Design: {task.description[:80]}",
                    content=raw_reply,
                    phase_id=design_phase_id,
                    task_id=task.task_id,
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

    async def chat(
        self, message: str, *, workspace_id: str, context: dict[str, Any] | None = None
    ) -> AsyncIterator[Message]:
        user_msg = Message(
            id=uuid.uuid4().hex,
            workspace_id=workspace_id,
            agent_type=self.agent_type,
            role="user",
            content=message,
            timestamp=datetime.now(timezone.utc),
        )
        await self.session.append(workspace_id, self.agent_type, user_msg)

        try:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.RUNNING
            )

            reply_text = await self._call_llm(message, workspace_id=workspace_id)

            reply_msg = self._make_message(workspace_id, reply_text)
            await self.session.append(workspace_id, self.agent_type, reply_msg)

            yield reply_msg
        except Exception:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.ERROR, detail="Chat failed"
            )
            raise
        finally:
            try:
                await self.ws.publish_agent_status(
                    workspace_id, self.agent_type, AgentStatus.IDLE
                )
            except Exception:
                pass

    async def chat_stream(
        self, message: str, *, workspace_id: str, context: dict[str, Any] | None = None
    ) -> AsyncIterator[str]:
        """Stream chat response token-by-token."""
        user_msg = Message(
            id=uuid.uuid4().hex,
            workspace_id=workspace_id,
            agent_type=self.agent_type,
            role="user",
            content=message,
            timestamp=datetime.now(timezone.utc),
        )
        await self.session.append(workspace_id, self.agent_type, user_msg)

        try:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.RUNNING
            )

            full_reply = ""
            async for delta in self._call_llm_stream(
                message,
                workspace_id=workspace_id,
                system_prompt_override=CHAT_PROMPT,
            ):
                full_reply += delta
                yield delta

            reply_msg = self._make_message(workspace_id, full_reply)
            await self.session.append(workspace_id, self.agent_type, reply_msg)
        except Exception:
            await self.ws.publish_agent_status(
                workspace_id, self.agent_type, AgentStatus.ERROR, detail="Chat stream failed"
            )
            raise
        finally:
            try:
                await self.ws.publish_agent_status(
                    workspace_id, self.agent_type, AgentStatus.IDLE
                )
            except Exception:
                pass
