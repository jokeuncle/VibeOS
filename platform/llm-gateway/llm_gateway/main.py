"""VibeOS LLM Gateway – FastAPI application."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import litellm
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from .circuit_breaker import CircuitBreakerRegistry
from .config import settings
from .router import MODEL_REGISTRY, CapabilityContract, ModelRouter
from .token_budget import BudgetStatus, TokenBudgetManager
from .trust_score import TrustScoreManager, AutonomyLevel

logger = logging.getLogger("llm_gateway")

router_instance: ModelRouter | None = None
cb_registry: CircuitBreakerRegistry | None = None
budget_manager: TokenBudgetManager | None = None
trust_manager: TrustScoreManager | None = None
redis_client: redis.Redis | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    global router_instance, cb_registry, budget_manager, trust_manager, redis_client

    router_instance = ModelRouter(settings.available_models)
    cb_registry = CircuitBreakerRegistry()

    redis_client = redis.from_url(settings.redis_url, decode_responses=False)
    trust_manager = TrustScoreManager(redis_client)
    budget_manager = TokenBudgetManager(
        redis_client,
        monthly_limit=settings.monthly_token_limit,
        warn_pct=settings.budget_warn_pct,
    )

    logger.info("LLM Gateway started – available models: %s", settings.available_models)
    yield

    if redis_client:
        await redis_client.aclose()
    logger.info("LLM Gateway shut down")


app = FastAPI(title="VibeOS LLM Gateway", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: str = "auto"
    capability: CapabilityContract | None = None
    agent_type: str | None = None
    workspace_id: str | None = None
    priority: str = "normal"
    stream: bool = False
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int = Field(default=4096, ge=1, le=200_000)


class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ChatChoice(BaseModel):
    index: int = 0
    message: ChatMessage
    finish_reason: str | None = None


class ChatResponse(BaseModel):
    id: str = ""
    model: str
    choices: list[ChatChoice]
    usage: TokenUsage
    budget_status: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_model_chain(req: ChatRequest) -> list[str]:
    assert router_instance is not None
    if req.model != "auto":
        chain = [req.model]
        for m in router_instance.select(req.capability, req.agent_type):
            if m not in chain:
                chain.append(m)
        return chain
    return router_instance.select(req.capability, req.agent_type)


async def _call_with_circuit_breaker(
    model_chain: list[str],
    messages: list[dict[str, str]],
    *,
    temperature: float,
    max_tokens: int,
    stream: bool = False,
) -> Any:
    assert cb_registry is not None
    last_err: Exception | None = None

    for model in model_chain:
        cb = cb_registry.get(model)
        if not await cb.allow_request():
            continue

        try:
            response = await litellm.acompletion(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                stream=stream,
            )
            await cb.record_success()
            return response
        except Exception as exc:
            last_err = exc
            await cb.record_failure()
            logger.warning("Model %s failed: %s – trying next fallback", model, exc)

    raise HTTPException(status_code=502, detail=f"All models failed. Last error: {last_err}")


async def _track_tokens(workspace_id: str | None, usage_data: dict) -> str | None:
    if not workspace_id or not budget_manager:
        return None
    record = await budget_manager.record_usage(
        workspace_id,
        input_tokens=usage_data.get("prompt_tokens", 0),
        output_tokens=usage_data.get("completion_tokens", 0),
    )
    return record.status.value


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "llm-gateway",
        "available_models": settings.available_models,
        "circuit_breakers": cb_registry.all_status() if cb_registry else [],
    }


@app.get("/api/models")
async def list_models() -> dict:
    profiles = []
    for name in settings.available_models:
        profile = MODEL_REGISTRY.get(name)
        if profile:
            profiles.append({
                "name": profile.name,
                "provider": profile.provider,
                "reasoning": profile.reasoning.value,
                "context_window": profile.context_window,
                "code_generation": profile.code_generation,
                "tool_calling": profile.tool_calling,
                "multimodal": profile.multimodal,
            })
    return {"models": profiles}


@app.get("/api/usage/{workspace_id}")
async def get_usage(workspace_id: str) -> dict:
    if not budget_manager:
        raise HTTPException(status_code=503, detail="Budget manager not initialized")
    record = await budget_manager.get_usage(workspace_id)
    return {
        "workspace_id": record.workspace_id,
        "period": record.period,
        "input_tokens": record.input_tokens,
        "output_tokens": record.output_tokens,
        "total_tokens": record.total_tokens,
        "limit": record.limit,
        "remaining": record.remaining,
        "status": record.status.value,
    }


@app.post("/api/chat/completions")
async def chat_completions(req: ChatRequest) -> ChatResponse:
    if req.workspace_id and budget_manager:
        budget_check = await budget_manager.check_budget(req.workspace_id, req.priority)
        if budget_check == BudgetStatus.EXCEEDED:
            raise HTTPException(
                status_code=429,
                detail="Monthly token budget exceeded for this workspace",
            )

    model_chain = _resolve_model_chain(req)
    messages = [m.model_dump() for m in req.messages]

    if req.stream:
        return await _stream_response(model_chain, messages, req)

    response = await _call_with_circuit_breaker(
        model_chain,
        messages,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
    )

    usage_dict = dict(response.usage) if response.usage else {}
    budget_status = await _track_tokens(req.workspace_id, usage_dict)

    choice = response.choices[0]
    return ChatResponse(
        id=response.id,
        model=response.model,
        choices=[
            ChatChoice(
                message=ChatMessage(role=choice.message.role, content=choice.message.content),
                finish_reason=choice.finish_reason,
            )
        ],
        usage=TokenUsage(**usage_dict),
        budget_status=budget_status,
    )


@app.post("/api/chat/completions/stream")
async def chat_completions_stream(req: ChatRequest) -> StreamingResponse:
    req.stream = True

    if req.workspace_id and budget_manager:
        budget_check = await budget_manager.check_budget(req.workspace_id, req.priority)
        if budget_check == BudgetStatus.EXCEEDED:
            raise HTTPException(
                status_code=429,
                detail="Monthly token budget exceeded for this workspace",
            )

    model_chain = _resolve_model_chain(req)
    messages = [m.model_dump() for m in req.messages]
    return await _stream_response(model_chain, messages, req)


async def _stream_response(
    model_chain: list[str],
    messages: list[dict[str, str]],
    req: ChatRequest,
) -> StreamingResponse:
    response = await _call_with_circuit_breaker(
        model_chain,
        messages,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        stream=True,
    )

    async def event_generator() -> AsyncGenerator[str, None]:
        total_prompt = 0
        total_completion = 0
        try:
            async for chunk in response:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                data = {
                    "id": chunk.id,
                    "model": chunk.model,
                    "choices": [{
                        "index": 0,
                        "delta": {"role": getattr(delta, "role", None), "content": getattr(delta, "content", "")},
                        "finish_reason": chunk.choices[0].finish_reason,
                    }],
                }
                yield f"data: {json.dumps(data)}\n\n"

                if hasattr(chunk, "usage") and chunk.usage:
                    total_prompt = getattr(chunk.usage, "prompt_tokens", 0)
                    total_completion = getattr(chunk.usage, "completion_tokens", 0)
        except Exception as exc:
            logger.error("Stream error: %s", exc)
            yield f"data: {json.dumps({'error': str(exc)})}\n\n"

        await _track_tokens(req.workspace_id, {
            "prompt_tokens": total_prompt,
            "completion_tokens": total_completion,
        })
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Trust Score endpoints
# ---------------------------------------------------------------------------

class OutcomeRequest(BaseModel):
    model: str
    agent_type: str
    success: bool
    latency_ms: float = 0


@app.post("/api/trust/outcome")
async def record_outcome(req: OutcomeRequest) -> dict:
    """Record a success/failure outcome for trust score tracking."""
    if not trust_manager:
        raise HTTPException(status_code=503, detail="Trust manager not initialized")
    record = await trust_manager.record_outcome(
        req.model, req.agent_type, success=req.success, latency_ms=req.latency_ms,
    )
    return {
        "model": record.model,
        "agent_type": record.agent_type,
        "score": round(record.score, 2),
        "autonomy": record.autonomy.value,
        "total_calls": record.total_calls,
        "success_rate": round(record.success_rate, 4),
    }


@app.get("/api/trust/{model}/{agent_type}")
async def get_trust(model: str, agent_type: str) -> dict:
    """Get trust score for a model + agent_type pair."""
    if not trust_manager:
        raise HTTPException(status_code=503, detail="Trust manager not initialized")
    record = await trust_manager.get_trust(model, agent_type)
    return {
        "model": record.model,
        "agent_type": record.agent_type,
        "score": round(record.score, 2),
        "autonomy": record.autonomy.value,
        "total_calls": record.total_calls,
        "success_rate": round(record.success_rate, 4),
    }


@app.get("/api/trust")
async def list_trust_scores() -> dict:
    """List all trust scores."""
    if not trust_manager:
        raise HTTPException(status_code=503, detail="Trust manager not initialized")
    records = await trust_manager.get_all_scores()
    return {
        "scores": [
            {
                "model": r.model,
                "agent_type": r.agent_type,
                "score": round(r.score, 2),
                "autonomy": r.autonomy.value,
                "total_calls": r.total_calls,
            }
            for r in records
        ]
    }


@app.get("/api/trust/autonomy/{model}/{agent_type}")
async def check_autonomy(model: str, agent_type: str) -> dict:
    """Check if an agent can operate autonomously with a given model."""
    if not trust_manager:
        raise HTTPException(status_code=503, detail="Trust manager not initialized")
    level = await trust_manager.check_autonomy(model, agent_type)
    return {
        "model": model,
        "agent_type": agent_type,
        "autonomy": level.value,
        "auto_approve": level == AutonomyLevel.AUTONOMOUS,
    }
