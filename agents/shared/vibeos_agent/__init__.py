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
    LLMGatewayClient,
    WorkspaceClient,
    WSGatewayClient,
)
from .session import SessionManager

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
    "CapabilityContract",
    "Config",
    "LLMGatewayClient",
    "PHASE_CONTEXT",
    "Message",
    "Phase",
    "PhaseStatus",
    "PhaseType",
    "RichAction",
    "RichBlock",
    "SessionManager",
    "Task",
    "WSGatewayClient",
    "Workspace",
    "WorkspaceClient",
    "config",
]
