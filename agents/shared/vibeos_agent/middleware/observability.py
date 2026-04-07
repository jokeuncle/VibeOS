"""ObservabilityMiddleware -- structured logging and timing for agent invocations."""

from __future__ import annotations

import logging
import time
from collections.abc import AsyncGenerator

from ..clients._utils import _enum_val
from ..models import AgentEvent
from .base import InvocationContext, Middleware, NextFn

logger = logging.getLogger(__name__)


class ObservabilityMiddleware(Middleware):
    """Emits structured log records at the start and end of each invocation,
    including timing and error information.

    When OpenTelemetry is available, creates a span wrapping the full pipeline
    (gracefully degrades to plain logging otherwise).
    """

    async def process(
        self, ctx: InvocationContext, next_fn: NextFn
    ) -> AsyncGenerator[AgentEvent, None]:
        agent_key = _enum_val(ctx.agent_type)
        start = time.monotonic()
        logger.info(
            "agent.invoke.start agent=%s mode=%s ws=%s",
            agent_key, ctx.mode, ctx.workspace_id,
        )

        span = _start_span(f"agent.{agent_key}.{ctx.mode}", ctx)
        error: BaseException | None = None
        try:
            async for event in next_fn(ctx):
                yield event
        except BaseException as exc:
            error = exc
            raise
        finally:
            elapsed_ms = (time.monotonic() - start) * 1000
            if error:
                logger.warning(
                    "agent.invoke.error agent=%s mode=%s elapsed_ms=%.1f error=%s",
                    agent_key, ctx.mode, elapsed_ms, error,
                )
            else:
                logger.info(
                    "agent.invoke.done agent=%s mode=%s elapsed_ms=%.1f tools=%d",
                    agent_key, ctx.mode, elapsed_ms, len(ctx.tool_results),
                )
            _end_span(span, error)


def _start_span(name: str, ctx: InvocationContext):
    """Start an OpenTelemetry span if the SDK is available."""
    try:
        from opentelemetry import trace

        tracer = trace.get_tracer("vibeos.agent")
        span = tracer.start_span(name)
        span.set_attribute("agent.type", _enum_val(ctx.agent_type))
        span.set_attribute("agent.mode", ctx.mode)
        span.set_attribute("workspace.id", ctx.workspace_id)
        return span
    except Exception:
        return None


def _end_span(span, error: BaseException | None) -> None:
    if span is None:
        return
    try:
        from opentelemetry import trace

        if error:
            span.set_status(trace.StatusCode.ERROR, str(error))
            span.record_exception(error)
        else:
            span.set_status(trace.StatusCode.OK)
        span.end()
    except Exception:
        pass
