"""VibeOS Tool Framework -- unified tool system for agent function calling.

ToolManager is the single entry point.  Register BaseTool instances directly
on it; external providers (MCP, skills) are added via register_provider().
"""

from .base import BaseTool, ToolResult
from .cos_tools import create_cos_tools
from .mcp_provider import MCPServerConfig, MCPToolProvider
from .pm_tools import create_pm_tools
from .provider import StaticToolProvider, ToolDescriptor, ToolManager, ToolProvider
from .search import SearchToolsMeta, ToolLoadStrategy

__all__ = [
    "BaseTool",
    "MCPServerConfig",
    "MCPToolProvider",
    "SearchToolsMeta",
    "StaticToolProvider",
    "ToolDescriptor",
    "ToolLoadStrategy",
    "ToolManager",
    "ToolProvider",
    "ToolResult",
    "create_cos_tools",
    "create_pm_tools",
]
