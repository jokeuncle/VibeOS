"""BaseTool ABC -- every callable tool must extend this.

All tools run their real implementation.  There is no mock dispatch; if an
external service is unavailable the tool should return a clear error with
guidance on how to configure it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ToolResult:
    """Structured result from a tool execution."""

    output: str
    ok: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)

    @staticmethod
    def success(output: str, **meta: Any) -> ToolResult:
        return ToolResult(output=output, ok=True, metadata=meta)

    @staticmethod
    def error(output: str, **meta: Any) -> ToolResult:
        return ToolResult(output=output, ok=False, metadata=meta)


class BaseTool:
    """Base for all agent-callable tools.

    Subclasses must define ``name``, ``description``, ``parameters`` (JSON
    Schema) and override either ``execute()`` or ``_execute()``.
    Optionally set ``display_name`` for a human-friendly label.

    Set ``requires_confirmation = True`` on tools that create, delete, or
    modify persistent resources.  The tool loop will emit a confirmation
    event instead of executing immediately and wait for user approval.
    """

    name: str
    description: str
    display_name: str = ""
    parameters: dict[str, Any] = {"type": "object", "properties": {}}
    requires_confirmation: bool = False

    async def execute(self, **kwargs: Any) -> str:
        """Run the tool and return a string result for the LLM."""
        return await self._execute(**kwargs)

    async def _execute(self, **kwargs: Any) -> str:
        """Override this to implement the tool logic."""
        raise NotImplementedError(f"{type(self).__name__} must implement _execute() or execute()")

    def schema(self) -> dict[str, Any]:
        """Return the OpenAI function-calling tool descriptor."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    @staticmethod
    def _json_result(data: Any) -> str:
        """Convenience: serialize a dict/list result to compact JSON."""
        return json.dumps(data, ensure_ascii=False, default=str)
