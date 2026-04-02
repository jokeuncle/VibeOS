"""Design Agent implementation using SDLCAgent base."""

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
You are an expert UI/UX designer. You help teams create beautiful, usable, and \
accessible interfaces with strong design systems.

Your responsibilities:
- Make design decisions (layout, navigation, interaction patterns)
- Create wireframes as styled HTML mockups with inline CSS
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
  "artifacts": [
    {
      "type": "design_spec",
      "title": "Design Specification",
      "content": "Full markdown design specification document..."
    },
    {
      "type": "design_image",
      "title": "Wireframe - Screen Name",
      "content": "<!DOCTYPE html><html>...(complete HTML wireframe with inline CSS)...</html>"
    }
  ],
  "tasks": [
    {"title": "...", "description": "..."}
  ]
}

IMPORTANT for design_image artifacts:
- Each wireframe must be a COMPLETE, self-contained HTML document
- Use inline CSS with modern design (flexbox, grid, subtle shadows, rounded corners)
- Use a clean color palette matching the style guide
- Include placeholder content that matches the actual requirement
- Make the HTML responsive and visually polished

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
        ArtifactConfig(type="design_image", language="html"),
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
        from vibeos_agent.tools.cos_tools import create_cos_tools
        self._static_provider.register_many(create_workspace_tools(self.workspace_svc, "design"))
        self._static_provider.register_many(create_delegation_tools("design"))
        self._static_provider.register_many(create_cos_tools())

    async def _post_process(
        self,
        task: AgentTask,
        structured: dict[str, Any],
        rich_blocks: list[RichBlock],
    ) -> None:
        """Upload HTML wireframes to COS for direct browser preview."""
        from vibeos_agent.cos import get_cos_uploader

        uploader = get_cos_uploader()
        if uploader is None:
            return

        for art in structured.get("artifacts", []):
            if art.get("type") != "design_image":
                continue
            content = art.get("content", "")
            title = art.get("title", "wireframe")
            if not content:
                continue
            try:
                url = uploader.upload_artifact(
                    task.workspace_id, "design_image", title, content,
                )
                meta = json.dumps({"fileUrl": url})
                await self._save_artifact(
                    task.workspace_id,
                    artifact_type="design_image",
                    title=title,
                    content=content,
                    metadata=meta,
                )
            except Exception:
                pass
