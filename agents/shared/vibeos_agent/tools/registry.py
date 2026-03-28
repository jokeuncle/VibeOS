"""ToolRegistry – manages tool registration and dispatches execution."""

from __future__ import annotations

import json
import logging
from typing import Any

from .base import BaseTool

logger = logging.getLogger(__name__)

_MAX_TOOL_OUTPUT = 8000


class ToolRegistry:
    """Extensible registry for agent-callable tools.

    Agents register tools at init time; the registry provides schemas to the LLM
    and dispatches ``tool_calls`` back to the appropriate handler.
    """

    def __init__(self) -> None:
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        self._tools[tool.name] = tool

    def register_many(self, tools: list[BaseTool]) -> None:
        for t in tools:
            self.register(t)

    def get_schemas(self) -> list[dict[str, Any]]:
        """Return OpenAI-compatible tool descriptors for all registered tools."""
        return [t.schema() for t in self._tools.values()]

    @property
    def has_tools(self) -> bool:
        return bool(self._tools)

    async def execute(self, name: str, arguments: str | dict[str, Any]) -> str:
        """Execute a tool by name with the given arguments string or dict."""
        tool = self._tools.get(name)
        if tool is None:
            return json.dumps({"error": f"Unknown tool: {name}"})

        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments) if arguments else {}
            except json.JSONDecodeError:
                return json.dumps({"error": f"Invalid JSON arguments: {arguments}"})

        try:
            result = await tool.execute(**arguments)
            if len(result) > _MAX_TOOL_OUTPUT:
                result = result[:_MAX_TOOL_OUTPUT] + "\n...(truncated)"
            return result
        except Exception as exc:
            logger.exception("Tool %s execution failed", name)
            return json.dumps({"error": f"Tool execution failed: {exc}"})
