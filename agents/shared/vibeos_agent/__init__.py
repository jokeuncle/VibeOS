"""vibeos-agent – shared framework for VibeOS domain agents."""

from .config import Config, config
from .models import (
    Activity,
    Agent,
    AgentEvent,
    AgentStatus,
    AgentTask,
    AgentType,
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
from .protocol import BaseAgent, LLMGatewayClient, WorkspaceClient, WSGatewayClient
from .session import SessionManager

__all__ = [
    "Activity",
    "Agent",
    "AgentEvent",
    "AgentStatus",
    "AgentTask",
    "AgentType",
    "BaseAgent",
    "CapabilityContract",
    "Config",
    "LLMGatewayClient",
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
