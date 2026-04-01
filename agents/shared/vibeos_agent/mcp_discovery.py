"""MCP auto-discovery: connect to configured MCP servers, enumerate their
tools, and register each tool as a Capability in the unified registry.

Usage::

    from vibeos_agent.mcp_discovery import discover_and_register_mcp_tools
    caps = await discover_and_register_mcp_tools(workspace_client, registry)
"""

from __future__ import annotations

import logging
from typing import Any

from .clients.workspace import WorkspaceClient
from .registry import CapabilityDef, RegistryClient
from .tools.mcp_provider import MCPServerConfig, MCPToolProvider

logger = logging.getLogger(__name__)


async def discover_and_register_mcp_tools(
    workspace_svc: WorkspaceClient,
    registry: RegistryClient,
    workspace_id: str | None = None,
) -> list[CapabilityDef]:
    """Discover tools from all enabled MCP servers and register them.

    Returns the list of ``CapabilityDef`` instances that were upserted.
    """
    if not workspace_id:
        return []

    try:
        servers = await workspace_svc.list_mcp_servers(workspace_id)
    except Exception:
        logger.warning("Failed to list MCP servers for ws=%s", workspace_id, exc_info=True)
        return []

    defs: list[CapabilityDef] = []
    for srv in servers:
        try:
            config = MCPServerConfig.from_db_row(srv)
        except Exception:
            logger.warning("Invalid MCP server config: %s", srv.get("name", "?"), exc_info=True)
            continue
        if not config.enabled:
            continue
        provider = MCPToolProvider(config)
        try:
            tools = await provider.list_tools()
        except Exception:
            logger.warning("MCP discovery failed for server %s", config.name, exc_info=True)
            await _safe_close(provider)
            continue

        for tool in tools:
            cap = CapabilityDef(
                name=f"mcp.{config.name}.{tool.name}",
                provider=f"mcp:{config.name}",
                description=tool.description or "",
                transport=config.transport,
                source_type="mcp",
                mcp_config=_build_mcp_config(config),
                input_schema=tool.parameters,
                workspace_id=workspace_id,
                source="mcp",
            )
            try:
                await registry.upsert_capability(cap)
                defs.append(cap)
            except Exception:
                logger.warning("Failed to register MCP tool %s", cap.name, exc_info=True)

        await _safe_close(provider)

    logger.info("MCP discovery: registered %d tools from %d servers", len(defs), len(servers))
    return defs


def _build_mcp_config(cfg: MCPServerConfig) -> dict[str, Any]:
    """Serialize the connection details needed to reconnect at runtime."""
    d: dict[str, Any] = {"transport": cfg.transport}
    if cfg.command:
        d["command"] = cfg.command
        d["args"] = cfg.args
    if cfg.url:
        d["url"] = cfg.url
    if cfg.env:
        d["env"] = cfg.env
    if cfg.headers:
        d["headers"] = cfg.headers
    return d


async def check_mcp_health(
    workspace_svc: WorkspaceClient,
    registry: RegistryClient,
    workspace_id: str | None = None,
) -> dict[str, str]:
    """Probe each MCP server and update capability health in the registry.

    Returns a mapping of ``server_name -> health_status``.
    """
    if not workspace_id:
        return {}

    try:
        servers = await workspace_svc.list_mcp_servers(workspace_id)
    except Exception:
        logger.warning("Health check: cannot list MCP servers for ws=%s", workspace_id, exc_info=True)
        return {}

    results: dict[str, str] = {}
    for srv in servers:
        try:
            config = MCPServerConfig.from_db_row(srv)
        except Exception:
            logger.warning("Invalid MCP server config: %s", srv.get("name", "?"), exc_info=True)
            continue
        if not config.enabled:
            continue

        health = "healthy"
        provider = MCPToolProvider(config)
        try:
            await provider.list_tools()
        except Exception:
            health = "unhealthy"
            logger.debug("MCP health check failed for %s", config.name, exc_info=True)
        finally:
            await _safe_close(provider)

        results[config.name] = health

        try:
            await registry.heartbeat(
                f"mcp.{config.name}", f"mcp:{config.name}", health,
            )
        except Exception:
            logger.debug("Heartbeat update failed for mcp.%s", config.name, exc_info=True)

    return results


async def _safe_close(provider: MCPToolProvider) -> None:
    try:
        await provider.close()
    except Exception:
        pass
