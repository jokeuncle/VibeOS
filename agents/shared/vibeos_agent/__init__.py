"""vibeos-agent – shared framework for VibeOS domain agents."""

from .config import Config, config
from .models import (
    Activity,
    Agent,
    AgentEvent,
    AgentStatus,
    AgentTask,
    AgentType,
    Artifact,
    CapabilityContract,
    Message,
    Phase,
    PhaseStatus,
    PhaseType,
    RichAction,
    RichBlock,
    Task,
    Workspace,
)
from .protocol import (
    AGENT_PHASE_MAP,
    PHASE_CONTEXT,
    BaseAgent,
    KnowledgeClient,
    LLMGatewayClient,
    MemoryClient,
    RAGClient,
    WorkspaceClient,
    WSGatewayClient,
)
from .session import SessionManager
from .tools import BaseTool, ToolRegistry

__all__ = [
    "Activity",
    "Agent",
    "AgentEvent",
    "AgentStatus",
    "AgentTask",
    "AgentType",
    "Artifact",
    "AGENT_PHASE_MAP",
    "BaseAgent",
    "BaseTool",
    "CapabilityContract",
    "Config",
    "KnowledgeClient",
    "LLMGatewayClient",
    "MemoryClient",
    "PHASE_CONTEXT",
    "RAGClient",
    "Message",
    "Phase",
    "PhaseStatus",
    "PhaseType",
    "RichAction",
    "RichBlock",
    "SessionManager",
    "Task",
    "ToolRegistry",
    "WSGatewayClient",
    "Workspace",
    "WorkspaceClient",
    "config",
]

# Lazy import for adapters — available via vibeos_agent.adapters
# Usage: from vibeos_agent.adapters import AdapterRegistry, GitLabPipelineAdapter
