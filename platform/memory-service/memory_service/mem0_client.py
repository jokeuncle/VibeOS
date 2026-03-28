from __future__ import annotations

import logging
from typing import Any

from mem0 import Memory

from .config import Settings

logger = logging.getLogger(__name__)


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
        mem0_config: dict[str, Any] = {
            "vector_store": {
                "provider": "qdrant",
                "config": {
                    "url": config.qdrant_url,
                    "collection_name": "vibeos_memories",
                },
            },
            "llm": {
                "provider": "openai",
                "config": {
                    "model": "gpt-4o-mini",
                    "api_key": config.openai_api_key,
                },
            },
            "version": "v1.1",
        }
        self.memory = Memory.from_config(mem0_config)

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
