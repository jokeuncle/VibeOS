"""VibeOS LLM Gateway – FastAPI application."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import litellm
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException
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
    # Sync any dynamically registered models back into MODULE_REGISTRY so _call_llm can look them up
    MODEL_REGISTRY.update(router_instance._profiles)
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
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str | None = ""
    tool_calls: list[dict[str, Any]] | None = None
    tool_call_id: str | None = None
    name: str | None = None


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
    tools: list[dict[str, Any]] | None = None
    tool_choice: str | dict[str, Any] | None = None


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
    messages: list[dict[str, Any]],
    *,
    temperature: float,
    max_tokens: int,
    stream: bool = False,
    tools: list[dict[str, Any]] | None = None,
    tool_choice: str | dict[str, Any] | None = None,
) -> Any:
    assert cb_registry is not None
    last_err: Exception | None = None

    for model in model_chain:
        cb = cb_registry.get(model)
        if not await cb.allow_request():
            continue

        try:
            profile = MODEL_REGISTRY.get(model)
            litellm_model = (profile.litellm_model or model) if profile else model
            kwargs: dict[str, Any] = {
                "model": litellm_model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": stream,
            }
            if tools:
                kwargs["tools"] = tools
            if tool_choice is not None:
                kwargs["tool_choice"] = tool_choice
            response = await litellm.acompletion(**kwargs)
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


def _serialize_messages(messages: list[ChatMessage]) -> list[dict[str, Any]]:
    """Serialize ChatMessage list to dicts suitable for LiteLLM, preserving tool fields."""
    result = []
    for m in messages:
        d: dict[str, Any] = {"role": m.role}
        if m.content is not None:
            d["content"] = m.content
        if m.tool_calls:
            d["tool_calls"] = m.tool_calls
        if m.tool_call_id:
            d["tool_call_id"] = m.tool_call_id
        if m.name:
            d["name"] = m.name
        result.append(d)
    return result


def _extract_tool_calls(message: Any) -> list[dict[str, Any]] | None:
    """Extract tool_calls from a LiteLLM response message into serializable dicts."""
    raw = getattr(message, "tool_calls", None)
    if not raw:
        return None
    calls = []
    for tc in raw:
        calls.append({
            "id": getattr(tc, "id", ""),
            "type": getattr(tc, "type", "function"),
            "function": {
                "name": getattr(tc.function, "name", ""),
                "arguments": getattr(tc.function, "arguments", ""),
            },
        })
    return calls or None


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
    messages = _serialize_messages(req.messages)

    if req.stream:
        return await _stream_response(model_chain, messages, req)

    response = await _call_with_circuit_breaker(
        model_chain,
        messages,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        tools=req.tools,
        tool_choice=req.tool_choice,
    )

    usage_dict = dict(response.usage) if response.usage else {}
    budget_status = await _track_tokens(req.workspace_id, usage_dict)

    choice = response.choices[0]
    tool_calls = _extract_tool_calls(choice.message)
    return ChatResponse(
        id=response.id,
        model=response.model,
        choices=[
            ChatChoice(
                message=ChatMessage(
                    role=choice.message.role,
                    content=getattr(choice.message, "content", None) or "",
                    tool_calls=tool_calls,
                ),
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
    messages = _serialize_messages(req.messages)
    return await _stream_response(model_chain, messages, req)


def _extract_delta_tool_calls(delta: Any) -> list[dict[str, Any]] | None:
    """Extract tool_calls fragments from a streaming delta."""
    raw = getattr(delta, "tool_calls", None)
    if not raw:
        return None
    calls = []
    for tc in raw:
        entry: dict[str, Any] = {"index": getattr(tc, "index", 0)}
        if getattr(tc, "id", None):
            entry["id"] = tc.id
        if getattr(tc, "type", None):
            entry["type"] = tc.type
        fn = getattr(tc, "function", None)
        if fn:
            f: dict[str, str] = {}
            if getattr(fn, "name", None):
                f["name"] = fn.name
            if getattr(fn, "arguments", None) is not None:
                f["arguments"] = fn.arguments
            if f:
                entry["function"] = f
        calls.append(entry)
    return calls or None


async def _stream_response(
    model_chain: list[str],
    messages: list[dict[str, Any]],
    req: ChatRequest,
) -> StreamingResponse:
    response = await _call_with_circuit_breaker(
        model_chain,
        messages,
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        stream=True,
        tools=req.tools,
        tool_choice=req.tool_choice,
    )

    async def event_generator() -> AsyncGenerator[str, None]:
        total_prompt = 0
        total_completion = 0
        try:
            async for chunk in response:
                if not chunk.choices:
                    continue
                delta = chunk.choices[0].delta
                delta_dict: dict[str, Any] = {
                    "role": getattr(delta, "role", None),
                    "content": getattr(delta, "content", "") or "",
                }
                tc = _extract_delta_tool_calls(delta)
                if tc:
                    delta_dict["tool_calls"] = tc
                data = {
                    "id": chunk.id,
                    "model": chunk.model,
                    "choices": [{
                        "index": 0,
                        "delta": delta_dict,
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

        if total_prompt or total_completion:
            logger.info(
                "Stream usage: prompt=%d completion=%d total=%d",
                total_prompt, total_completion, total_prompt + total_completion,
            )
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
