"""ClientContainer -- dependency injection for all VibeOS service clients."""

from __future__ import annotations

from .clients import (
    KnowledgeClient,
    LLMGatewayClient,
    MemoryClient,
    RAGClient,
    WorkspaceClient,
    WSGatewayClient,
)
from .config import config
from .registry import RegistryClient
from .session import SessionManager


class ClientContainer:
    """Owns the lifecycle of every service client an agent may need.

    Replaces the scattered ``self.xxx = XxxClient()`` calls in ``BaseAgent.__init__``.
    Agents access clients via ``self.clients.llm``, ``self.clients.workspace``, etc.
    """

    __slots__ = (
        "llm",
        "workspace",
        "ws",
        "session",
        "memory",
        "rag",
        "knowledge",
        "registry",
    )

    def __init__(self) -> None:
        self.llm = LLMGatewayClient()
        self.workspace = WorkspaceClient()
        self.ws = WSGatewayClient()
        self.session = SessionManager()
        self.memory = MemoryClient()
        self.rag = RAGClient()
        self.knowledge = KnowledgeClient()
        self.registry = RegistryClient()

    async def close(self) -> None:
        await self.registry.close()
        await self.workspace.close()
        await self.llm.close()
        await self.ws.close()
        await self.session.close()
        await self.memory.close()
        await self.rag.close()
        await self.knowledge.close()
