"""Testing Agent implementation using SDLCAgent base."""

from __future__ import annotations

from vibeos_agent import (
    AgentType,
    ArtifactConfig,
    CapabilityContract,
    SDLCAgent,
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


class TestingAgent(SDLCAgent):
    agent_type = AgentType.TESTING
    system_prompt = SYSTEM_PROMPT
    chat_prompt = CHAT_PROMPT
    phase_key = "testing"

    artifact_configs = [
        ArtifactConfig(type="test_plan", language="markdown"),
    ]

    capabilities = [
        CapabilityContract(
            name="testing",
            required_context_window=16_000,
        ),
    ]

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        self.tool_registry.register_many(create_workspace_tools(self.workspace_svc, "testing"))
        self.tool_registry.register_many(create_delegation_tools("testing"))
