"""MemoryWriterMiddleware -- auto-persists structured interaction summaries."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import Any

from ..clients._utils import _enum_val
from ..models import AgentEvent
from .base import InvocationContext, Middleware, NextFn

logger = logging.getLogger(__name__)


class MemoryWriterMiddleware(Middleware):
    """After the inner pipeline produces a reply (stored on ``ctx.reply``),
    persist a structured memory entry to the memory service.

    Entries include the intent, phase context, decision rationale,
    and a summary — enabling richer downstream retrieval.
    """

    def __init__(self, memory_client) -> None:
        self._memory = memory_client

    async def process(
        self, ctx: InvocationContext, next_fn: NextFn
    ) -> AsyncGenerator[AgentEvent, None]:
        async for event in next_fn(ctx):
            yield event

        if ctx.reply:
            try:
                entry = self._build_structured_entry(ctx)
                await self._memory.add_memory(
                    entry["content"],
                    workspace_id=ctx.workspace_id,
                    agent_type=_enum_val(ctx.agent_type),
                    metadata=entry.get("metadata"),
                )
            except Exception:
                logger.debug("Failed to persist memory", exc_info=True)

    def _build_structured_entry(self, ctx: InvocationContext) -> dict[str, Any]:
        agent_key = _enum_val(ctx.agent_type)
        task_ctx = ctx.task_context or {}
        phase = task_ctx.get("phase_type", "")
        intent = task_ctx.get("intent", "conversation")
        task_title = task_ctx.get("task_title", "")

        reply_summary = ctx.reply[:800] if ctx.reply else ""

        content_parts = []
        if intent and intent != "conversation":
            content_parts.append(f"Intent: {intent}")
        if task_title:
            content_parts.append(f"Task: {task_title}")
        content_parts.append(f"User: {ctx.user_message[:300]}")
        content_parts.append(f"Agent ({agent_key}): {reply_summary}")

        metadata: dict[str, Any] = {
            "layer": "project",
            "agent_type": agent_key,
            "intent": intent,
        }
        if phase:
            metadata["phase"] = phase
        if task_title:
            metadata["task_title"] = task_title

        artifacts = task_ctx.get("produced_artifacts")
        if artifacts and isinstance(artifacts, list):
            metadata["artifact_types"] = list({a.get("type", "") for a in artifacts if isinstance(a, dict)})

        return {
            "content": "\n".join(content_parts),
            "metadata": metadata,
        }
