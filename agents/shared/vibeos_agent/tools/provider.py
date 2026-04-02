"""ToolProvider interface and ToolManager -- federated tool resolution."""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from .base import BaseTool, ToolResult

logger = logging.getLogger(__name__)

_MAX_TOOL_OUTPUT = 8000


@dataclass
class ToolDescriptor:
    """Portable description of a tool (provider-agnostic)."""

    name: str
    description: str
    parameters: dict[str, Any] = field(default_factory=lambda: {"type": "object", "properties": {}})
    provider_key: str = ""
    display_name: str = ""

    def to_openai_schema(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }


class ToolProvider(ABC):
    """Abstract source of callable tools.

    Concrete providers include static tools (``BaseTool``), MCP servers,
    DB-configured dynamic tools, and skill bundles.
    """

    provider_key: str = ""

    @abstractmethod
    async def list_tools(self) -> list[ToolDescriptor]:
        """Return descriptors for all tools this provider offers."""
        ...

    @abstractmethod
    async def execute(self, tool_name: str, arguments: dict[str, Any]) -> ToolResult:
        """Execute the named tool with the given arguments."""
        ...


class StaticToolProvider(ToolProvider):
    """Wraps the existing ``ToolRegistry`` as a :class:`ToolProvider`."""

    provider_key = "static"

    def __init__(self) -> None:
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        self._tools[tool.name] = tool

    def register_many(self, tools: list[BaseTool]) -> None:
        for t in tools:
            self.register(t)

    async def list_tools(self) -> list[ToolDescriptor]:
        return [
            ToolDescriptor(
                name=t.name,
                description=t.description,
                parameters=t.parameters,
                provider_key=self.provider_key,
                display_name=getattr(t, "display_name", "") or "",
            )
            for t in self._tools.values()
        ]

    async def execute(self, tool_name: str, arguments: dict[str, Any]) -> ToolResult:
        tool = self._tools.get(tool_name)
        if tool is None:
            return ToolResult.error(json.dumps({"error": f"Unknown tool: {tool_name}"}))

        try:
            result = await tool.execute(**arguments)
            if len(result) > _MAX_TOOL_OUTPUT:
                result = result[:_MAX_TOOL_OUTPUT] + "\n...(truncated)"
            return ToolResult.success(result)
        except Exception as exc:
            logger.exception("Tool %s execution failed", tool_name)
            return ToolResult.error(json.dumps({"error": f"Tool execution failed: {exc}"}))

    @property
    def has_tools(self) -> bool:
        return bool(self._tools)


class ToolManager:
    """Federates multiple :class:`ToolProvider` instances into a unified API.

    When the LLM returns a ``tool_call``, the manager routes it to the
    correct provider based on registration order (first provider that
    owns the tool name wins).
    """

    def __init__(self) -> None:
        self._providers: list[ToolProvider] = []
        self._tool_index: dict[str, ToolProvider] = {}

    def register_provider(self, provider: ToolProvider) -> None:
        self._providers.append(provider)

    def remove_providers(self, key_prefix: str) -> None:
        """Remove all providers whose provider_key starts with *key_prefix*."""
        self._providers = [p for p in self._providers if not p.provider_key.startswith(key_prefix)]
        self._tool_index = {
            k: v for k, v in self._tool_index.items()
            if not v.provider_key.startswith(key_prefix)
        }

    async def refresh_index(self) -> None:
        """Rebuild the name -> provider lookup from all providers."""
        self._tool_index.clear()
        for provider in self._providers:
            try:
                descriptors = await provider.list_tools()
                for desc in descriptors:
                    if desc.name not in self._tool_index:
                        self._tool_index[desc.name] = provider
            except Exception:
                logger.warning(
                    "Failed to list tools from provider %s",
                    provider.provider_key, exc_info=True,
                )

    async def get_schemas(self) -> list[dict[str, Any]]:
        """Return merged OpenAI-compatible tool schemas from all providers."""
        schemas: list[dict[str, Any]] = []
        seen: set[str] = set()
        for provider in self._providers:
            try:
                for desc in await provider.list_tools():
                    if desc.name not in seen:
                        schemas.append(desc.to_openai_schema())
                        seen.add(desc.name)
            except Exception:
                logger.warning(
                    "Failed to list tools from provider %s",
                    provider.provider_key, exc_info=True,
                )
        return schemas

    async def execute(self, name: str, arguments: dict[str, Any]) -> ToolResult:
        """Route execution to the owning provider."""
        provider = self._tool_index.get(name)
        if provider is None:
            await self.refresh_index()
            provider = self._tool_index.get(name)

        if provider is None:
            return ToolResult.error(json.dumps({"error": f"Unknown tool: {name}"}))

        return await provider.execute(name, arguments)

    @property
    def has_tools(self) -> bool:
        return bool(self._tool_index) or any(
            getattr(p, "has_tools", True) for p in self._providers
        )

    async def list_all_descriptors(self) -> list[ToolDescriptor]:
        """Return descriptors across all providers (for UI display)."""
        result: list[ToolDescriptor] = []
        seen: set[str] = set()
        for provider in self._providers:
            try:
                for desc in await provider.list_tools():
                    if desc.name not in seen:
                        result.append(desc)
                        seen.add(desc.name)
            except Exception:
                logger.warning("Failed to list tools from %s", provider.provider_key, exc_info=True)
        return result

    async def get_display_name(self, tool_name: str) -> str:
        """Resolve the display_name for *tool_name* from the owning provider."""
        for provider in self._providers:
            try:
                for desc in await provider.list_tools():
                    if desc.name == tool_name:
                        return desc.display_name or ""
            except Exception:
                pass
        return ""
