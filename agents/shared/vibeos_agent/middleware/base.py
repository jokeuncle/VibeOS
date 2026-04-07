"""Core middleware abstractions: context, pipeline, and base class."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator, AsyncIterator, Callable
from dataclasses import dataclass, field
from typing import Any, cast

from ..models import AgentEvent, AgentType

logger = logging.getLogger(__name__)

NextFn = Callable[["InvocationContext"], AsyncIterator[AgentEvent]]


@dataclass
class InvocationContext:
    """Mutable bag of state that flows through the middleware pipeline.

    Each middleware can read/write fields; the final handler (LLM call or
    agent ``execute``) consumes the accumulated state.
    """

    workspace_id: str
    agent_type: AgentType
    user_message: str
    mode: str = "conversation"

    locale: str = "auto"
    target_agent: str | None = None

    system_prompt: str = ""
    enriched_prompt: str | None = None
    messages: list[dict[str, Any]] = field(default_factory=list)
    history: list[Any] = field(default_factory=list)
    extra_messages: list[dict[str, Any]] = field(default_factory=list)

    repo_context: dict[str, Any] | None = None
    task_context: dict[str, Any] | None = None
    tool_results: list[dict[str, Any]] = field(default_factory=list)
    reply: str = ""

    metadata: dict[str, Any] = field(default_factory=dict)


class Middleware(ABC):
    """Base class for agent middleware.

    Follows the onion model: each middleware wraps the next via *next_fn*.
    """

    @abstractmethod
    async def process(
        self,
        ctx: InvocationContext,
        next_fn: NextFn,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Process the invocation; call ``next_fn(ctx)`` to continue the chain."""
        if False:  # pragma: no cover — yield marks async generator for static analysis
            yield cast(AgentEvent, None)


class MiddlewarePipeline:
    """Ordered chain of :class:`Middleware` instances executed as nested wrappers."""

    def __init__(self) -> None:
        self._chain: list[Middleware] = []

    def use(self, mw: Middleware) -> MiddlewarePipeline:
        self._chain.append(mw)
        return self

    def use_many(self, mws: list[Middleware]) -> MiddlewarePipeline:
        self._chain.extend(mws)
        return self

    async def run(
        self,
        ctx: InvocationContext,
        terminal: NextFn | None = None,
    ) -> AsyncGenerator[AgentEvent, None]:
        """Execute the pipeline, ending with *terminal* (or an empty handler)."""

        async def _empty_terminal(_ctx: InvocationContext) -> AsyncGenerator[AgentEvent, None]:
            return
            yield  # noqa: unreachable -- makes this a proper async generator

        final = terminal or _empty_terminal
        handler = self._build_chain(final)
        async for event in handler(ctx):
            yield event

    def _build_chain(self, terminal: NextFn) -> NextFn:
        handler = terminal
        for mw in reversed(self._chain):
            handler = _wrap(mw, handler)
        return handler


def _wrap(mw: Middleware, next_fn: NextFn) -> NextFn:
    async def _handler(ctx: InvocationContext) -> AsyncGenerator[AgentEvent, None]:
        async for event in mw.process(ctx, next_fn):
            yield event

    return _handler
