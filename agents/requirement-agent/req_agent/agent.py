"""Requirement Agent implementation."""

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
    AgentType,
    BaseAgent,
    CapabilityContract,
    Message,
    RichBlock,
    Task,
)

SYSTEM_PROMPT = """\
You are an expert requirements analyst. You help teams capture, refine, and \
structure project requirements with precision and clarity.

Your responsibilities:
- Analyze raw requirements and extract actionable user stories
- Define clear acceptance criteria for each requirement
- Identify constraints (technical, business, regulatory)
- Detect gaps and ambiguities in requirements

When responding, structure your output as JSON with the following shape:
{
  "summary": "brief summary",
  "user_stories": [
    {"role": "...", "action": "...", "benefit": "...", "priority": "high|medium|low"}
  ],
  "acceptance_criteria": [
    {"story_ref": "...", "given": "...", "when": "...", "then": "..."}
  ],
  "constraints": [
    {"type": "technical|business|regulatory", "description": "..."}
  ],
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}
Always be thorough, precise, and flag any ambiguities.\
"""

CHAT_PROMPT = """\
You are an expert requirements analyst having a conversation. Respond in clear, \
well-structured natural language (use markdown formatting when helpful). \
Help the user refine requirements, write user stories, and define acceptance criteria. \
Do NOT respond with raw JSON—use prose, bullet points, and tables.\
"""

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "analyze_requirements",
            "description": "Analyze raw requirements text and extract structured user stories and constraints",
            "parameters": {
                "type": "object",
                "properties": {
                    "requirements_text": {"type": "string"},
                    "domain": {"type": "string"},
                },
                "required": ["requirements_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "generate_user_stories",
            "description": "Generate user stories from a feature description",
            "parameters": {
                "type": "object",
                "properties": {
                    "feature_description": {"type": "string"},
                    "target_users": {"type": "string"},
                },
                "required": ["feature_description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_acceptance_criteria",
            "description": "Create acceptance criteria for a given user story",
            "parameters": {
                "type": "object",
                "properties": {
                    "user_story": {"type": "string"},
                    "context": {"type": "string"},
                },
                "required": ["user_story"],
            },
        },
    },
]


class RequirementAgent(BaseAgent):
    agent_type = AgentType.REQUIREMENT
    system_prompt = SYSTEM_PROMPT
    tools = TOOLS

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        self.tool_registry.register_many(create_workspace_tools(self.workspace_svc, "requirement"))
        self.tool_registry.register_many(create_delegation_tools("requirement"))

    capabilities = [
        CapabilityContract(
            name="requirements",
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

            await _log(task.workspace_id, agent_name, "Calling LLM for requirements analysis…", task_id=task.task_id)
            raw_reply = await self._call_llm_with_tools(prompt, workspace_id=task.workspace_id)
            await _log(task.workspace_id, agent_name, "LLM response received. Parsing structured output…", level="success", task_id=task.task_id)

            try:
                structured = json.loads(raw_reply)
            except json.JSONDecodeError:
                structured = {"summary": raw_reply, "user_stories": [], "acceptance_criteria": [], "constraints": [], "tasks": []}

            # Save requirements spec as artifact
            try:
                req_phase_id = await self.workspace_svc.find_phase_by_type(task.workspace_id, "requirement")
                await self._save_artifact(
                    task.workspace_id,
                    artifact_type="requirements_spec",
                    title=f"Requirements: {task.description[:80]}",
                    content=raw_reply,
                    phase_id=req_phase_id,
                    task_id=task.task_id,
                )
                await _log(task.workspace_id, agent_name, "Requirements spec saved as artifact", level="success", task_id=task.task_id)
            except Exception as exc:
                await _log(task.workspace_id, agent_name, f"Failed to save artifact: {exc}", level="error", task_id=task.task_id)

            rich_blocks: list[RichBlock] = []
            for story in structured.get("user_stories", []):
                role = story.get("role", "user")
                action = story.get("action", "")
                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language="markdown",
                        content=f"As a {role}, I want to {action}",
                        metadata={"title": f"User Story – {role}", "priority": story.get("priority", "medium")},
                    )
                )

            yield self._make_event(
                "progress", task.workspace_id, {"progress": 0.5, "detail": "Creating tasks"}
            )

            phase_id = await self.workspace_svc.find_phase_by_type(
                task.workspace_id, "requirement"
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
                    "user_stories": structured.get("user_stories", []),
                    "acceptance_criteria": structured.get("acceptance_criteria", []),
                    "constraints": structured.get("constraints", []),
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
