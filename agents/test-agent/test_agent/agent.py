"""Testing Agent implementation using SDLCAgent base."""

from __future__ import annotations

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
You are an expert QA engineer with access to tools. You help teams build \
comprehensive testing strategies AND produce real, executable test code.

Your responsibilities:
- Create test plans covering unit, integration, e2e, and performance testing
- Generate actual executable unit test code for key logic
- Use `gitlab_push_file` to commit test files directly to the repository
- Analyze test coverage and identify gaps

WORKFLOW:
1. Analyze the codebase context to understand what needs testing
2. Create a test plan (strategy, scope, tools)
3. Write actual unit test code for key functions/components
4. Use `gitlab_push_file` to commit each test file to the repo
5. Return a JSON summary:

{
  "summary": "brief summary of testing work",
  "test_plan": {
    "strategy": "...",
    "scope": "...",
    "tools": ["..."],
    "framework": "jest|pytest|vitest|..."
  },
  "test_cases": [
    {
      "name": "...",
      "type": "unit|integration|e2e",
      "steps": ["..."],
      "expected": "..."
    }
  ],
  "coverage_analysis": {
    "covered": ["..."],
    "gaps": ["..."],
    "recommendations": ["..."]
  },
  "artifacts": [
    {
      "type": "test_plan",
      "title": "Test Plan",
      "content": "Full markdown test plan document..."
    },
    {
      "type": "test_code",
      "title": "Unit Tests - module name",
      "content": "// actual test code..."
    }
  ],
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}

Be thorough—edge cases and negative tests are as important as happy paths. \
Write REAL test code, not pseudocode. If GitLab is not configured, still \
generate the test code in artifacts.

## Available Tools
- workspace_create_artifact: Save test deliverables. ALWAYS use this for test_plan and test_code artifacts.
- workspace_query_artifacts: Query upstream code and design artifacts for context. Use this BEFORE writing tests.
- gitlab_push_file: Commit test files directly to the repository.
- workspace_create_task: Create follow-up tasks if needed.
- workspace_query_phases: Check current phase/task status.\
"""

CHAT_PROMPT = """\
You are an expert QA engineer having a conversation. Respond in clear, \
well-structured natural language (use markdown formatting when helpful). \
Discuss testing strategies, suggest test cases, and explain coverage. \
Do NOT respond with raw JSON—use prose, bullet points, tables, and code blocks.\
"""


class TestingAgent(SDLCAgent):
    agent_type = AgentType.TESTING
    system_prompt = SYSTEM_PROMPT
    chat_prompt = CHAT_PROMPT
    phase_key = "testing"

    artifact_configs = [
        ArtifactConfig(type="test_plan", language="markdown"),
        ArtifactConfig(type="test_code", language="typescript"),
    ]

    capabilities = [
        CapabilityContract(
            name="run",
            required_context_window=16_000,
            supports_tool_use=True,
        ),
    ]

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        from vibeos_agent.tools.gitlab_tools import create_gitlab_tools
        self._static_provider.register_many(create_workspace_tools(self.workspace_svc, "testing", rag_client=self.rag))
        self._static_provider.register_many(create_delegation_tools("testing"))
        self._static_provider.register_many(create_gitlab_tools())

    async def _resolve_repo_context(self, task: AgentTask) -> dict[str, Any] | None:
        ctx = task.context or {}
        repo_context = {k: v for k, v in ctx.items() if k.startswith("gitlab_")}
        return repo_context or None

    async def _post_process(
        self,
        task: AgentTask,
        structured: dict[str, Any],
        rich_blocks: list[RichBlock],
    ) -> None:
        failed = [r for r in self._tool_results if not r["ok"]]
        critical = [r for r in failed if r["tool"] == "gitlab_push_file"]
        if critical:
            desc = "; ".join(f'{r["tool"]}: {r["result"][:120]}' for r in critical)
            raise RuntimeError(f"Critical tool(s) failed: {desc}")
