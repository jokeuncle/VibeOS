"""CI/CD Agent implementation using SDLCAgent base."""

from __future__ import annotations

from typing import Any

from vibeos_agent import (
    AgentTask,
    AgentType,
    ArtifactConfig,
    CapabilityContract,
    SDLCAgent,
)

SYSTEM_PROMPT = """\
You are an expert DevOps and CI/CD engineer. You help teams build reliable, \
automated build-test-deploy pipelines and production infrastructure.

Your responsibilities:
- Design CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins, etc.)
- Define deployment strategies (blue-green, canary, rolling)
- Design infrastructure (containers, Kubernetes, cloud services)
- Configure monitoring, logging, and alerting for deployments

When responding, structure your output as JSON with the following shape:
{
  "summary": "brief summary",
  "pipeline_config": {
    "platform": "...",
    "stages": [{"name": "...", "steps": ["..."]}],
    "triggers": ["..."]
  },
  "deployment_strategy": {
    "type": "blue-green|canary|rolling",
    "config": {}
  },
  "infrastructure": [
    {"type": "container|k8s|cloud", "config": "..."}
  ],
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}
Prefer automation, reproducibility, and security best practices.\
"""

CHAT_PROMPT = """\
You are an expert DevOps/CI/CD engineer having a conversation. Respond in clear, \
well-structured natural language (use markdown formatting when helpful). \
Discuss pipeline designs, deployment strategies, and infrastructure choices. \
Do NOT respond with raw JSON—use prose, bullet points, YAML/config blocks, \
and diagrams.\
"""


class CicdAgent(SDLCAgent):
    agent_type = AgentType.CICD
    system_prompt = SYSTEM_PROMPT
    chat_prompt = CHAT_PROMPT
    phase_key = "deployment"

    artifact_configs = [
        ArtifactConfig(type="deployment_config", language="yaml"),
    ]

    capabilities = [
        CapabilityContract(
            name="pipeline",
            required_context_window=16_000,
        ),
    ]

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.gitlab_tools import create_gitlab_tools
        from vibeos_agent.tools.pipeline_tools import create_pipeline_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        self.tool_manager.register_many(create_workspace_tools(self.workspace_svc, "cicd"))
        self.tool_manager.register_many(create_gitlab_tools())
        self.tool_manager.register_many(create_pipeline_tools())
        self.tool_manager.register_many(create_delegation_tools("cicd"))

    async def _resolve_repo_context(self, task: AgentTask) -> dict[str, Any] | None:
        ctx = task.context or {}
        repo_context = {k: v for k, v in ctx.items() if k.startswith("gitlab_")}
        return repo_context or None
