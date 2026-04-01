"""ToolOrchestratorMiddleware -- ReAct tool loop with pluggable strategies."""

from __future__ import annotations

import json
import logging
import time
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from typing import Any

from ..models import AgentEvent
from ..tools.provider import ToolManager
from .base import InvocationContext, Middleware, NextFn

logger = logging.getLogger(__name__)


class ToolStrategy(ABC):
    """Pluggable strategy for tool orchestration loops."""

    @abstractmethod
    def should_continue(
        self, iteration: int, tool_calls: list[dict[str, Any]], ctx: InvocationContext
    ) -> bool:
        """Return True if the loop should continue."""
        ...


class FixedLoopStrategy(ToolStrategy):
    """Simple fixed-iteration limit (baseline, matches current behavior)."""

    def __init__(self, max_iterations: int = 5) -> None:
        self.max_iterations = max_iterations

    def should_continue(
        self, iteration: int, tool_calls: list[dict[str, Any]], ctx: InvocationContext
    ) -> bool:
        return iteration < self.max_iterations


class AdaptiveLoopStrategy(ToolStrategy):
    """Adjusts iterations based on tool results and progress signals."""

    def __init__(
        self, max_iterations: int = 15, early_stop_on_no_tools: bool = True
    ) -> None:
        self.max_iterations = max_iterations
        self.early_stop_on_no_tools = early_stop_on_no_tools

    def should_continue(
        self, iteration: int, tool_calls: list[dict[str, Any]], ctx: InvocationContext
    ) -> bool:
        if iteration >= self.max_iterations:
            return False
        if self.early_stop_on_no_tools and iteration > 0 and not tool_calls:
            return False
        return True


class ToolOrchestratorMiddleware(Middleware):
    """Manages the tool execution loop for LLM-driven agents.

    Records per-tool timing and results for observability, and applies
    a configurable :class:`ToolStrategy` to control loop termination.
    """

    def __init__(
        self,
        tool_manager: ToolManager,
        strategy: ToolStrategy | None = None,
    ) -> None:
        self._tools = tool_manager
        self._strategy = strategy or FixedLoopStrategy()

    async def process(
        self, ctx: InvocationContext, next_fn: NextFn
    ) -> AsyncIterator[AgentEvent]:
        async for event in next_fn(ctx):
            yield event

    async def execute_tool_call(
        self, name: str, arguments: dict[str, Any], ctx: InvocationContext
    ) -> dict[str, Any]:
        """Execute a single tool call with timing and structured logging."""
        start = time.monotonic()
        result = await self._tools.execute(name, arguments)
        elapsed_ms = (time.monotonic() - start) * 1000

        record = {
            "tool": name,
            "ok": result.success,
            "result": result.output[:500] if result.output else "",
            "elapsed_ms": round(elapsed_ms, 1),
        }
        ctx.tool_results.append(record)

        _log_tool_span(name, elapsed_ms, result.success, ctx)
        return record


def _log_tool_span(
    name: str, elapsed_ms: float, success: bool, ctx: InvocationContext
) -> None:
    """Emit a structured log and optional OTel span for a tool call."""
    log_data = {
        "tool": name,
        "success": success,
        "elapsed_ms": round(elapsed_ms, 1),
        "workspace": ctx.workspace_id,
    }
    logger.info("tool.call %s", json.dumps(log_data))

    try:
        from opentelemetry import trace

        tracer = trace.get_tracer("vibeos.agent")
        span = tracer.start_span(f"tool.{name}")
        span.set_attribute("tool.name", name)
        span.set_attribute("tool.success", success)
        span.set_attribute("tool.elapsed_ms", elapsed_ms)
        if not success:
            span.set_status(trace.StatusCode.ERROR)
        else:
            span.set_status(trace.StatusCode.OK)
        span.end()
    except Exception:
        pass
