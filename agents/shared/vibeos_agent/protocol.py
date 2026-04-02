"""Backward-compatible re-export shim for vibeos_agent.protocol.

The implementation has been split into focused modules:
  - vibeos_agent.base_agent    → BaseAgent, PHASE_CONTEXT, AGENT_PHASE_MAP
  - vibeos_agent.clients       → WorkspaceClient, LLMGatewayClient, WSGatewayClient,
                                  MemoryClient, RAGClient, KnowledgeClient

All existing ``from vibeos_agent.protocol import ...`` statements continue to work.
"""

from .base_agent import AGENT_PHASE_MAP, PHASE_CONTEXT, PHASE_TOOL_HINTS, BaseAgent
from .clients import (
    KnowledgeClient,
    LLMGatewayClient,
    MemoryClient,
    RAGClient,
    WorkspaceClient,
    WSGatewayClient,
)

__all__ = [
    "AGENT_PHASE_MAP",
    "PHASE_CONTEXT",
    "BaseAgent",
    "KnowledgeClient",
    "LLMGatewayClient",
    "MemoryClient",
    "RAGClient",
    "WorkspaceClient",
    "WSGatewayClient",
]
