"""Coding Agent – bridges VibeOS BaseAgent with OpenHands SDK."""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any

from pydantic import SecretStr

from vibeos_agent import (
    AgentEvent,
    AgentStatus,
    AgentTask,
    AgentType,
    BaseAgent,
    Message,
    RichBlock,
)

from .workspace_manager import WorkspaceManager

logger = logging.getLogger(__name__)

CODING_SYSTEM_PROMPT = """\
You are an expert software engineer with full access to a cloned git repository.

Your workflow:
1. Explore the codebase to understand structure and conventions
2. Plan your changes before writing code
3. Implement changes across as many files as needed
4. Run build/test commands to verify your work
5. Fix any errors iteratively until tests pass

Guidelines:
- Follow existing code style and conventions in the repo
- Write clean, well-structured, production-ready code
- Include necessary imports and type hints
- Run tests after making changes when test infrastructure exists
- Report progress as you work using the ProgressTool
"""


class CodingAgent(BaseAgent):
    agent_type = AgentType.CODING
    system_prompt = CODING_SYSTEM_PROMPT

    def __init__(self) -> None:
        super().__init__()
        self.workspace_mgr = WorkspaceManager()

    async def execute(self, task: AgentTask) -> AsyncIterator[AgentEvent]:
        workspace_id = task.workspace_id
        ctx = task.context

        yield AgentEvent(
            type="status",
            agent_type=AgentType.CODING,
            workspace_id=workspace_id,
            payload={"status": AgentStatus.RUNNING, "message": "Preparing workspace…"},
            timestamp=datetime.now(timezone.utc),
        )

        gitlab_url = ctx.get("gitlab_url", os.getenv("GITLAB_URL", ""))
        project_path = ctx.get("gitlab_primary_project", "")
        branch = ctx.get("gitlab_branch", "main")
        credential_id = ctx.get("gitlab_credential_id")

        if not gitlab_url or not project_path:
            yield AgentEvent(
                type="error",
                agent_type=AgentType.CODING,
                workspace_id=workspace_id,
                payload={"error": "Missing gitlab_url or gitlab_primary_project in task context"},
                timestamp=datetime.now(timezone.utc),
            )
            return

        session_id = f"{workspace_id}-{task.task_id}"

        try:
            ws_path = await self.workspace_mgr.create_workspace(
                session_id=session_id,
                gitlab_url=gitlab_url,
                project_path=project_path,
                branch=branch,
                credential_id=credential_id,
            )
        except Exception as exc:
            yield AgentEvent(
                type="error",
                agent_type=AgentType.CODING,
                workspace_id=workspace_id,
                payload={"error": f"Failed to clone repo: {exc}"},
                timestamp=datetime.now(timezone.utc),
            )
            return

        feature_branch = f"vibeos/coding-{uuid.uuid4().hex[:8]}"
        try:
            await self.workspace_mgr.create_branch(session_id, feature_branch)
        except Exception:
            logger.warning("Could not create branch %s, working on current branch", feature_branch)
            feature_branch = branch

        yield AgentEvent(
            type="progress",
            agent_type=AgentType.CODING,
            workspace_id=workspace_id,
            payload={"message": f"Repo cloned. Starting coding on branch {feature_branch}…"},
            timestamp=datetime.now(timezone.utc),
        )

        task_prompt = task.user_message or task.description or task.intent
        result_text = ""
        error_text = ""

        try:
            result_text = await self._run_openhands(
                ws_path=str(ws_path),
                prompt=task_prompt,
                workspace_id=workspace_id,
            )
        except Exception as exc:
            error_text = str(exc)
            logger.exception("OpenHands execution failed")

        if error_text:
            yield AgentEvent(
                type="error",
                agent_type=AgentType.CODING,
                workspace_id=workspace_id,
                payload={"error": error_text},
                timestamp=datetime.now(timezone.utc),
            )
            return

        yield AgentEvent(
            type="progress",
            agent_type=AgentType.CODING,
            workspace_id=workspace_id,
            payload={"message": "Coding complete. Committing and pushing…"},
            timestamp=datetime.now(timezone.utc),
        )

        commit_msg = f"feat(vibeos): {task.intent[:72]}"
        try:
            push_result = await self.workspace_mgr.commit_and_push(
                session_id, commit_msg, credential_id=credential_id,
            )
        except Exception as exc:
            push_result = {"status": "push_failed", "error": str(exc)}

        try:
            await self._save_artifact(
                workspace_id=workspace_id,
                title=f"Coding: {task.intent[:60]}",
                content=result_text,
                artifact_type="code",
            )
        except Exception:
            logger.debug("Could not save artifact to workspace-svc (service may be down)")

        yield AgentEvent(
            type="result",
            agent_type=AgentType.CODING,
            workspace_id=workspace_id,
            payload={
                "summary": result_text[:500],
                "branch": feature_branch,
                "push_result": push_result,
            },
            timestamp=datetime.now(timezone.utc),
        )

    async def _run_openhands(
        self,
        ws_path: str,
        prompt: str,
        workspace_id: str,
    ) -> str:
        """Run OpenHands Agent in a thread to avoid blocking the event loop."""
        from openhands.sdk import LLM, Agent, Conversation, Tool
        from openhands.tools.file_editor import FileEditorTool
        from openhands.tools.terminal import TerminalTool

        import coding_agent.custom_tools  # noqa: F401  ensure tools registered

        model = os.getenv("CODING_LLM_MODEL", "deepseek/deepseek-chat")
        api_key = os.getenv("CODING_LLM_API_KEY", "")
        base_url = os.getenv("CODING_LLM_BASE_URL") or None

        llm = LLM(
            model=model,
            api_key=SecretStr(api_key) if api_key else None,
            base_url=base_url,
        )

        agent = Agent(
            llm=llm,
            system_prompt=self.system_prompt,
            tools=[
                Tool(name=TerminalTool.name),
                Tool(name=FileEditorTool.name),
                Tool(name="ProgressTool"),
                Tool(name="ArtifactTool"),
            ],
        )

        conversation = Conversation(agent=agent, workspace=ws_path)
        conversation.send_message(prompt)

        result = await asyncio.to_thread(conversation.run)

        final_messages = []
        for event in getattr(conversation, "events", []):
            text = getattr(event, "text", None) or getattr(event, "content", None)
            if text:
                final_messages.append(str(text)[:2000])

        return "\n".join(final_messages[-3:]) if final_messages else "Coding task completed."

    async def chat(
        self,
        message: str,
        *,
        workspace_id: str,
        context: dict[str, Any] | None = None,
    ) -> AsyncIterator[Message]:
        reply = await self._call_llm(
            message,
            workspace_id=workspace_id,
            enrich_context=False,
        )
        yield Message(
            workspace_id=workspace_id,
            agent_type=AgentType.CODING,
            content=reply,
        )

    async def chat_stream(
        self,
        message: str,
        *,
        workspace_id: str,
        context: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        async for delta in self._call_llm_stream(
            message,
            workspace_id=workspace_id,
            enrich_context=False,
        ):
            yield delta
