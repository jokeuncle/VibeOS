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
Write clean, well-structured code. Follow language idioms and best practices.

## MANDATORY: Artifact Creation & Code Push
You MUST call workspace_create_artifact for each code file you produce. \
You MUST call gitlab_push_file to commit each source file to the repository. \
After pushing all files, call gitlab_create_mr to create a merge request.

## Available Tools (all tools are available; key ones for this phase listed first)
- workspace_create_artifact: Persist code artifacts. YOU MUST CALL THIS for each file.
- gitlab_push_file: Commit source code files to the project repository. YOU MUST CALL THIS.
- gitlab_create_mr: Create a merge request after committing all files.
- workspace_query_artifacts: Query upstream PRD, architecture, design artifacts. Use BEFORE coding.
- workspace_create_task: Create follow-up tasks if needed.
- workspace_query_phases: Check current phase/task status.\
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
        from vibeos_agent.tools.dev_tools import create_dev_tools
        self.tool_manager.register_many(create_dev_tools(self.llm))

    async def _resolve_repo_context(self, task: AgentTask) -> dict[str, Any] | None:
        ctx = task.context or {}
        repo_context = {k: v for k, v in ctx.items() if k.startswith("gitlab_")}
        return repo_context or None

    def _build_execute_prompt(self, task: AgentTask) -> str:
        safe_ctx = {k: v for k, v in (task.context or {}).items() if not k.startswith("gitlab_token")}
        task.context = safe_ctx
        return super()._build_execute_prompt(task)

    async def _post_process(
        self, task: AgentTask, structured: dict[str, Any], rich_blocks: list[RichBlock]
    ) -> None:
        failed = [r for r in self._tool_results if not r["ok"]]
        critical = [r for r in failed if r["tool"] in ("gitlab_push_file", "gitlab_create_mr")]
        if critical:
            desc = "; ".join(f'{r["tool"]}: {r["result"][:120]}' for r in critical)
            raise RuntimeError(f"Critical tool(s) failed: {desc}")

        pushed = any(r.get("ok") and r.get("tool") == "gitlab_push_file" for r in self._tool_results)
        if pushed:
            return

        code_artifacts = structured.get("code_artifacts") or structured.get("files") or []
        if not code_artifacts:
            return

        ctx = task.context or {}
        if not ctx.get("gitlab_credential_id"):
            return

        push_tool = self.tool_manager.get_tool("gitlab_push_file")
        if not push_tool:
            return

        agent_name = "development"
        branch = ctx.get("gitlab_branch", "feature/dev")
        project_id = ctx.get("gitlab_primary_project")
        await self.ws.publish_log(
            task.workspace_id, agent_name,
            f"LLM did not push code; auto-pushing {len(code_artifacts)} file(s) as fallback.",
            level="warn", task_id=task.task_id,
        )
        for art in code_artifacts:
            fp = art.get("filename") or art.get("file_path", "")
            content = art.get("content", "")
            if not fp or not content:
                continue
            try:
                result = await push_tool.execute(
                    file_path=fp, content=content, branch=branch,
                    commit_message=f"feat: add {fp}",
                    project_id=project_id, _context=ctx,
                )
                rich_blocks.append(RichBlock(
                    type="code", language="text",
                    content=f"[Auto-pushed] {fp}",
                    metadata={"file_path": fp},
                ))
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning("Fallback push failed for %s: %s", fp, exc)
