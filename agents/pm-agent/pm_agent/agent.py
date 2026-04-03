"""PMAgent – unified conversation gateway agent for VibeOS."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

from vibeos_agent import AgentEvent, AgentTask, AgentType, BaseAgent

logger = logging.getLogger(__name__)


class PMAgent(BaseAgent):
    """PM Agent: the sole external gateway for all AI interactions.

    Inherits standard tools (workspace, gitlab, delegation) from BaseAgent.
    PM-specific tools (workflow, graph, dev, pipeline, feishu) are registered
    via :meth:`register_pm_tools` after lifecycle dependencies are ready.
    """

    agent_type = AgentType.PM
    system_prompt = """\
You are VibeOS, an AI-native SDLC platform assistant. You manage software \
projects across their full lifecycle.

You have access to tools for:
- Requirement management (create/list/update/delete requirements)
- Workspace management (query progress, create workspaces, list workspaces)
- Phase/task execution (run phases, run tasks, run full projects)
- Delegation to specialist agents (requirement, architecture, design, \
development, testing, cicd, monitoring)
- Graph-based workflow execution
- Artifact and task creation
- Code generation, review, and implementation planning
- GitLab integration (issues, merge requests, pipelines, file push)
- CI/CD pipelines (trigger, status, logs, cancel)
- Feishu/Lark messaging, tasks, and document creation

When the user gives a clear, explicit instruction to create, modify, or manage \
a resource, use the appropriate tool. NEVER fabricate results or pretend \
actions were taken. If you don't see the right tool, use search_tools to \
discover it first. NEVER promise to perform an action before verifying you \
have the tool for it.

IMPORTANT: Do NOT infer action intent from ambiguous acknowledgments such as \
"好的", "OK", "sure", "嗯", "好", "行". These are conversational responses, \
NOT action requests. When the user's intent is unclear, ask a clarifying \
question instead of calling any tool.

Mutating tools (create, delete, modify) require user confirmation via an \
interactive card — just call the tool and the system handles confirmation \
automatically. Do NOT manually ask the user to confirm before calling the \
tool.

Always respond in the same language as the user's message. \
If the user writes in Chinese, respond in Chinese. If in English, respond \
in English.\
"""

    def register_pm_tools(
        self,
        workflow_engine: Any,
        graph_executor: Any | None = None,
    ) -> None:
        """Register PM-specific tools that require lifecycle dependencies."""
        from vibeos_agent import create_pm_tools
        from vibeos_agent.tools.dev_tools import create_dev_tools
        from vibeos_agent.tools.feishu_tools import create_feishu_tools
        from vibeos_agent.tools.pipeline_tools import create_pipeline_tools

        self.tool_manager.register_many(create_pm_tools(
            self.workspace_svc,
            workflow_engine=workflow_engine,
            graph_executor=graph_executor,
        ))
        self.tool_manager.register_many(create_dev_tools(self.llm))
        self.tool_manager.register_many(create_pipeline_tools())
        self.tool_manager.register_many(create_feishu_tools())

    async def execute(self, task: AgentTask) -> AsyncIterator[AgentEvent]:
        """PM delegates execution through the pipeline."""
        async for evt in self._run_pipeline_stream(
            workspace_id=task.workspace_id,
            user_message=task.user_message or task.description,
            task_context=task.context,
            system_prompt=task.system_prompt,
        ):
            yield evt
