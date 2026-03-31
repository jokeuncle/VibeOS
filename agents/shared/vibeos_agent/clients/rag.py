"""RAGClient – wrapper around the rag-pipeline API for document search."""

from __future__ import annotations

from typing import Any

import httpx

from ..config import config


class RAGClient:
    """Wrapper around the rag-pipeline API for document search."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.rag_svc_url
        self._http = httpx.AsyncClient(base_url=self._base, timeout=30)

    async def search(
        self,
        query: str,
        *,
        workspace_id: str,
        top_k: int = 5,
        rerank: bool = True,
    ) -> list[dict[str, Any]]:
        resp = await self._http.post(
            "/api/search",
            json={
                "query": query,
                "workspace_id": workspace_id,
                "top_k": top_k,
                "rerank": rerank,
            },
        )
        resp.raise_for_status()
        return resp.json().get("results", [])

    async def index_documents(
        self, workspace_id: str, documents: list[dict[str, str]]
    ) -> dict[str, Any]:
        resp = await self._http.post(
            "/api/index/documents",
            json={"workspace_id": workspace_id, "documents": documents},
        )
        resp.raise_for_status()
        return resp.json()

    async def close(self) -> None:
        await self._http.aclose()
