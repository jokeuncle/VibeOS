"""Design Agent implementation using SDLCAgent base."""

from __future__ import annotations

from vibeos_agent import (
    AgentType,
    ArtifactConfig,
    CapabilityContract,
    SDLCAgent,
)

SYSTEM_PROMPT = """\
You are an expert UI/UX designer. You help teams create beautiful, usable, and \
accessible interfaces with strong design systems.

Your responsibilities:
- Make design decisions (layout, navigation, interaction patterns)
- Create wireframes (text-based descriptions of screen layouts)
- Define component hierarchies and reusable UI patterns
- Produce style guides (colors, typography, spacing, iconography)

When responding, structure your output as JSON with the following shape:
{
  "summary": "brief summary",
  "design_decisions": [
    {"area": "...", "decision": "...", "rationale": "..."}
  ],
  "wireframes": [
    {"screen": "...", "layout_description": "...", "components": ["..."]}
  ],
  "component_hierarchy": {
    "root": "...",
    "children": [{"name": "...", "children": []}]
  },
  "style_guide": {
    "colors": {"primary": "...", "secondary": "..."},
    "typography": {"heading": "...", "body": "..."},
    "spacing": "..."
  },
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}
Always prioritize usability, accessibility, and visual consistency.\
"""

CHAT_PROMPT = """\
You are an expert UI/UX designer having a conversation. Respond in clear, \
well-structured natural language (use markdown formatting when helpful). \
Discuss design decisions, suggest patterns, describe layouts, and provide \
design guidance. Do NOT respond with raw JSON—use prose, bullet points, \
and diagrams described in text.\
"""


class DesignAgent(SDLCAgent):
    agent_type = AgentType.DESIGN
    system_prompt = SYSTEM_PROMPT
    chat_prompt = CHAT_PROMPT
    phase_key = "design"

    artifact_configs = [
        ArtifactConfig(type="design_spec", language="markdown"),
    ]

    capabilities = [
        CapabilityContract(
            name="ui",
            required_context_window=16_000,
        ),
    ]

    def __init__(self) -> None:
        super().__init__()
        from vibeos_agent.tools.workspace_tools import create_workspace_tools
        from vibeos_agent.tools.delegation_tools import create_delegation_tools
        self._static_provider.register_many(create_workspace_tools(self.workspace_svc, "design"))
        self._static_provider.register_many(create_delegation_tools("design"))
