"""BaseTool ABC – every callable tool must extend this.

Mock support
~~~~~~~~~~~~
Set ``VIBEOS_MOCK_EXTERNAL=true`` to route tool execution through ``mock()``
instead of ``_execute()``.  Tools that interact with external services (GitLab,
CI/CD pipelines, Feishu …) override ``_execute`` for the real path and ``mock``
for a structured fake response, keeping the same tool-name / parameter contract.
Tools that only need a single code path can override ``execute`` directly —
mock dispatch is bypassed when ``execute`` is overridden in the subclass.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any


MOCK_EXTERNAL: bool = os.getenv("VIBEOS_MOCK_EXTERNAL", "").lower() in ("1", "true", "yes")


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

    **Two implementation strategies:**

    1. Simple tools — override ``execute()`` directly (legacy & recommended for
       tools that never need mock mode).
    2. External-service tools — override ``_execute()`` for the real path and
       ``mock()`` for a structured fake response.  The base ``execute()``
       dispatches between them based on ``VIBEOS_MOCK_EXTERNAL``.

    Subclasses must define ``name``, ``description``, ``parameters`` (JSON
    Schema).  Optionally set ``display_name`` for a human-friendly label.
    """

    name: str
    description: str
    display_name: str = ""
    parameters: dict[str, Any] = {"type": "object", "properties": {}}

    async def execute(self, **kwargs: Any) -> str:
        """Run the tool and return a string result for the LLM.

        Default implementation dispatches to ``mock()`` when
        ``VIBEOS_MOCK_EXTERNAL`` is set, falling back to ``_execute()``.
        Override this directly for tools that never need mock routing.
        """
        if MOCK_EXTERNAL:
            try:
                return await self.mock(**kwargs)
            except NotImplementedError:
                pass
        return await self._execute(**kwargs)

    async def _execute(self, **kwargs: Any) -> str:
        """Real implementation.  Override this (not ``execute``) when the tool
        also provides a ``mock()`` path."""
        raise NotImplementedError(f"{type(self).__name__} must implement _execute() or execute()")

    async def mock(self, **kwargs: Any) -> str:
        """Return a structured mock response.  Override in external-service
        tools so the SDLC workflow can run without live infrastructure."""
        raise NotImplementedError

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
