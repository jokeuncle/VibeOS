"""WSStatusMiddleware -- publish agent:status RUNNING/IDLE/ERROR transitions."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

from ..clients._utils import _enum_val
from ..models import AgentEvent, AgentStatus
from .base import InvocationContext, Middleware, NextFn

logger = logging.getLogger(__name__)


class WSStatusMiddleware(Middleware):
    """Wraps the pipeline in RUNNING -> IDLE status transitions.

    On entry, publishes ``agent:status RUNNING``.
    On success, publishes ``agent:status IDLE``.
    On error, publishes ``agent:status ERROR`` then ``IDLE``.
    """

    def __init__(self, ws_client) -> None:
        self._ws = ws_client

    async def process(
        self, ctx: InvocationContext, next_fn: NextFn
    ) -> AsyncGenerator[AgentEvent, None]:
        try:
            await self._ws.publish_agent_status(
                ctx.workspace_id, ctx.agent_type, AgentStatus.RUNNING
            )
        except Exception:
            logger.debug("Failed to publish RUNNING status", exc_info=True)

        try:
            async for event in next_fn(ctx):
                yield event
        except Exception:
            try:
                await self._ws.publish_agent_status(
                    ctx.workspace_id, ctx.agent_type, AgentStatus.ERROR,
                    detail=f"{ctx.mode} failed",
                )
            except Exception:
                logger.debug("Failed to publish ERROR status", exc_info=True)
            raise
        finally:
            try:
                await self._ws.publish_agent_status(
                    ctx.workspace_id, ctx.agent_type, AgentStatus.IDLE
                )
            except Exception:
                logger.debug("Failed to reset agent status to IDLE", exc_info=True)
