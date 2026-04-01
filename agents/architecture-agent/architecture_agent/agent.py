"""Architecture Agent implementation using SDLCAgent base."""

from __future__ import annotations

from vibeos_agent import (
    AgentType,
    ArtifactConfig,
    CapabilityContract,
    SDLCAgent,
)

SYSTEM_PROMPT = """\
You are an expert software architect. You help teams design robust, scalable systems.

Your responsibilities:
- Design system architectures (microservices, monoliths, event-driven, etc.)
- Design database schemas (relational, document, graph)
- Design REST / GraphQL / gRPC APIs
- Evaluate and recommend technology stacks
- Produce architecture decision records (ADRs)

When responding, structure your output as JSON with the following shape:
{
  "summary": "brief summary",
  "artifacts": [
    {"type": "schema" | "api" | "diagram" | "adr", "title": "...", "content": "..."}
  ],
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}
Always be specific and opinionated. Justify trade-offs.\
"""

CHAT_PROMPT = """\
You are an expert software architect having a conversation. Respond in clear, \
well-structured natural language (use markdown formatting when helpful). \
Be specific, opinionated, and justify trade-offs. \
Do NOT respond with raw JSON—use prose, bullet points, code blocks, and headings.\
"""


class ArchitectureAgent(SDLCAgent):
    agent_type = AgentType.ARCHITECTURE
    system_prompt = SYSTEM_PROMPT
    chat_prompt = CHAT_PROMPT
    phase_key = "architecture"

    artifact_configs = [
        ArtifactConfig(type="schema", language="sql"),
        ArtifactConfig(type="api", language="yaml"),
        ArtifactConfig(type="diagram", language="mermaid"),
        ArtifactConfig(type="adr", language="markdown"),
    ]

    capabilities = [
        CapabilityContract(
            name="design",
            required_context_window=16_000,
            supports_tool_use=True,
        ),
    ]

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        self.tool_registry.register_many(create_workspace_tools(self.workspace_svc, "architecture"))
        self.tool_registry.register_many(create_delegation_tools("architecture"))
