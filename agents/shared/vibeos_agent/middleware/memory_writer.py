"""MemoryWriterMiddleware -- auto-persists interaction summaries to memory."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from ..clients._utils import _enum_val
from ..models import AgentEvent
from .base import InvocationContext, Middleware, NextFn

logger = logging.getLogger(__name__)


class MemoryWriterMiddleware(Middleware):
    """After the inner pipeline produces a reply (stored on ``ctx.reply``),
    persist a concise summary to the memory service.
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
                await self._memory.add_memory(
                    f"User asked: {ctx.user_message}\nAgent replied: {ctx.reply[:500]}",
                    workspace_id=ctx.workspace_id,
                    agent_type=_enum_val(ctx.agent_type),
                )
            except Exception:
                logger.debug("Failed to persist memory", exc_info=True)
