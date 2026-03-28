"""Development Agent implementation."""

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
You are an expert full-stack software developer. You help teams implement \
high-quality, maintainable code across the entire stack.

Your responsibilities:
- Create implementation plans breaking features into concrete coding tasks
- Generate production-ready code artifacts (files with proper structure)
- Review code for bugs, performance issues, and best-practice violations
- Identify and specify dependencies

When responding, structure your output as JSON with the following shape:
{
  "summary": "brief summary",
  "implementation_plan": [
    {"step": 1, "description": "...", "files_affected": ["..."]}
  ],
  "code_artifacts": [
    {"filename": "...", "language": "...", "content": "..."}
  ],
  "dependencies": [
    {"name": "...", "version": "...", "reason": "..."}
  ],
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}
Write clean, well-structured code. Follow language idioms and best practices.\
"""

CHAT_PROMPT = """\
You are an expert full-stack developer having a conversation. Respond in clear, \
well-structured natural language (use markdown formatting when helpful). \
Provide code examples in fenced code blocks, explain architectural choices, \
and discuss trade-offs. Do NOT respond with raw JSON—use prose, bullet points, \
code blocks, and headings.\
"""

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "generate_code",
            "description": "Generate source code for a given specification",
            "parameters": {
                "type": "object",
                "properties": {
                    "specification": {"type": "string"},
                    "language": {
                        "type": "string",
                        "enum": ["python", "typescript", "go", "rust", "java"],
                    },
                    "framework": {"type": "string"},
                },
                "required": ["specification", "language"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "review_code",
            "description": "Review code for bugs, performance issues, and best practices",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string"},
                    "language": {"type": "string"},
                    "focus": {
                        "type": "string",
                        "enum": ["bugs", "performance", "security", "style", "all"],
                    },
                },
                "required": ["code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "plan_implementation",
            "description": "Create a step-by-step implementation plan for a feature",
            "parameters": {
                "type": "object",
                "properties": {
                    "feature_description": {"type": "string"},
                    "tech_stack": {"type": "string"},
                    "constraints": {"type": "string"},
                },
                "required": ["feature_description"],
            },
        },
    },
]


def _lang_for(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    return {
        "py": "python",
        "ts": "typescript",
        "tsx": "typescript",
        "js": "javascript",
        "jsx": "javascript",
        "go": "go",
        "rs": "rust",
        "java": "java",
        "sql": "sql",
        "yaml": "yaml",
        "yml": "yaml",
        "json": "json",
        "md": "markdown",
    }.get(ext, "text")


class DevelopmentAgent(BaseAgent):
    agent_type = AgentType.DEVELOPMENT
    system_prompt = SYSTEM_PROMPT
    tools = TOOLS

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.gitlab_tools import create_gitlab_tools
        self.tool_registry.register_many(create_workspace_tools(self.workspace_svc, "development"))
        self.tool_registry.register_many(create_gitlab_tools())

    capabilities = [
        CapabilityContract(
            name="development",
            required_context_window=32_000,
            supports_tool_use=True,
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

            await _log(task.workspace_id, agent_name, "Calling LLM for development planning…", task_id=task.task_id)
            raw_reply = await self._call_llm(prompt, workspace_id=task.workspace_id)
            await _log(task.workspace_id, agent_name, "LLM response received. Parsing structured output…", level="success", task_id=task.task_id)

            try:
                structured = json.loads(raw_reply)
            except json.JSONDecodeError:
                structured = {"summary": raw_reply, "code_artifacts": [], "dependencies": [], "tasks": []}

            # Save code output as artifact
            try:
                dev_phase_id = await self.workspace_svc.find_phase_by_type(task.workspace_id, "development")
                await self._save_artifact(
                    task.workspace_id,
                    artifact_type="code",
                    title=f"Code: {task.description[:80]}",
                    content=raw_reply,
                    phase_id=dev_phase_id,
                    task_id=task.task_id,
                )
                await _log(task.workspace_id, agent_name, "Code output saved as artifact", level="success", task_id=task.task_id)
            except Exception as exc:
                await _log(task.workspace_id, agent_name, f"Failed to save artifact: {exc}", level="error", task_id=task.task_id)

            rich_blocks: list[RichBlock] = []
            for artifact in structured.get("code_artifacts", []):
                filename = artifact.get("filename", "untitled")
                await _log(
                    task.workspace_id, agent_name,
                    f"Generated code artifact: {filename}",
                    task_id=task.task_id,
                )
                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language=artifact.get("language", _lang_for(filename)),
                        content=artifact.get("content", ""),
                        metadata={"title": filename},
                    )
                )

            yield self._make_event(
                "progress", task.workspace_id, {"progress": 0.5, "detail": "Creating tasks"}
            )

            phase_id = await self.workspace_svc.find_phase_by_type(
                task.workspace_id, "development"
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
                    "code_artifacts": structured.get("code_artifacts", []),
                    "dependencies": structured.get("dependencies", []),
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
