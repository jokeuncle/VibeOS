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

        await self.ws.publish_agent_status(
            task.workspace_id, self.agent_type, AgentStatus.WORKING, detail=task.intent
        )

        prompt = (
            f"Task: {task.intent}\n"
            f"Description: {task.description}\n"
            f"Context: {json.dumps(task.context)}"
        )
        raw_reply = await self._call_llm(prompt, workspace_id=task.workspace_id)

        try:
            structured = json.loads(raw_reply)
        except json.JSONDecodeError:
            structured = {"summary": raw_reply, "artifacts": [], "tasks": []}

        rich_blocks: list[RichBlock] = []
        for artifact in structured.get("artifacts", []):
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
        for t in structured.get("tasks", []):
            new_task = Task(title=t["title"], description=t.get("description", ""))
            try:
                result = await self.workspace_svc.create_task(
                    task.workspace_id, new_task, phase_id=arch_phase_id
                )
                created_tasks.append(result)
                rich_blocks.append(
                    RichBlock(
                        type="task_card",
                        content=t["title"],
                        metadata={"task": result},
                    )
                )
            except Exception:
                rich_blocks.append(
                    RichBlock(
                        type="task_card",
                        content=t["title"],
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

        await self.ws.publish_agent_status(
            task.workspace_id, self.agent_type, AgentStatus.IDLE
        )

        yield self._make_event(
            "result",
            task.workspace_id,
            {
                "summary": structured.get("summary", ""),
                "artifacts": structured.get("artifacts", []),
                "created_tasks": created_tasks,
            },
        )

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

        await self.ws.publish_agent_status(
            workspace_id, self.agent_type, AgentStatus.THINKING
        )

        reply_text = await self._call_llm(message, workspace_id=workspace_id)

        reply_msg = self._make_message(workspace_id, reply_text)
        await self.session.append(workspace_id, self.agent_type, reply_msg)

        await self.ws.publish_agent_status(
            workspace_id, self.agent_type, AgentStatus.IDLE
        )

        yield reply_msg


def _lang_for(artifact_type: str) -> str:
    return {
        "schema": "sql",
        "api": "yaml",
        "diagram": "mermaid",
        "adr": "markdown",
    }.get(artifact_type, "text")
