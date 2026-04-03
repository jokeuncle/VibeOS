"""Coding Agent – bridges VibeOS BaseAgent with OpenHands SDK."""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from pydantic import SecretStr

from vibeos_agent import (
    AgentEvent,
    AgentStatus,
    AgentTask,
    AgentType,
    BaseAgent,
    CapabilityContract,
)

from .workspace_manager import WorkspaceManager

logger = logging.getLogger(__name__)

_WS_GATEWAY_URL = os.getenv("WS_GATEWAY_URL", "http://localhost:8020")
_PUBLISH_SECRET = os.getenv("PUBLISH_SECRET", "vibeos-internal")
_CODING_WORKSPACE_ROOT = os.getenv("CODING_WORKSPACE_ROOT", "/tmp/vibeos-workspaces")

_CONVENTION_FILES = (
    "AGENTS.md", "CLAUDE.md", "CONVENTIONS.md",
    ".cursor/rules/project-overview.mdc",
    "CONTRIBUTING.md",
)

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

    capabilities = [
        CapabilityContract(
            name="execute",
            required_context_window=32_000,
            supports_tool_use=True,
        ),
    ]

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

        gitlab_url = ctx.get("gitlab_url") or ctx.get("gitlab_primary_url") or os.getenv("GITLAB_URL", "")
        project_path = ctx.get("gitlab_project_path", "")
        if not project_path:
            project_path = ctx.get("gitlab_primary_project", "")
        branch = ctx.get("gitlab_branch_default", "main")
        credential_id = ctx.get("gitlab_credential_id")

        logger.info("CodingAgent context: gitlab_url=%s project_path=%s branch=%s cred=%s ctx_keys=%s",
                     gitlab_url, project_path, branch, credential_id, list(ctx.keys()))

        if not gitlab_url or not project_path:
            yield AgentEvent(
                type="error",
                agent_type=AgentType.CODING,
                workspace_id=workspace_id,
                payload={"error": f"Missing gitlab_url={gitlab_url!r} or project_path={project_path!r} in task context. ctx keys: {list(ctx.keys())}"},
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

        self.workspace_mgr.cleanup(session_id)

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

    def _publish_progress(self, workspace_id: str, message: str) -> None:
        """Publish a progress event to ws-gateway (sync, fire-and-forget)."""
        payload = {
            "type": "agent:log",
            "workspaceId": workspace_id,
            "payload": {
                "agentType": "coding",
                "message": message[:300],
            },
        }
        try:
            with httpx.Client(timeout=3) as client:
                client.post(
                    f"{_WS_GATEWAY_URL}/api/publish",
                    json=payload,
                    headers={"X-Internal-Token": _PUBLISH_SECRET},
                )
        except Exception:
            pass

    def _make_event_callback(self, workspace_id: str):
        """Create a Conversation callback that bridges OpenHands events to ws-gateway."""
        from openhands.sdk.event import ActionEvent, MessageEvent, ObservationEvent

        def on_event(event) -> None:
            if isinstance(event, ActionEvent) and event.tool_name:
                self._publish_progress(workspace_id, f"Running: {event.tool_name}")
            elif isinstance(event, ObservationEvent):
                self._publish_progress(workspace_id, "Processing result…")
            elif isinstance(event, MessageEvent) and event.source == "agent":
                try:
                    from openhands.sdk.llm.message import content_to_str
                    parts = content_to_str(event.llm_message.content)
                    text = "".join(parts)[:200]
                    if text.strip():
                        self._publish_progress(workspace_id, text)
                except Exception:
                    pass

        return on_event

    @staticmethod
    def _load_project_skills(ws_path: str) -> list:
        """Discover project convention files and return them as OpenHands Skills."""
        from openhands.sdk.context.skills import Skill

        skills: list[Skill] = []
        root = Path(ws_path)

        for relpath in _CONVENTION_FILES:
            filepath = root / relpath
            if not filepath.is_file():
                continue
            try:
                text = filepath.read_text(encoding="utf-8", errors="replace")[:8000]
            except OSError:
                continue
            if text.strip():
                skills.append(Skill(
                    name=relpath.replace("/", "-"),
                    content=text,
                    trigger=None,
                ))

        if skills:
            logger.info("Loaded %d project convention skills: %s",
                        len(skills), [s.name for s in skills])
        return skills

    async def _run_openhands(
        self,
        ws_path: str,
        prompt: str,
        workspace_id: str,
    ) -> str:
        """Run OpenHands Agent in a thread to avoid blocking the event loop."""
        from openhands.sdk import LLM, Agent, Conversation, Tool
        from openhands.sdk.context.agent_context import AgentContext
        from openhands.sdk.context.condenser import LLMSummarizingCondenser
        from openhands.sdk.conversation.response_utils import get_agent_final_response
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

        condenser_llm = llm.model_copy(update={"usage_id": "condenser"})
        condenser = LLMSummarizingCondenser(
            llm=condenser_llm, max_size=80, keep_first=4,
        )

        project_skills = self._load_project_skills(ws_path)

        agent_context = AgentContext(
            system_message_suffix=CODING_SYSTEM_PROMPT,
            skills=project_skills,
        )

        tools = [
            Tool(name=TerminalTool.name),
            Tool(name=FileEditorTool.name),
            Tool(name="ProgressTool"),
            Tool(name="ArtifactTool"),
        ]

        if os.getenv("CODING_ENABLE_DELEGATION", "").lower() in ("1", "true"):
            tools.append(Tool(name="DelegateTool"))
            self._register_subagents(llm)

        agent = Agent(
            llm=llm,
            tools=tools,
            agent_context=agent_context,
            condenser=condenser,
        )

        hook_config = self._build_hook_config(ws_path)

        session_hex = uuid.uuid5(uuid.NAMESPACE_URL, workspace_id).hex
        persistence_dir: str | None = None
        conversation_id = None
        if os.getenv("CODING_ENABLE_PERSISTENCE", "").lower() in ("1", "true"):
            persistence_dir = os.path.join(_CODING_WORKSPACE_ROOT, "sessions")
            conversation_id = uuid.UUID(session_hex)

        conversation = Conversation(
            agent=agent,
            workspace=ws_path,
            callbacks=[self._make_event_callback(workspace_id)],
            visualizer=None,
            max_iteration_per_run=200,
            stuck_detection=True,
            stuck_detection_thresholds={
                "action_observation": 4,
                "action_error": 3,
                "monologue": 3,
            },
            hook_config=hook_config,
            persistence_dir=persistence_dir,
            conversation_id=conversation_id,
        )
        conversation.send_message(prompt)

        await asyncio.to_thread(conversation.run)

        result = get_agent_final_response(conversation.state.events)
        return result if result else "Coding task completed."

    @staticmethod
    def _register_subagents(llm) -> None:
        """Register specialized subagents for delegation."""
        from openhands.sdk import Agent, Tool
        from openhands.sdk.context.agent_context import AgentContext
        from openhands.sdk.subagent import register_agent

        def create_code_explorer(sub_llm):
            return Agent(
                llm=sub_llm,
                tools=[
                    Tool(name="terminal"),
                    Tool(name="file_editor"),
                ],
                agent_context=AgentContext(
                    system_message_suffix=(
                        "You are a code exploration specialist. "
                        "Read and analyze the codebase to understand architecture, "
                        "patterns, and relevant files. Do NOT modify any files. "
                        "Return a list of key files and architectural insights."
                    ),
                ),
            )

        def create_code_reviewer(sub_llm):
            return Agent(
                llm=sub_llm,
                tools=[
                    Tool(name="terminal"),
                    Tool(name="file_editor"),
                ],
                agent_context=AgentContext(
                    system_message_suffix=(
                        "You are a code review specialist. "
                        "Analyze the given code changes for bugs, style violations, "
                        "and potential issues. Rate each finding with a confidence "
                        "score (0-100). Only report issues with confidence >= 80."
                    ),
                ),
            )

        try:
            register_agent(
                name="code_explorer",
                factory_func=create_code_explorer,
                description="Explores codebases to find relevant files and patterns",
            )
            register_agent(
                name="code_reviewer",
                factory_func=create_code_reviewer,
                description="Reviews code changes for bugs and style issues",
            )
        except Exception:
            logger.debug("Subagents already registered or registration failed")

    @staticmethod
    def _build_hook_config(ws_path: str) -> HookConfig | None:
        """Build hook config with a safety guard for dangerous terminal commands."""
        from openhands.sdk.hooks import HookConfig, HookDefinition, HookMatcher

        guard_script = Path(ws_path) / ".openhands" / "hooks" / "guard.sh"
        if not guard_script.is_file():
            guard_script.parent.mkdir(parents=True, exist_ok=True)
            guard_script.write_text(
                "#!/usr/bin/env bash\n"
                "# Safety guard: block obviously dangerous terminal commands.\n"
                "# Exit 0 = allow, exit 2 = block.\n"
                "INPUT=$(cat)\n"
                'CMD=$(echo "$INPUT" | python3 -c "import sys,json;'
                "d=json.load(sys.stdin);print(d.get('tool_input',{}).get('command',''))\")\n"
                'case "$CMD" in\n'
                '  *"rm -rf /"*|*"rm -rf /*"*|*"mkfs"*|*"dd if="*|*":(){"*)\n'
                '    echo "{\\"decision\\":\\"deny\\",\\"reason\\":\\"Blocked dangerous command\\"}"\n'
                "    exit 2 ;;\n"
                "esac\n"
                "exit 0\n",
                encoding="utf-8",
            )
            guard_script.chmod(0o755)

        return HookConfig(
            pre_tool_use=[
                HookMatcher(
                    matcher="terminal",
                    hooks=[HookDefinition(command=str(guard_script), timeout=10)],
                ),
            ],
        )

