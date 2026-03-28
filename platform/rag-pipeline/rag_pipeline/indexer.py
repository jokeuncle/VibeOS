"""Per-workspace document indexing using LlamaIndex + Qdrant."""

from __future__ import annotations

import logging
import uuid
from typing import Any

import redis.asyncio as aioredis
from llama_index.core import Document, StorageContext, VectorStoreIndex
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.schema import NodeWithScore
from llama_index.embeddings.openai import OpenAIEmbedding
from llama_index.vector_stores.qdrant import QdrantVectorStore
from qdrant_client import QdrantClient, models

from .config import settings

logger = logging.getLogger(__name__)

COLLECTION_PREFIX = "vibeos_ws_"


def _collection_name(workspace_id: str) -> str:
    return f"{COLLECTION_PREFIX}{workspace_id}"


class WorkspaceIndexer:
    """Indexes and searches documents per-workspace using LlamaIndex + Qdrant."""

    def __init__(
        self,
        qdrant_url: str = settings.QDRANT_URL,
        embedding_model: str = settings.EMBEDDING_MODEL,
        chunk_size: int = settings.CHUNK_SIZE,
        chunk_overlap: int = settings.CHUNK_OVERLAP,
    ) -> None:
        self.qdrant = QdrantClient(url=qdrant_url)
        embed_kwargs: dict[str, Any] = {
            "model": embedding_model,
            "api_key": settings.EMBEDDING_API_KEY,
        }
        if settings.EMBEDDING_BASE_URL:
            embed_kwargs["api_base"] = settings.EMBEDDING_BASE_URL
        self.embed_model = OpenAIEmbedding(**embed_kwargs)
        self._vector_dim = settings.EMBEDDING_DIM
        self.splitter = SentenceSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        self._redis: aioredis.Redis | None = None

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        return self._redis

    def _ensure_collection(self, collection_name: str) -> None:
        """Create the Qdrant collection if it does not already exist."""
        if not self.qdrant.collection_exists(collection_name):
            self.qdrant.create_collection(
                collection_name=collection_name,
                vectors_config=models.VectorParams(
                    size=self._vector_dim,
                    distance=models.Distance.COSINE,
                ),
            )

    async def index_documents(
        self,
        workspace_id: str,
        documents: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Index a batch of documents for a workspace.

        Each document dict should have: title, content, doc_type.
        Returns summary with doc_id mapping and chunk count.
        """
        collection = _collection_name(workspace_id)
        self._ensure_collection(collection)

        vector_store = QdrantVectorStore(client=self.qdrant, collection_name=collection)
        storage_context = StorageContext.from_defaults(vector_store=vector_store)

        llama_docs: list[Document] = []
        doc_id_map: dict[str, str] = {}

        for doc in documents:
            doc_id = str(uuid.uuid4())
            llama_doc = Document(
                text=doc["content"],
                metadata={
                    "title": doc.get("title", ""),
                    "doc_type": doc.get("doc_type", "text"),
                    "doc_id": doc_id,
                    "workspace_id": workspace_id,
                },
                doc_id=doc_id,
            )
            llama_docs.append(llama_doc)
            doc_id_map[doc.get("title", doc_id)] = doc_id

        nodes = self.splitter.get_nodes_from_documents(llama_docs)

        VectorStoreIndex(
            nodes=nodes,
            storage_context=storage_context,
            embed_model=self.embed_model,
        )

        r = await self._get_redis()
        await r.hincrby(f"rag:stats:{workspace_id}", "doc_count", len(llama_docs))
        await r.hincrby(f"rag:stats:{workspace_id}", "chunk_count", len(nodes))

        logger.info(
            "Indexed %d documents (%d chunks) for workspace %s",
            len(llama_docs),
            len(nodes),
            workspace_id,
        )
        return {
            "workspace_id": workspace_id,
            "documents_indexed": len(llama_docs),
            "chunks_created": len(nodes),
            "doc_ids": doc_id_map,
        }

    async def search(
        self,
        workspace_id: str,
        query: str,
        top_k: int = 10,
        filters: dict[str, Any] | None = None,
        rerank: bool = False,
    ) -> list[dict[str, Any]]:
        """Search documents in a workspace's collection."""
        collection = _collection_name(workspace_id)
        if not self.qdrant.collection_exists(collection):
            return []

        vector_store = QdrantVectorStore(client=self.qdrant, collection_name=collection)
        index = VectorStoreIndex.from_vector_store(
            vector_store, embed_model=self.embed_model
        )

        retriever = index.as_retriever(similarity_top_k=top_k)
        nodes: list[NodeWithScore] = await retriever.aretrieve(query)

        if rerank:
            nodes = self._apply_reranking(nodes)

        return [self._node_to_result(n) for n in nodes]

    async def search_multi(
        self,
        workspace_ids: list[str],
        query: str,
        top_k: int = 10,
    ) -> list[dict[str, Any]]:
        """Search across multiple workspace collections and merge results."""
        all_results: list[dict[str, Any]] = []

        for ws_id in workspace_ids:
            results = await self.search(ws_id, query, top_k=top_k)
            all_results.extend(results)

        all_results.sort(key=lambda r: r["score"], reverse=True)
        return all_results[:top_k]

    async def delete_workspace_index(self, workspace_id: str) -> bool:
        """Delete the entire Qdrant collection for a workspace."""
        collection = _collection_name(workspace_id)
        if self.qdrant.collection_exists(collection):
            self.qdrant.delete_collection(collection)
            r = await self._get_redis()
            await r.delete(f"rag:stats:{workspace_id}")
            logger.info("Deleted collection %s", collection)
            return True
        return False

    async def delete_document(self, workspace_id: str, doc_id: str) -> bool:
        """Remove all chunks belonging to a specific document from the collection."""
        collection = _collection_name(workspace_id)
        if not self.qdrant.collection_exists(collection):
            return False

        self.qdrant.delete(
            collection_name=collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="doc_id",
                            match=models.MatchValue(value=doc_id),
                        )
                    ]
                )
            ),
        )
        logger.info("Deleted document %s from collection %s", doc_id, collection)
        return True

    async def list_collections(self) -> list[dict[str, Any]]:
        """List all vibeos workspace collections in Qdrant."""
        collections = self.qdrant.get_collections().collections
        results = []
        for c in collections:
            if c.name.startswith(COLLECTION_PREFIX):
                info = self.qdrant.get_collection(c.name)
                results.append({
                    "collection": c.name,
                    "workspace_id": c.name.removeprefix(COLLECTION_PREFIX),
                    "points_count": info.points_count,
                    "vectors_count": info.vectors_count,
                })
        return results

    def _apply_reranking(self, nodes: list[NodeWithScore]) -> list[NodeWithScore]:
        """Simple relevance-based reranking.

        Placeholder that filters low-confidence results. Swap in a
        cross-encoder model (e.g. BAAI/bge-reranker) for production use.
        """
        if not nodes:
            return nodes

        max_score = max(n.score for n in nodes if n.score is not None) or 1.0
        threshold = max_score * 0.3

        filtered = [n for n in nodes if n.score is not None and n.score >= threshold]
        filtered.sort(key=lambda n: n.score or 0.0, reverse=True)
        return filtered

    @staticmethod
    def _node_to_result(node: NodeWithScore) -> dict[str, Any]:
        metadata = node.metadata or {}
        return {
            "text": node.text,
            "score": node.score,
            "doc_id": metadata.get("doc_id", ""),
            "title": metadata.get("title", ""),
            "doc_type": metadata.get("doc_type", ""),
            "workspace_id": metadata.get("workspace_id", ""),
            "metadata": metadata,
        }
