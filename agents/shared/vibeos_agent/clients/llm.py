"""LLMGatewayClient – thin async wrapper around the llm-gateway chat completions API."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from ..config import config


class LLMGatewayClient:
    """Thin async wrapper around the llm-gateway chat completions API."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.llm_gateway_url
        self._http = httpx.AsyncClient(base_url=self._base, timeout=120)

    async def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
        tool_choice: str | dict[str, Any] | None = None,
        workspace_id: str | None = None,
        agent_type: str | None = None,
        capability: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "messages": messages,
            "temperature": temperature,
        }
        if model:
            body["model"] = model
        if tools:
            body["tools"] = tools
        if tool_choice is not None:
            body["tool_choice"] = tool_choice
        if workspace_id:
            body["workspace_id"] = workspace_id
        if agent_type:
            body["agent_type"] = agent_type
        if capability:
            body["capability"] = capability
        resp = await self._http.post("/api/chat/completions", json=body)
        resp.raise_for_status()
        return resp.json()

    async def chat_stream(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str | None = None,
        temperature: float = 0.7,
        tools: list[dict[str, Any]] | None = None,
        workspace_id: str | None = None,
        agent_type: str | None = None,
        capability: dict[str, Any] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Yield SSE chunks from the LLM gateway streaming endpoint.

        When tools are present, the caller must handle tool_calls in the
        accumulated delta (``delta.tool_calls`` list fragments).
        """
        body: dict[str, Any] = {
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        if model:
            body["model"] = model
        if tools:
            body["tools"] = tools
        if workspace_id:
            body["workspace_id"] = workspace_id
        if agent_type:
            body["agent_type"] = agent_type
        if capability:
            body["capability"] = capability
        async with self._http.stream(
            "POST", "/api/chat/completions", json=body
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line or line.startswith(":"):
                    continue
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str == "[DONE]":
                        return
                    try:
                        yield json.loads(data_str)
                    except json.JSONDecodeError:
                        continue

    async def report_trust_outcome(
        self,
        model: str,
        agent_type: str,
        *,
        success: bool,
        latency_ms: float = 0,
    ) -> dict[str, Any]:
        """Report an execution outcome to update the trust score for a model+agent pair."""
        resp = await self._http.post(
            "/api/trust/outcome",
            json={
                "model": model,
                "agent_type": agent_type,
                "success": success,
                "latency_ms": latency_ms,
            },
        )
        resp.raise_for_status()
        return resp.json()

    async def check_autonomy(self, model: str, agent_type: str) -> dict[str, Any]:
        """Check the autonomy level for a model+agent pair."""
        resp = await self._http.get(f"/api/trust/autonomy/{model}/{agent_type}")
        resp.raise_for_status()
        return resp.json()

    async def list_trust_scores(self) -> list[dict[str, Any]]:
        """List all trust scores from llm-gateway."""
        resp = await self._http.get("/api/trust")
        resp.raise_for_status()
        data = resp.json()
        return data.get("scores", [])

    async def close(self) -> None:
        await self._http.aclose()
