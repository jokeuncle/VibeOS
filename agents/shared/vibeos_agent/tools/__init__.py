"""VibeOS Tool Framework -- extensible tool registry for agent function calling."""

from .base import BaseTool, ToolResult
from .mcp_provider import MCPServerConfig, MCPToolProvider
from .provider import StaticToolProvider, ToolDescriptor, ToolManager, ToolProvider
from .registry import ToolRegistry

__all__ = [
    "BaseTool",
    "MCPServerConfig",
    "MCPToolProvider",
    "StaticToolProvider",
    "ToolDescriptor",
    "ToolManager",
    "ToolProvider",
    "ToolRegistry",
    "ToolResult",
]

# Pipeline tools available via: from vibeos_agent.tools.pipeline_tools import create_pipeline_tools
