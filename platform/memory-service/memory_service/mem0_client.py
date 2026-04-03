from __future__ import annotations

import logging
from typing import Any

import litellm
litellm.drop_params = True

from mem0 import Memory
from qdrant_client import QdrantClient, models

from .config import Settings

logger = logging.getLogger(__name__)
MEMORY_COLLECTION_NAME = "vibeos_memories"


class VibeOSMemory:
    """Wraps Mem0 with VibeOS four-layer memory semantics.

    Layers
    ------
    L1 Working Memory  – short-lived, scoped to a session (session_id)
    L2 Project Memory   – persisted per workspace (workspace_id → user_id)
    L3 Organization Memory – shared across workspaces (org_id → user_id)
    L4 Preference Memory – user/workspace preferences stored with metadata tags
    """

    def __init__(self, config: Settings) -> None:
        self._ensure_collection_schema(config)

        # fastembed (ONNX) avoids sentence-transformers→transformers, which breaks on Python 3.14
        # (importlib.metadata.packages_distributions + None metadata).
        embedder_config: dict[str, Any] = {
            "provider": "fastembed",
            "config": {
                "model": config.embedding_model,
            },
        }
        embedding_dims = config.embedding_dim
        logger.info("Mem0 embedder: fastembed %s (dim=%s)", config.embedding_model, embedding_dims)

        mem0_config: dict[str, Any] = {
            "vector_store": {
                "provider": "qdrant",
                "config": {
                    "url": config.qdrant_url,
                    "collection_name": MEMORY_COLLECTION_NAME,
                    "embedding_model_dims": embedding_dims,
                },
            },
            "llm": {
                "provider": "litellm",
                "config": {
                    "model": config.volcengine_llm_model,
                    "api_key": config.volcengine_api_key,
                },
            },
            "embedder": embedder_config,
            "version": "v1.1",
        }
        self.memory = Memory.from_config(mem0_config)

    @staticmethod
    def _extract_vector_size(vectors: Any) -> int | None:
        if vectors is None:
            return None
        if hasattr(vectors, "size"):
            return getattr(vectors, "size")
        if isinstance(vectors, dict):
            if "size" in vectors:
                return vectors["size"]
            for value in vectors.values():
                size = VibeOSMemory._extract_vector_size(value)
                if size is not None:
                    return size
        return None

    def _ensure_collection_schema(self, config: Settings) -> None:
        client = QdrantClient(url=config.qdrant_url)
        expected_dim = config.embedding_dim

        if not client.collection_exists(MEMORY_COLLECTION_NAME):
            return

        info = client.get_collection(MEMORY_COLLECTION_NAME)
        current_dim = self._extract_vector_size(info.config.params.vectors)
        points_count = info.points_count or 0

        if current_dim == expected_dim:
            return

        logger.warning(
            "Recreating Qdrant collection %s with dim=%s (was %s, points=%s)",
            MEMORY_COLLECTION_NAME,
            expected_dim,
            current_dim,
            points_count,
        )
        client.delete_collection(MEMORY_COLLECTION_NAME)
        client.create_collection(
            collection_name=MEMORY_COLLECTION_NAME,
            vectors_config=models.VectorParams(
                size=expected_dim,
                distance=models.Distance.COSINE,
            ),
        )

    # ------------------------------------------------------------------
    # L1 – Working (session-scoped) memory
    # ------------------------------------------------------------------

    def add_working_memory(
        self,
        content: str,
        session_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        meta = {"layer": "working", **(metadata or {})}
        return self.memory.add(content, user_id=session_id, metadata=meta)

    def search_working_memory(
        self, query: str, session_id: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        results = self.memory.search(query, user_id=session_id, limit=limit)
        return self._extract_results(results)

    # ------------------------------------------------------------------
    # L2 – Project memory
    # ------------------------------------------------------------------

    def add_project_memory(
        self,
        content: str,
        workspace_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        meta = {"layer": "project", **(metadata or {})}
        return self.memory.add(content, user_id=f"ws:{workspace_id}", metadata=meta)

    def search_project_memory(
        self, query: str, workspace_id: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        results = self.memory.search(
            query, user_id=f"ws:{workspace_id}", limit=limit
        )
        return self._extract_results(results)

    def get_all_project_memories(
        self, workspace_id: str
    ) -> list[dict[str, Any]]:
        results = self.memory.get_all(user_id=f"ws:{workspace_id}")
        return self._extract_results(results)

    # ------------------------------------------------------------------
    # L3 – Organization memory
    # ------------------------------------------------------------------

    def add_org_memory(
        self,
        content: str,
        org_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        meta = {"layer": "org", **(metadata or {})}
        return self.memory.add(content, user_id=f"org:{org_id}", metadata=meta)

    def search_org_memory(
        self, query: str, org_id: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        results = self.memory.search(query, user_id=f"org:{org_id}", limit=limit)
        return self._extract_results(results)

    # ------------------------------------------------------------------
    # L4 – Preference memory
    # ------------------------------------------------------------------

    def add_preference(
        self,
        content: str,
        workspace_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        meta = {"layer": "preference", **(metadata or {})}
        return self.memory.add(
            content, user_id=f"ws:{workspace_id}", metadata=meta
        )

    def search_preferences(
        self, query: str, workspace_id: str, limit: int = 10
    ) -> list[dict[str, Any]]:
        results = self.memory.search(
            query, user_id=f"ws:{workspace_id}", limit=limit
        )
        return [
            r
            for r in self._extract_results(results)
            if r.get("metadata", {}).get("layer") == "preference"
        ]

    def get_all_preferences(
        self, workspace_id: str
    ) -> list[dict[str, Any]]:
        all_memories = self.memory.get_all(user_id=f"ws:{workspace_id}")
        return [
            m
            for m in self._extract_results(all_memories)
            if m.get("metadata", {}).get("layer") == "preference"
        ]

    # ------------------------------------------------------------------
    # Generic helpers
    # ------------------------------------------------------------------

    def add(
        self,
        content: str,
        user_id: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self.memory.add(content, user_id=user_id, metadata=metadata)

    def search(
        self, query: str, user_id: str, limit: int = 5
    ) -> list[dict[str, Any]]:
        results = self.memory.search(query, user_id=user_id, limit=limit)
        return self._extract_results(results)

    def get_all(self, user_id: str) -> list[dict[str, Any]]:
        results = self.memory.get_all(user_id=user_id)
        return self._extract_results(results)

    def delete(self, memory_id: str) -> None:
        self.memory.delete(memory_id)

    @staticmethod
    def _extract_results(raw: Any) -> list[dict[str, Any]]:
        if isinstance(raw, dict) and "results" in raw:
            return raw["results"]
        if isinstance(raw, list):
            return raw
        return []
