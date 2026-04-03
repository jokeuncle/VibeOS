"""vibeos-agent – shared framework for VibeOS domain agents."""

from .config import Config, config
from .models import (
    Activity,
    Agent,
    AgentEvent,
    AgentStatus,
    AgentTask,
    AgentType,
    ApprovalStatus,
    Artifact,
    CapabilityContract,
    Message,
    Phase,
    PhaseContract,
    PhaseStatus,
    PhaseType,
    RichAction,
    RichBlock,
    Task,
    Workspace,
)
from .phases import (
    AGENT_PHASE_MAP,
    DEFAULT_PHASE_ORDER,
    DEFAULT_PROJECT_GRAPH,
    PHASE_CONTEXT,
    PHASE_CONTRACTS,
    PHASE_TOOL_HINTS,
    agent_for_phase,
    phase_for_agent,
    upstream_phases,
)
from .protocol import (
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
from .builtin_skills import BUILTIN_SKILLS, SDLC_ARTIFACT_DISCIPLINE, REQUIREMENT_PLAYBOOK, GITLAB_COMMIT_WORKFLOW
from .user_context import UserContext, UserContextClient
from .conversation import ConversationEngine, ConversationRequest
from .graph_executor import GraphExecutor, ParsedGraphDef, HAS_LANGGRAPH
from .session import SessionManager
from .sse import sse_event, sse_delta, sse_done, sse_session_start, sse_session_complete, sse_session_error
from .telemetry import get_meter, get_tracer, init_telemetry
from .tools import BaseTool, MCPServerConfig, MCPToolProvider, StaticToolProvider, ToolDescriptor, ToolManager, ToolProvider, create_pm_tools

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
    "ApprovalStatus",
    "BaseAgent",
    "BaseTool",
    "CapabilityContract",
    "CapabilityDef",
    "ClientContainer",
    "Config",
    "ConversationEngine",
    "ConversationRequest",
    "GraphExecutor",
    "HAS_LANGGRAPH",
    "IntentDef",
    "KnowledgeClient",
    "LLMGatewayClient",
    "MemoryClient",
    "DEFAULT_PHASE_ORDER",
    "DEFAULT_PROJECT_GRAPH",
    "PHASE_CONTEXT",
    "PHASE_CONTRACTS",
    "PHASE_TOOL_HINTS",
    "ParsedGraphDef",
    "PhaseContract",
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
    "BUILTIN_SKILLS",
    "SDLC_ARTIFACT_DISCIPLINE",
    "REQUIREMENT_PLAYBOOK",
    "GITLAB_COMMIT_WORKFLOW",
    "StaticToolProvider",
    "UserContext",
    "UserContextClient",
    "MCPServerConfig",
    "MCPToolProvider",
    "create_agent_app",
    "create_pm_tools",
    "get_meter",
    "get_tracer",
    "init_telemetry",
    "load_manifest_from_yaml",
    "phase_for_agent",
    "WSGatewayClient",
    "Workspace",
    "WorkspaceClient",
    "agent_for_phase",
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
