"""Client wrappers for all VibeOS micro-services."""

from .knowledge import KnowledgeClient
from .llm import LLMGatewayClient
from .memory import MemoryClient
from .rag import RAGClient
from .workspace import WorkspaceClient
from .ws import WSGatewayClient

__all__ = [
    "KnowledgeClient",
    "LLMGatewayClient",
    "MemoryClient",
    "RAGClient",
    "WorkspaceClient",
    "WSGatewayClient",
]
