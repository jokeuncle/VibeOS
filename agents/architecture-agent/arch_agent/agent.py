"""Architecture Agent implementation."""

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
    PhaseStatus,
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

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "generate_schema",
            "description": "Generate a database schema definition (SQL DDL or document model)",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "db_type": {
                        "type": "string",
                        "enum": ["postgresql", "mongodb", "mysql", "sqlite"],
                    },
                },
                "required": ["description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "design_api",
            "description": "Design a REST or GraphQL API surface from requirements",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {"type": "string"},
                    "style": {
                        "type": "string",
                        "enum": ["rest", "graphql", "grpc"],
                    },
                },
                "required": ["description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "evaluate_tech_stack",
            "description": "Evaluate technology options and recommend a stack",
            "parameters": {
                "type": "object",
                "properties": {
                    "requirements": {"type": "string"},
                    "constraints": {"type": "string"},
                },
                "required": ["requirements"],
            },
        },
    },
]


class ArchitectureAgent(BaseAgent):
    agent_type = AgentType.ARCHITECTURE
    system_prompt = SYSTEM_PROMPT
    tools = TOOLS
    capabilities = [
        CapabilityContract(
            name="architecture",
            required_context_window=16_000,
            supports_tool_use=True,
        ),
    ]

    async def execute(self, task: AgentTask) -> AsyncIterator[AgentEvent]:
        yield self._make_event("status", task.workspace_id, {"status": AgentStatus.WORKING})
        _log = self.ws.publish_log
        agent_name = self.agent_type.value

        try:
            await self.ws.publish_agent_status(
                task.workspace_id, self.agent_type, AgentStatus.WORKING, detail=task.intent
            )
            await _log(task.workspace_id, agent_name, f"Starting task: {task.intent}", task_id=task.task_id)

            prompt = (
                f"Task: {task.intent}\n"
                f"Description: {task.description}\n"
                f"Context: {json.dumps(task.context)}"
            )

            await _log(task.workspace_id, agent_name, "Calling LLM for architecture analysis…", task_id=task.task_id)
            raw_reply = await self._call_llm(prompt, workspace_id=task.workspace_id)
            await _log(task.workspace_id, agent_name, "LLM response received. Parsing structured output…", level="success", task_id=task.task_id)

            try:
                structured = json.loads(raw_reply)
            except json.JSONDecodeError:
                structured = {"summary": raw_reply, "artifacts": [], "tasks": []}

            rich_blocks: list[RichBlock] = []
            for artifact in structured.get("artifacts", []):
                await _log(
                    task.workspace_id, agent_name,
                    f"Generated artifact: {artifact.get('title', 'untitled')} ({artifact.get('type', 'unknown')})",
                    task_id=task.task_id,
                )
                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language=_lang_for(artifact.get("type", "")),
                        content=artifact.get("content", ""),
                        metadata={"title": artifact.get("title", "")},
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
                workspace_id, self.agent_type, AgentStatus.THINKING
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
                workspace_id, self.agent_type, AgentStatus.THINKING
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


def _lang_for(artifact_type: str) -> str:
    return {
        "schema": "sql",
        "api": "yaml",
        "diagram": "mermaid",
        "adr": "markdown",
    }.get(artifact_type, "text")
