"""Pydantic models mirroring the frontend TypeScript types."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------

class PhaseType(StrEnum):
    REQUIREMENTS = "requirements"
    DESIGN = "design"
    ARCHITECTURE = "architecture"
    IMPLEMENTATION = "implementation"
    TESTING = "testing"
    DEPLOYMENT = "deployment"


class PhaseStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    BLOCKED = "blocked"


class AgentType(StrEnum):
    PM = "pm"
    ARCHITECTURE = "architecture"
    FRONTEND = "frontend"
    BACKEND = "backend"
    QA = "qa"
    DEVOPS = "devops"


class AgentStatus(StrEnum):
    IDLE = "idle"
    THINKING = "thinking"
    WORKING = "working"
    REVIEWING = "reviewing"
    BLOCKED = "blocked"
    ERROR = "error"


# ---------------------------------------------------------------------------
# Core domain models
# ---------------------------------------------------------------------------

class Task(BaseModel):
    id: str = ""
    title: str
    description: str = ""
    phase_id: str = ""
    assigned_agent: AgentType | None = None
    status: PhaseStatus = PhaseStatus.PENDING
    priority: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class Phase(BaseModel):
    id: str = ""
    workspace_id: str = ""
    type: PhaseType
    status: PhaseStatus = PhaseStatus.PENDING
    progress: float = 0.0
    tasks: list[Task] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class Agent(BaseModel):
    type: AgentType
    status: AgentStatus = AgentStatus.IDLE
    current_task: str | None = None
    progress: float = 0.0
    capabilities: list[str] = Field(default_factory=list)


class Activity(BaseModel):
    id: str = ""
    workspace_id: str = ""
    agent_type: AgentType
    action: str
    detail: str = ""
    timestamp: datetime | None = None


class Workspace(BaseModel):
    id: str = ""
    name: str
    description: str = ""
    current_phase: PhaseType = PhaseType.REQUIREMENTS
    phases: list[Phase] = Field(default_factory=list)
    agents: list[Agent] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ---------------------------------------------------------------------------
# Messaging models
# ---------------------------------------------------------------------------

class RichAction(BaseModel):
    label: str
    action: str
    payload: dict[str, Any] = Field(default_factory=dict)


class RichBlock(BaseModel):
    type: str  # "code" | "task_card" | "diagram" | "markdown"
    language: str | None = None
    content: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    actions: list[RichAction] = Field(default_factory=list)


class Message(BaseModel):
    id: str = ""
    workspace_id: str = ""
    agent_type: AgentType | None = None
    role: str = "assistant"  # "user" | "assistant" | "system"
    content: str = ""
    rich_blocks: list[RichBlock] = Field(default_factory=list)
    timestamp: datetime | None = None


# ---------------------------------------------------------------------------
# Agent protocol models
# ---------------------------------------------------------------------------

class AgentTask(BaseModel):
    """Payload sent *to* a domain agent to execute work."""
    task_id: str
    workspace_id: str
    intent: str
    description: str = ""
    context: dict[str, Any] = Field(default_factory=dict)


class AgentEvent(BaseModel):
    """Streamed back from a domain agent while it works."""
    type: str  # "status" | "progress" | "message" | "result" | "error"
    agent_type: AgentType
    workspace_id: str
    payload: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime | None = None


# ---------------------------------------------------------------------------
# Capability contract (for future LLM model selection)
# ---------------------------------------------------------------------------

class CapabilityContract(BaseModel):
    """Describes what an agent can do – used to pick the right LLM model."""
    name: str
    required_context_window: int = 8_000
    supports_tool_use: bool = True
    supports_vision: bool = False
    preferred_model: str | None = None
    fallback_models: list[str] = Field(default_factory=list)
