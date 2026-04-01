"""Development Agent implementation using SDLCAgent base."""

from __future__ import annotations

import json
from typing import Any

from vibeos_agent import (
    AgentTask,
    AgentType,
    ArtifactConfig,
    CapabilityContract,
    RichBlock,
    SDLCAgent,
)

SYSTEM_PROMPT = """\
You are an expert full-stack software developer with access to tools. \
You help teams implement high-quality, maintainable code across the entire stack \
and commit it directly to the project repository.

Your responsibilities:
- Create implementation plans breaking features into concrete coding tasks
- Generate production-ready code and USE the gitlab_push_file tool to commit each \
  file directly to the repository — do NOT just describe the code
- Review code for bugs, performance issues, and best-practice violations
- Identify and specify dependencies

WORKFLOW:
1. Analyse the task and design the file structure
2. For each file, call `gitlab_push_file` with the full file content to commit it
3. After all files are committed, return a JSON summary:

{
  "summary": "brief summary of what was implemented and committed",
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

If GITLAB_URL or GITLAB_TOKEN are not configured, still generate the code_artifacts \
in the JSON response so they can be saved as artifacts, but note the missing config.
Write clean, well-structured code. Follow language idioms and best practices.\
"""

CHAT_PROMPT = """\
You are an expert full-stack developer having a conversation. Respond in clear, \
well-structured natural language (use markdown formatting when helpful). \
Provide code examples in fenced code blocks, explain architectural choices, \
and discuss trade-offs. Do NOT respond with raw JSON—use prose, bullet points, \
code blocks, and headings.\
"""


class DevelopmentAgent(SDLCAgent):
    agent_type = AgentType.DEVELOPMENT
    system_prompt = SYSTEM_PROMPT
    chat_prompt = CHAT_PROMPT
    phase_key = "development"

    artifact_configs = [
        ArtifactConfig(type="code", language="text"),
    ]

    capabilities = [
        CapabilityContract(
            name="code_gen",
            required_context_window=32_000,
            supports_tool_use=True,
        ),
    ]

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.gitlab_tools import create_gitlab_tools
        from vibeos_agent.tools.dev_tools import create_dev_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        self._static_provider.register_many(create_workspace_tools(self.workspace_svc, "development"))
        self._static_provider.register_many(create_gitlab_tools())
        self._static_provider.register_many(create_dev_tools(self.llm))
        self._static_provider.register_many(create_delegation_tools("development"))

    async def _resolve_repo_context(self, task: AgentTask) -> dict[str, Any] | None:
        ctx = task.context or {}
        repo_context = {k: v for k, v in ctx.items() if k.startswith("gitlab_")}
        return repo_context or None

    def _build_execute_prompt(self, task: AgentTask) -> str:
        user_msg = task.user_message or task.description
        safe_ctx = {k: v for k, v in (task.context or {}).items() if not k.startswith("gitlab_token")}
        return (
            f"Task: {task.intent}\n"
            f"Description: {task.description}\n"
            f"User request: {user_msg}\n"
            f"Context: {json.dumps(safe_ctx)}"
        )

    async def _post_process(
        self, task: AgentTask, structured: dict[str, Any], rich_blocks: list[RichBlock]
    ) -> None:
        failed = [r for r in self._tool_results if not r["ok"]]
        critical = [r for r in failed if r["tool"] in ("gitlab_push_file", "gitlab_create_mr")]
        if critical:
            desc = "; ".join(f'{r["tool"]}: {r["result"][:120]}' for r in critical)
            raise RuntimeError(f"Critical tool(s) failed: {desc}")
