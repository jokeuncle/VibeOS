"""Testing Agent implementation."""

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
You are an expert QA engineer. You help teams build comprehensive testing \
strategies and produce high-quality test suites.

Your responsibilities:
- Create test plans covering unit, integration, e2e, and performance testing
- Generate detailed test cases with steps and expected outcomes
- Analyze test coverage and identify gaps
- Recommend testing tools and frameworks

When responding, structure your output as JSON with the following shape:
{
  "summary": "brief summary",
  "test_plan": {
    "strategy": "...",
    "scope": "...",
    "tools": ["..."]
  },
  "test_cases": [
    {
      "name": "...",
      "type": "unit|integration|e2e|performance",
      "steps": ["..."],
      "expected": "..."
    }
  ],
  "coverage_analysis": {
    "covered": ["..."],
    "gaps": ["..."],
    "recommendations": ["..."]
  },
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}
Be thorough—edge cases and negative tests are as important as happy paths.\
"""

CHAT_PROMPT = """\
You are an expert QA engineer having a conversation. Respond in clear, \
well-structured natural language (use markdown formatting when helpful). \
Discuss testing strategies, suggest test cases, and explain coverage. \
Do NOT respond with raw JSON—use prose, bullet points, tables, and code blocks.\
"""

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "generate_test_plan",
            "description": "Generate a comprehensive test plan for a feature or system",
            "parameters": {
                "type": "object",
                "properties": {
                    "feature_description": {"type": "string"},
                    "test_types": {
                        "type": "string",
                        "enum": ["unit", "integration", "e2e", "performance", "all"],
                    },
                },
                "required": ["feature_description"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_test_cases",
            "description": "Create detailed test cases with steps and expected outcomes",
            "parameters": {
                "type": "object",
                "properties": {
                    "feature": {"type": "string"},
                    "acceptance_criteria": {"type": "string"},
                },
                "required": ["feature"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_coverage",
            "description": "Analyze test coverage and identify gaps",
            "parameters": {
                "type": "object",
                "properties": {
                    "existing_tests": {"type": "string"},
                    "requirements": {"type": "string"},
                },
                "required": ["existing_tests"],
            },
        },
    },
]


class TestingAgent(BaseAgent):
    agent_type = AgentType.TESTING
    system_prompt = SYSTEM_PROMPT
    tools = TOOLS

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        self.tool_registry.register_many(create_workspace_tools(self.workspace_svc, "testing"))
        self.tool_registry.register_many(create_delegation_tools("testing"))

    capabilities = [
        CapabilityContract(
            name="testing",
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

            await _log(task.workspace_id, agent_name, "Calling LLM for test planning…", task_id=task.task_id)
            raw_reply = await self._call_llm_with_tools(prompt, workspace_id=task.workspace_id)
            await _log(task.workspace_id, agent_name, "LLM response received. Parsing structured output…", level="success", task_id=task.task_id)

            try:
                structured = json.loads(raw_reply)
            except json.JSONDecodeError:
                structured = {"summary": raw_reply, "test_cases": [], "tasks": []}

            # Save test plan as artifact
            try:
                test_phase_id = await self.workspace_svc.find_phase_by_type(task.workspace_id, "testing")
                await self._save_artifact(
                    task.workspace_id,
                    artifact_type="test_plan",
                    title=f"Test plan: {task.description[:80]}",
                    content=raw_reply,
                    phase_id=test_phase_id,
                    task_id=task.task_id,
                )
                await _log(task.workspace_id, agent_name, "Test plan saved as artifact", level="success", task_id=task.task_id)
            except Exception as exc:
                await _log(task.workspace_id, agent_name, f"Failed to save artifact: {exc}", level="error", task_id=task.task_id)

            rich_blocks: list[RichBlock] = []
            for tc in structured.get("test_cases", []):
                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language="markdown",
                        content=f"**{tc.get('name', 'Untitled')}** ({tc.get('type', 'unknown')})\n\nSteps:\n"
                        + "\n".join(f"  {i+1}. {s}" for i, s in enumerate(tc.get("steps", [])))
                        + f"\n\nExpected: {tc.get('expected', '')}",
                        metadata={"title": tc.get("name", "Test Case")},
                    )
                )

            if structured.get("coverage_analysis"):
                rich_blocks.append(
                    RichBlock(
                        type="code",
                        language="json",
                        content=json.dumps(structured["coverage_analysis"], indent=2),
                        metadata={"title": "Coverage Analysis"},
                    )
                )

            yield self._make_event(
                "progress", task.workspace_id, {"progress": 0.5, "detail": "Creating tasks"}
            )

            phase_id = await self.workspace_svc.find_phase_by_type(
                task.workspace_id, "testing"
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
                    "test_plan": structured.get("test_plan", {}),
                    "test_cases": structured.get("test_cases", []),
                    "coverage_analysis": structured.get("coverage_analysis", {}),
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
