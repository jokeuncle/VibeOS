"""MCPToolProvider -- exposes MCP server tools via the ToolProvider interface.

Supports three MCP transports:
- **stdio**: spawn a subprocess and communicate via stdin/stdout JSON-RPC
- **sse**: connect to a Server-Sent Events endpoint
- **streamable-http**: connect via HTTP with streaming support

Requires the ``mcp`` extra::

    pip install vibeos-agent[mcp]
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Literal

from pydantic import BaseModel, Field

from .base import ToolResult
from .provider import ToolDescriptor, ToolProvider

logger = logging.getLogger(__name__)


class MCPServerConfig(BaseModel):
    """Configuration for a single MCP server (DB-backed, UI-configurable)."""

    id: str = ""
    name: str
    transport: Literal["stdio", "sse", "streamable-http"]
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    url: str | None = None
    env: dict[str, str] = Field(default_factory=dict)
    headers: dict[str, str] = Field(default_factory=dict)
    enabled: bool = True
    workspace_id: str | None = None

    @classmethod
    def from_db_row(cls, row: dict[str, Any]) -> "MCPServerConfig":
        """Construct from a workspace-svc MCP server API response row."""
        cfg = row.get("config", {})
        if isinstance(cfg, str):
            import json as _json
            cfg = _json.loads(cfg)
        return cls(
            id=row.get("id", ""),
            name=row.get("name", ""),
            transport=row.get("transport", "stdio"),
            command=cfg.get("command"),
            args=cfg.get("args", []),
            url=cfg.get("url"),
            env=cfg.get("env", {}),
            headers=cfg.get("headers", {}),
            enabled=row.get("enabled", True),
            workspace_id=row.get("workspaceId") or row.get("workspace_id"),
        )


class MCPToolProvider(ToolProvider):
    """Wraps a single MCP server as a :class:`ToolProvider`.

    Lazily initialises the MCP client session on first use.
    """

    def __init__(self, config: MCPServerConfig) -> None:
        self.provider_key = f"mcp:{config.name}"
        self._config = config
        self._session = None
        self._transport_ctx = None
        self._session_ctx = None
        self._tools_cache: list[ToolDescriptor] | None = None

    async def _ensure_session(self) -> None:
        if self._session is not None:
            return

        try:
            from mcp import ClientSession, StdioServerParameters
            from mcp.client.stdio import stdio_client
            from mcp.client.sse import sse_client
            from mcp.client.streamable_http import streamablehttp_client
        except ImportError as exc:
            raise ImportError(
                "mcp package is required for MCPToolProvider. "
                "Install with: pip install vibeos-agent[mcp]"
            ) from exc

        cfg = self._config
        if cfg.transport == "stdio":
            if not cfg.command:
                raise ValueError(f"MCP server {cfg.name}: stdio transport requires 'command'")
            params = StdioServerParameters(
                command=cfg.command,
                args=cfg.args,
                env={**cfg.env} if cfg.env else None,
            )
            self._transport_ctx = stdio_client(params)
        elif cfg.transport == "sse":
            if not cfg.url:
                raise ValueError(f"MCP server {cfg.name}: sse transport requires 'url'")
            self._transport_ctx = sse_client(cfg.url, headers=cfg.headers or None)
        elif cfg.transport == "streamable-http":
            if not cfg.url:
                raise ValueError(f"MCP server {cfg.name}: streamable-http transport requires 'url'")
            self._transport_ctx = streamablehttp_client(cfg.url, headers=cfg.headers or None)
        else:
            raise ValueError(f"Unknown MCP transport: {cfg.transport}")

        transport = await self._transport_ctx.__aenter__()
        read_stream, write_stream = transport[0], transport[1]
        self._session_ctx = ClientSession(read_stream, write_stream)
        self._session = await self._session_ctx.__aenter__()
        await self._session.initialize()
        logger.info("MCP session initialized for %s (%s)", cfg.name, cfg.transport)

    async def list_tools(self) -> list[ToolDescriptor]:
        if self._tools_cache is not None:
            return self._tools_cache

        await self._ensure_session()
        result = await self._session.list_tools()
        descriptors = [
            ToolDescriptor(
                name=tool.name,
                description=tool.description or "",
                parameters=tool.inputSchema if hasattr(tool, "inputSchema") else {},
                provider_key=self.provider_key,
            )
            for tool in result.tools
        ]
        self._tools_cache = descriptors
        return descriptors

    async def execute(self, tool_name: str, arguments: dict[str, Any]) -> ToolResult:
        await self._ensure_session()
        try:
            result = await self._session.call_tool(tool_name, arguments=arguments)
            content_parts = []
            for block in result.content:
                if hasattr(block, "text"):
                    content_parts.append(block.text)
                else:
                    content_parts.append(str(block))
            output = "\n".join(content_parts)
            if result.isError:
                return ToolResult.error(output)
            return ToolResult.success(output)
        except Exception as exc:
            logger.exception("MCP tool %s execution failed", tool_name)
            return ToolResult.error(json.dumps({"error": f"MCP tool failed: {exc}"}))

    async def list_resources(self) -> list[dict[str, Any]]:
        """List MCP resources (for context injection)."""
        await self._ensure_session()
        try:
            result = await self._session.list_resources()
            return [
                {"uri": r.uri, "name": r.name, "description": getattr(r, "description", "")}
                for r in result.resources
            ]
        except Exception:
            logger.debug("list_resources not supported by %s", self._config.name, exc_info=True)
            return []

    async def list_prompts(self) -> list[dict[str, Any]]:
        """List MCP prompts (for skill-like behavior)."""
        await self._ensure_session()
        try:
            result = await self._session.list_prompts()
            return [
                {"name": p.name, "description": getattr(p, "description", "")}
                for p in result.prompts
            ]
        except Exception:
            logger.debug("list_prompts not supported by %s", self._config.name, exc_info=True)
            return []

    def invalidate_cache(self) -> None:
        self._tools_cache = None

    async def close(self) -> None:
        if self._session_ctx is not None:
            try:
                await self._session_ctx.__aexit__(None, None, None)
            except Exception:
                logger.debug("Error closing MCP session", exc_info=True)
            self._session = None
            self._session_ctx = None
        if self._transport_ctx is not None:
            try:
                await self._transport_ctx.__aexit__(None, None, None)
            except Exception:
                logger.debug("Error closing MCP transport", exc_info=True)
            self._transport_ctx = None
