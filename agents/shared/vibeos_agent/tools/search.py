"""Tool Search -- lazy-loading strategy inspired by Claude Code CLI.

When many tools are available (MCP servers, skills, static tools), sending
all schemas to the LLM wastes context tokens and degrades tool selection
accuracy.  Tool Search injects a single ``search_tools`` meta-tool whose
schema is tiny; the LLM calls it with a natural-language query and receives
only the matching tool schemas, which are then injected for subsequent turns.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, TYPE_CHECKING

from .base import BaseTool

if TYPE_CHECKING:
    from .provider import ToolDescriptor, ToolManager

logger = logging.getLogger(__name__)

_AUTO_THRESHOLD = 15


class ToolLoadStrategy:
    EAGER = "eager"
    LAZY = "lazy"
    AUTO = "auto"


class SearchToolsMeta(BaseTool):
    """Meta-tool: LLM calls this to discover available tools by capability."""

    name = "search_tools"
    description = (
        "Search for available tools by capability description. "
        "Returns matching tool schemas that you can then call directly. "
        "Use this when you need a specific capability but don't see the right tool."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language description of the capability needed, e.g. 'create a GitLab merge request'",
            },
        },
        "required": ["query"],
    }

    def __init__(self, manager: ToolManager) -> None:
        self._manager = manager

    async def execute(self, **kwargs: Any) -> str:
        query = kwargs.get("query", "")
        if not query:
            return json.dumps({"error": "query is required"})

        matches = await self._manager.search(query, limit=8)
        schemas = [m.to_openai_schema() for m in matches]
        return json.dumps({
            "matched_tools": len(schemas),
            "tools": schemas,
            "hint": "You can now call any of these tools directly.",
        }, ensure_ascii=False)


def _score_match(query: str, desc: ToolDescriptor) -> float:
    """Score how well a tool descriptor matches a search query."""
    query_lower = query.lower()
    tokens = re.split(r"[\s_\-/]+", query_lower)
    tokens = [t for t in tokens if len(t) > 1]
    if not tokens:
        return 0.0

    name_lower = desc.name.lower()
    desc_lower = desc.description.lower()
    display_lower = (desc.display_name or "").lower()
    combined = f"{name_lower} {desc_lower} {display_lower}"

    score = 0.0
    for token in tokens:
        if token in name_lower:
            score += 3.0
        if token in display_lower:
            score += 2.0
        if token in desc_lower:
            score += 1.0

    if query_lower in combined:
        score += 5.0

    return score
