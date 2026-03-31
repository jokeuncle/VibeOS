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
from .registry import (
    AgentManifest,
    CapabilityDef,
    IntentDef,
    RegistryClient,
    ResolvedTemplate,
    TaskTemplateDef,
    load_manifest_from_yaml,
)
from .session import SessionManager
from .tools import BaseTool, ToolRegistry

__all__ = [
    "Activity",
    "Agent",
    "AgentEvent",
    "AgentManifest",
    "AgentStatus",
    "AgentTask",
    "AgentType",
    "Artifact",
    "AGENT_PHASE_MAP",
    "BaseAgent",
    "BaseTool",
    "CapabilityContract",
    "CapabilityDef",
    "Config",
    "IntentDef",
    "KnowledgeClient",
    "LLMGatewayClient",
    "MemoryClient",
    "PHASE_CONTEXT",
    "RAGClient",
    "Message",
    "Phase",
    "PhaseStatus",
    "PhaseType",
    "RegistryClient",
    "ResolvedTemplate",
    "RichAction",
    "RichBlock",
    "SessionManager",
    "Task",
    "TaskTemplateDef",
    "ToolRegistry",
    "load_manifest_from_yaml",
    "WSGatewayClient",
    "Workspace",
    "WorkspaceClient",
    "config",
]

# Lazy import for adapters — available via vibeos_agent.adapters
# Usage: from vibeos_agent.adapters import AdapterRegistry, GitLabPipelineAdapter
