"""SandboxAgent -- base for agents with sandboxed code execution.

Provides the pattern used by coding-agent (OpenHands) and future agents
that need full file-system / terminal / git access in an isolated
environment.  Subclasses implement ``_run_sandbox`` to delegate to their
specific runtime (OpenHands, E2B, etc.).
"""

from __future__ import annotations

import logging
from abc import abstractmethod
from collections.abc import AsyncIterator
from typing import Any

from .base_agent import BaseAgent
from .clients._utils import _enum_val
from .models import AgentEvent, AgentStatus, AgentTask

logger = logging.getLogger(__name__)


class SandboxAgent(BaseAgent):
    """Agent with sandboxed code execution capabilities.

    The ``execute`` lifecycle delegates to :meth:`_run_sandbox` for the
    actual work, while maintaining standard status publishing and error
    handling via the shared infrastructure.

    Chat still uses the default ``BaseAgent.chat`` / ``chat_stream`` path
    (LLM gateway without sandbox).
    """

    async def execute(self, task: AgentTask) -> AsyncIterator[AgentEvent]:
        agent_name = _enum_val(self.agent_type)
        yield self._make_event("status", task.workspace_id, {"status": AgentStatus.RUNNING})

        try:
            await self.ws.publish_agent_status(
                task.workspace_id, self.agent_type, AgentStatus.RUNNING, detail=task.intent
            )
            await self.ws.publish_log(
                task.workspace_id, agent_name, f"Starting sandbox task: {task.intent}",
                task_id=task.task_id,
            )

            async for event in self._run_sandbox(task):
                yield event

        except Exception as exc:
            try:
                await self.ws.publish_log(
                    task.workspace_id, agent_name, f"Sandbox execution failed: {exc}",
                    level="error", task_id=task.task_id,
                )
            except Exception:
                pass
            yield self._make_event("error", task.workspace_id, {"error": str(exc)})
            raise
        finally:
            try:
                await self.ws.publish_agent_status(
                    task.workspace_id, self.agent_type, AgentStatus.IDLE
                )
            except Exception:
                pass

    @abstractmethod
    async def _run_sandbox(self, task: AgentTask) -> AsyncIterator[AgentEvent]:
        """Execute the task inside the sandbox runtime.

        Implementations should:
        1. Set up the sandbox environment (clone repo, create branch, etc.)
        2. Run the coding/testing/analysis logic
        3. Yield progress events as work proceeds
        4. Persist artifacts via ``self._save_artifact``
        5. Clean up sandbox resources
        """
        ...
