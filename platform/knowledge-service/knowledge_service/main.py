from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any

import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import config
from .distiller import Distiller
from .graph_store import GraphStore

logger = logging.getLogger(__name__)

graph_store = GraphStore(config.DATABASE_URL)
distiller = Distiller(
    graph_store=graph_store,
    llm_gateway_url=config.LLM_GATEWAY_URL,
    workspace_svc_url=config.WORKSPACE_SVC_URL,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await graph_store.initialize()
    logger.info("Knowledge service ready (AGE graph initialised)")
    yield


app = FastAPI(title="VibeOS Knowledge Service", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class CreateNodeRequest(BaseModel):
    label: str = Field(
        ..., pattern="^(TechStack|Pattern|Decision|Concept|BestPractice)$"
    )
    properties: dict[str, Any]


class CreateEdgeRequest(BaseModel):
    from_id: str
    to_id: str
    relationship: str = Field(
        ...,
        pattern="^(SUITED_FOR|SOLVES|CONTAINS|REPLACES|DEPENDS_ON|TESTED_IN)$",
    )
    properties: dict[str, Any] = Field(default_factory=dict)


class SearchRequest(BaseModel):
    query: str
    access_level: str = "enterprise"
    node_labels: list[str] | None = None
    limit: int = 20


class DistillRequest(BaseModel):
    workspace_id: str
    target_access_level: str = Field(
        ..., pattern="^(team|bu|enterprise)$"
    )


class ApproveRequest(BaseModel):
    knowledge_ids: list[str]
    approved_access_level: str = Field(
        ..., pattern="^(team|bu|enterprise)$"
    )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok", "service": "knowledge-service"}


# ---------------------------------------------------------------------------
# Knowledge graph CRUD
# ---------------------------------------------------------------------------


@app.post("/api/knowledge/nodes")
async def create_node(req: CreateNodeRequest):
    try:
        node = await graph_store.create_node(req.label, req.properties)
        return {"node": node}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to create node")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/knowledge/edges")
async def create_edge(req: CreateEdgeRequest):
    try:
        edge = await graph_store.create_edge(
            req.from_id, req.to_id, req.relationship, req.properties
        )
        return {"edge": edge}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to create edge")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/knowledge/search")
async def search_nodes(req: SearchRequest):
    try:
        results = await graph_store.search_nodes(
            query=req.query,
            labels=req.node_labels,
            access_level=req.access_level,
            limit=req.limit,
        )
        return {"results": results, "count": len(results)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/knowledge/related/{node_id}")
async def get_related(
    node_id: str,
    depth: int = Query(default=1, ge=1, le=2),
    relationship_types: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    rel_types = (
        [r.strip() for r in relationship_types.split(",")]
        if relationship_types
        else None
    )
    try:
        results = await graph_store.get_related(
            node_id=node_id,
            depth=depth,
            relationship_types=rel_types,
            limit=limit,
        )
        return {"node_id": node_id, "related": results, "count": len(results)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Related lookup failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/knowledge/patterns")
async def list_patterns(
    domain: str | None = Query(default=None),
    min_confidence: float = Query(default=0.0, ge=0.0, le=1.0),
    min_usage_count: int = Query(default=0, ge=0),
    access_level: str = Query(default="enterprise"),
):
    try:
        results = await graph_store.get_patterns(
            domain=domain,
            min_confidence=min_confidence,
            min_usage_count=min_usage_count,
            access_level=access_level,
        )
        return {"patterns": results, "count": len(results)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.exception("Pattern listing failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Knowledge distillation
# ---------------------------------------------------------------------------


@app.post("/api/distill")
async def distill(req: DistillRequest):
    try:
        result = await distiller.distill(req.workspace_id, req.target_access_level)
        return result
    except httpx.HTTPStatusError as exc:
        logger.exception("Upstream service error during distillation")
        raise HTTPException(
            status_code=502,
            detail=f"Upstream error: {exc.response.status_code}",
        )
    except Exception as exc:
        logger.exception("Distillation failed")
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/distill/approve")
async def approve(req: ApproveRequest):
    try:
        approved = await distiller.approve(
            req.knowledge_ids, req.approved_access_level
        )
        return {"approved": approved, "count": len(approved)}
    except Exception as exc:
        logger.exception("Approval failed")
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=config.PORT)
