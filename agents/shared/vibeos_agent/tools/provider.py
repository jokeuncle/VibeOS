"""ToolProvider interface and ToolManager -- the single entry point for all
tool operations in VibeOS agents.

ToolManager owns a built-in ``StaticToolProvider`` for ``BaseTool`` instances
and federates any number of external ``ToolProvider`` sources (MCP servers,
skill bundles, etc.).  All agents register tools directly on ToolManager;
there is no separate ToolRegistry.
"""

from __future__ import annotations

import json
import logging
import time as _time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from .base import BaseTool, ToolResult
from .search import ToolLoadStrategy, SearchToolsMeta, score_tools, _AUTO_THRESHOLD

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
    requires_confirmation: bool = False

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
    """Abstract source of callable tools (MCP servers, skill bundles, etc.)."""

    provider_key: str = ""

    @abstractmethod
    async def list_tools(self) -> list[ToolDescriptor]:
        ...

    @abstractmethod
    async def execute(self, tool_name: str, arguments: dict[str, Any]) -> ToolResult:
        ...

    async def list_resources(self) -> list[dict[str, Any]]:
        """MCP-style resources; overridden by providers that support discovery."""
        return []


class StaticToolProvider(ToolProvider):
    """Hosts ``BaseTool`` instances as a :class:`ToolProvider`."""

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
                requires_confirmation=getattr(t, "requires_confirmation", False),
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
    """Single entry point for all tool operations.

    Owns a built-in :class:`StaticToolProvider` for ``BaseTool`` instances
    and federates additional :class:`ToolProvider` sources (MCP, skills).
    When the LLM returns a ``tool_call``, the manager routes it to the
    correct provider (first match wins).

    Graph nodes (``agentic``, ``mcp capability``) also use this same
    ToolManager instance, so the tool namespace is unified.
    """

    def __init__(self, *, strategy: str = ToolLoadStrategy.AUTO) -> None:
        self._static = StaticToolProvider()
        self._providers: list[ToolProvider] = [self._static]
        self._tool_index: dict[str, ToolProvider] = {}
        self._display_name_cache: dict[str, str] = {}
        self._ws_loaded: dict[str, float] = {}
        self._strategy = strategy
        self._search_tool_registered = False

    # -- Direct BaseTool registration (built-in static provider) ---------------

    def register(self, tool: BaseTool) -> None:
        """Register a single ``BaseTool`` instance."""
        self._static.register(tool)

    def register_many(self, tools: list[BaseTool]) -> None:
        """Register multiple ``BaseTool`` instances at once."""
        self._static.register_many(tools)

    # -- External provider management ------------------------------------------

    def register_provider(self, provider: ToolProvider) -> None:
        """Add an external :class:`ToolProvider` (MCP, skill, etc.)."""
        self._providers.append(provider)

    def remove_providers(self, key_prefix: str) -> None:
        """Remove all providers whose provider_key starts with *key_prefix*."""
        removed_tools = {
            k for k, v in self._tool_index.items()
            if v.provider_key.startswith(key_prefix)
        }
        self._providers = [
            p for p in self._providers
            if p is self._static or not p.provider_key.startswith(key_prefix)
        ]
        self._tool_index = {
            k: v for k, v in self._tool_index.items()
            if not v.provider_key.startswith(key_prefix)
        }
        for name in removed_tools:
            self._display_name_cache.pop(name, None)

    # -- Index & schema --------------------------------------------------------

    async def refresh_index(self) -> None:
        """Rebuild the name -> provider lookup from all providers."""
        self._tool_index.clear()
        self._display_name_cache.clear()
        for provider in self._providers:
            try:
                descriptors = await provider.list_tools()
                for desc in descriptors:
                    if desc.name not in self._tool_index:
                        self._tool_index[desc.name] = provider
                    if desc.display_name and desc.name not in self._display_name_cache:
                        self._display_name_cache[desc.name] = desc.display_name
            except Exception:
                logger.warning(
                    "Failed to list tools from provider %s",
                    provider.provider_key, exc_info=True,
                )

    async def get_schemas(self, *, force_eager: bool = False) -> list[dict[str, Any]]:
        """Return OpenAI-compatible tool schemas.

        When strategy is ``lazy`` (or ``auto`` with many tools), only the
        ``search_tools`` meta-tool schema is returned.  The LLM uses it to
        discover real tools on demand, keeping the initial context small.
        """
        all_descriptors = await self._all_descriptors()
        use_lazy = self._should_use_lazy(len(all_descriptors)) and not force_eager

        if use_lazy:
            self._ensure_search_tool()
            return [SearchToolsMeta(self).schema()]

        schemas: list[dict[str, Any]] = []
        seen: set[str] = set()
        for desc in all_descriptors:
            if desc.name not in seen:
                schemas.append(desc.to_openai_schema())
                seen.add(desc.name)
        return schemas

    def _should_use_lazy(self, tool_count: int) -> bool:
        if self._strategy == ToolLoadStrategy.LAZY:
            return True
        if self._strategy == ToolLoadStrategy.EAGER:
            return False
        return tool_count > _AUTO_THRESHOLD

    def _ensure_search_tool(self) -> None:
        """Register the search_tools meta-tool once."""
        if not self._search_tool_registered:
            self._static.register(SearchToolsMeta(self))
            self._search_tool_registered = True

    async def search(self, query: str, *, limit: int = 8) -> list[ToolDescriptor]:
        """Search all registered tools by natural-language query.

        Uses BM25-inspired multilingual scoring with CJK tokenization,
        synonym expansion, and field-weighted IDF ranking.
        """
        descriptors = await self._all_descriptors()
        candidates = [d for d in descriptors if d.name != "search_tools"]
        return score_tools(query, candidates, limit=limit)

    async def _all_descriptors(self) -> list[ToolDescriptor]:
        """Collect descriptors from all providers (de-duped, ordered)."""
        result: list[ToolDescriptor] = []
        seen: set[str] = set()
        for provider in self._providers:
            try:
                for desc in await provider.list_tools():
                    if desc.name not in seen:
                        result.append(desc)
                        seen.add(desc.name)
            except Exception:
                logger.warning(
                    "Failed to list tools from provider %s",
                    provider.provider_key, exc_info=True,
                )
        return result

    # -- Execution -------------------------------------------------------------

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
        return self._static.has_tools or bool(self._tool_index) or any(
            getattr(p, "has_tools", True)
            for p in self._providers
            if p is not self._static
        )

    # -- Introspection ---------------------------------------------------------

    async def list_all_descriptors(self) -> list[ToolDescriptor]:
        """Return descriptors across all providers (for UI / graph display)."""
        return await self._all_descriptors()

    async def get_display_name(self, tool_name: str) -> str:
        """Resolve the display_name for *tool_name*, using cache when available."""
        if tool_name in self._display_name_cache:
            return self._display_name_cache[tool_name]
        await self.refresh_index()
        return self._display_name_cache.get(tool_name, "")

    async def tool_requires_confirmation(self, tool_name: str) -> bool:
        """Check whether *tool_name* is flagged for user confirmation."""
        provider = self._tool_index.get(tool_name)
        if provider is None:
            await self.refresh_index()
            provider = self._tool_index.get(tool_name)
        if provider is None:
            return False
        if isinstance(provider, StaticToolProvider):
            tool = provider._tools.get(tool_name)
            return getattr(tool, "requires_confirmation", False) if tool else False
        for desc in await provider.list_tools():
            if desc.name == tool_name:
                return desc.requires_confirmation
        return False

    # -- Workspace-scoped provider lifecycle -----------------------------------

    async def ensure_workspace_providers(
        self,
        workspace_client,
        workspace_id: str,
        *,
        ttl: float = 300,
    ) -> None:
        """Load (or refresh after *ttl* seconds) MCP and Skill providers for
        a workspace.  Single path for registering workspace-scoped providers.
        """
        ts = self._ws_loaded.get(workspace_id)
        if ts is not None and (_time.monotonic() - ts) < ttl:
            return

        self.remove_providers(f"mcp:{workspace_id}")
        self.remove_providers(f"skill:{workspace_id}")

        mcp_providers = await self._load_mcp(workspace_client, workspace_id)
        await self._load_skills(workspace_client, workspace_id)

        if mcp_providers:
            from .mcp_provider import ReadMCPResourceTool
            self.register(ReadMCPResourceTool(mcp_providers))

        self._ws_loaded[workspace_id] = _time.monotonic()

    async def _load_mcp(self, workspace_client, workspace_id: str) -> list:
        from .mcp_provider import MCPServerConfig, MCPToolProvider

        providers: list = []
        try:
            servers = await workspace_client.list_mcp_servers(workspace_id)
            for row in servers or []:
                if not row.get("enabled", True):
                    continue
                try:
                    cfg = MCPServerConfig.from_db_row(row)
                    prov = MCPToolProvider(cfg)
                    prov.provider_key = f"mcp:{workspace_id}:{cfg.name}"
                    self.register_provider(prov)
                    providers.append(prov)
                except Exception:
                    logger.debug("Skip MCP server %s", row.get("name", "?"), exc_info=True)
        except Exception:
            logger.debug("Failed to load MCP servers ws=%s", workspace_id, exc_info=True)
        return providers

    async def _load_skills(self, workspace_client, workspace_id: str) -> None:
        from ..skills import Skill, SkillRegistry, SkillToolProvider

        try:
            db_skills = await workspace_client.list_skills(workspace_id)
            if not db_skills:
                return
            registry = SkillRegistry()
            for s in db_skills:
                registry.register(Skill.from_db_config(
                    s.get("config", {}),
                    id=s.get("id", ""),
                    name=s.get("name", ""),
                    description=s.get("description", ""),
                    version=s.get("version", "1.0"),
                    enabled=s.get("enabled", True),
                ))
            skill_prov = SkillToolProvider(registry)
            skill_prov.provider_key = f"skill:{workspace_id}"
            self.register_provider(skill_prov)
        except Exception:
            logger.debug("Failed to load skills ws=%s", workspace_id, exc_info=True)
