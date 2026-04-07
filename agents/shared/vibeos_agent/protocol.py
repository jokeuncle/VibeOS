"""Backward-compatible re-export shim for vibeos_agent.protocol.

.. deprecated::

    This module is deprecated. Import directly from ``vibeos_agent`` or the
    specific submodule instead:

    - ``vibeos_agent.base_agent``  → ``BaseAgent``
    - ``vibeos_agent.phases``      → ``PHASE_CONTEXT``, ``AGENT_PHASE_MAP``, etc.
    - ``vibeos_agent.clients``     → ``WorkspaceClient``, ``LLMGatewayClient``, etc.

All existing ``from vibeos_agent.protocol import ...`` statements still work
but should be migrated to direct imports.
"""

from .base_agent import BaseAgent
from .phases import AGENT_PHASE_MAP, PHASE_CONTEXT, PHASE_CONTRACTS, PHASE_TOOL_HINTS
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
    "PHASE_CONTRACTS",
    "PHASE_TOOL_HINTS",
    "BaseAgent",
    "KnowledgeClient",
    "LLMGatewayClient",
    "MemoryClient",
    "RAGClient",
    "WorkspaceClient",
    "WSGatewayClient",
]
