"""KnowledgeClient – wrapper around the knowledge-service API for knowledge graph queries."""

from __future__ import annotations

from typing import Any

import httpx

from ..config import config


class KnowledgeClient:
    """Wrapper around the knowledge-service API for knowledge graph queries."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.knowledge_svc_url
        self._http = httpx.AsyncClient(base_url=self._base, timeout=30)

    async def search(
        self,
        query: str,
        *,
        access_level: str = "enterprise",
        node_labels: list[str] | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        resp = await self._http.post(
            "/api/knowledge/search",
            json={
                "query": query,
                "access_level": access_level,
                "node_labels": node_labels or [],
                "limit": limit,
            },
        )
        resp.raise_for_status()
        return resp.json().get("results", [])

    async def get_patterns(
        self,
        *,
        domain: str = "",
        min_confidence: float = 0.5,
        access_level: str = "enterprise",
    ) -> list[dict[str, Any]]:
        resp = await self._http.get(
            "/api/knowledge/patterns",
            params={
                "domain": domain,
                "min_confidence": min_confidence,
                "access_level": access_level,
            },
        )
        resp.raise_for_status()
        return resp.json().get("patterns", [])

    async def close(self) -> None:
        await self._http.aclose()
