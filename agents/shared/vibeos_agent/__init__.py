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
from .app import create_agent_app
from .container import ClientContainer
from .sandbox_agent import SandboxAgent
from .sdlc_agent import ArtifactConfig, SDLCAgent
from .skills import Skill, SkillRegistry, SkillToolProvider
from .user_context import UserContext, UserContextClient
from .graph_executor import GraphExecutor, ParsedGraphDef, HAS_LANGGRAPH
from .session import SessionManager
from .sse import sse_event, sse_delta, sse_done, sse_session_start, sse_session_complete, sse_session_error
from .telemetry import get_meter, get_tracer, init_telemetry
from .tools import BaseTool, MCPServerConfig, MCPToolProvider, StaticToolProvider, ToolDescriptor, ToolManager, ToolProvider

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
    "ClientContainer",
    "Config",
    "GraphExecutor",
    "HAS_LANGGRAPH",
    "IntentDef",
    "KnowledgeClient",
    "LLMGatewayClient",
    "MemoryClient",
    "PHASE_CONTEXT",
    "ParsedGraphDef",
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
    "ToolDescriptor",
    "ToolManager",
    "ToolProvider",
    
    "SandboxAgent",
    "SDLCAgent",
    "ArtifactConfig",
    "Skill",
    "SkillRegistry",
    "SkillToolProvider",
    "StaticToolProvider",
    "UserContext",
    "UserContextClient",
    "MCPServerConfig",
    "MCPToolProvider",
    "create_agent_app",
    "get_meter",
    "get_tracer",
    "init_telemetry",
    "load_manifest_from_yaml",
    "WSGatewayClient",
    "Workspace",
    "WorkspaceClient",
    "config",
    "sse_event",
    "sse_delta",
    "sse_done",
    "sse_session_start",
    "sse_session_complete",
    "sse_session_error",
]

# Lazy import for adapters — available via vibeos_agent.adapters
# Usage: from vibeos_agent.adapters import AdapterRegistry, GitLabPipelineAdapter
