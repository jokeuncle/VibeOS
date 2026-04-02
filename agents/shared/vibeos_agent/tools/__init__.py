"""VibeOS Tool Framework -- extensible tool registry for agent function calling."""

from .base import MOCK_EXTERNAL, BaseTool, ToolResult
from .mcp_provider import MCPServerConfig, MCPToolProvider
from .pm_tools import create_pm_tools
from .provider import StaticToolProvider, ToolDescriptor, ToolManager, ToolProvider
from .registry import ToolRegistry

__all__ = [
    "BaseTool",
    "MOCK_EXTERNAL",
    "MCPServerConfig",
    "MCPToolProvider",
    "StaticToolProvider",
    "ToolDescriptor",
    "ToolManager",
    "ToolProvider",
    "ToolRegistry",
    "ToolResult",
    "create_pm_tools",
]
