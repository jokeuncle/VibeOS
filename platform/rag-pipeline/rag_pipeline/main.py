"""VibeOS RAG Pipeline – FastAPI service wrapping LlamaIndex + Qdrant."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .code_indexer import build_code_documents
from .config import settings
from .indexer import WorkspaceIndexer

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

indexer: WorkspaceIndexer | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global indexer
    indexer = WorkspaceIndexer(
        qdrant_url=settings.QDRANT_URL,
        embedding_model=settings.EMBEDDING_MODEL,
        chunk_size=settings.CHUNK_SIZE,
        chunk_overlap=settings.CHUNK_OVERLAP,
    )
    logger.info("RAG Pipeline started on port %s", settings.PORT)
    yield
    logger.info("RAG Pipeline shutting down")


app = FastAPI(title="VibeOS RAG Pipeline", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_indexer() -> WorkspaceIndexer:
    if indexer is None:
        raise RuntimeError("Indexer not initialised")
    return indexer


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class DocumentInput(BaseModel):
    title: str = ""
    content: str
    doc_type: str = "text"


class IndexDocumentsRequest(BaseModel):
    workspace_id: str
    documents: list[DocumentInput]


class SearchRequest(BaseModel):
    query: str
    workspace_id: str
    top_k: int = 10
    filters: dict[str, Any] | None = None
    rerank: bool = False


class MultiSearchRequest(BaseModel):
    query: str
    workspace_ids: list[str]
    top_k: int = 10


class CodeFile(BaseModel):
    path: str
    content: str
    language: str = ""


class IndexCodeRequest(BaseModel):
    workspace_id: str
    files: list[CodeFile]


# ---------------------------------------------------------------------------
# Document ingestion
# ---------------------------------------------------------------------------


@app.post("/api/index/documents")
async def index_documents(req: IndexDocumentsRequest) -> dict[str, Any]:
    """Index documents for a workspace via JSON body."""
    ix = _get_indexer()
    docs = [d.model_dump() for d in req.documents]
    result = await ix.index_documents(req.workspace_id, docs)
    return result


@app.post("/api/index/upload")
async def index_upload(
    workspace_id: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Index a single uploaded file for a workspace."""
    ix = _get_indexer()
    content = (await file.read()).decode("utf-8", errors="replace")
    doc = {
        "title": file.filename or "upload",
        "content": content,
        "doc_type": "file",
    }
    result = await ix.index_documents(workspace_id, [doc])
    return result


@app.delete("/api/index/{workspace_id}")
async def delete_workspace_index(workspace_id: str) -> dict[str, Any]:
    """Clear the entire index for a workspace."""
    ix = _get_indexer()
    deleted = await ix.delete_workspace_index(workspace_id)
    if not deleted:
        raise HTTPException(404, detail=f"No index found for workspace {workspace_id}")
    return {"status": "deleted", "workspace_id": workspace_id}


@app.delete("/api/index/{workspace_id}/{doc_id}")
async def delete_document(workspace_id: str, doc_id: str) -> dict[str, Any]:
    """Remove a specific document from a workspace index."""
    ix = _get_indexer()
    deleted = await ix.delete_document(workspace_id, doc_id)
    if not deleted:
        raise HTTPException(404, detail="Document or workspace not found")
    return {"status": "deleted", "workspace_id": workspace_id, "doc_id": doc_id}


# ---------------------------------------------------------------------------
# Search / retrieval
# ---------------------------------------------------------------------------


@app.post("/api/search")
async def search(req: SearchRequest) -> dict[str, Any]:
    """Hybrid search within a single workspace."""
    ix = _get_indexer()
    results = await ix.search(
        workspace_id=req.workspace_id,
        query=req.query,
        top_k=req.top_k,
        filters=req.filters,
        rerank=req.rerank,
    )
    return {"query": req.query, "workspace_id": req.workspace_id, "results": results}


@app.post("/api/search/multi")
async def search_multi(req: MultiSearchRequest) -> dict[str, Any]:
    """Search across multiple workspaces (org-level knowledge)."""
    ix = _get_indexer()
    results = await ix.search_multi(
        workspace_ids=req.workspace_ids,
        query=req.query,
        top_k=req.top_k,
    )
    return {"query": req.query, "workspace_ids": req.workspace_ids, "results": results}


# ---------------------------------------------------------------------------
# Code indexing
# ---------------------------------------------------------------------------


@app.post("/api/index/code")
async def index_code(req: IndexCodeRequest) -> dict[str, Any]:
    """Index code files with language-aware chunking."""
    ix = _get_indexer()
    files = [f.model_dump() for f in req.files]
    llama_docs = build_code_documents(req.workspace_id, files)
    docs_as_dicts = [
        {"title": d.metadata["title"], "content": d.text, "doc_type": "code"}
        for d in llama_docs
    ]
    result = await ix.index_documents(req.workspace_id, docs_as_dicts)
    return result


# ---------------------------------------------------------------------------
# Health / admin
# ---------------------------------------------------------------------------


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "rag-pipeline"}


@app.get("/api/collections")
async def list_collections() -> dict[str, Any]:
    """List all indexed workspace collections."""
    ix = _get_indexer()
    collections = await ix.list_collections()
    return {"collections": collections}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("rag_pipeline.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
