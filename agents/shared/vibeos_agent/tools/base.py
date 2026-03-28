"""BaseTool ABC – every callable tool must extend this."""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any


class BaseTool(ABC):
    """Abstract base for all agent-callable tools.

    Subclasses must define ``name``, ``description``, ``parameters`` (JSON Schema)
    and implement ``execute``.
    """

    name: str
    description: str
    parameters: dict[str, Any] = {"type": "object", "properties": {}}

    @abstractmethod
    async def execute(self, **kwargs: Any) -> str:
        """Run the tool and return a string result for the LLM."""
        ...

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
