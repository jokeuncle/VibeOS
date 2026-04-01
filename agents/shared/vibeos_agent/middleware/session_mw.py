"""SessionMiddleware -- loads conversation history with token-budget awareness."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass

from ..models import AgentEvent
from .base import InvocationContext, Middleware, NextFn

logger = logging.getLogger(__name__)


@dataclass
class TokenBudget:
    """Configurable token allocation for context window management."""

    max_context_tokens: int = 120_000
    system_prompt_reserve: int = 4_000
    tool_results_reserve: int = 8_000
    history_allocation: float = 0.3
    enrichment_allocation: float = 0.2


class SessionMiddleware(Middleware):
    """Loads session history into ``ctx.history`` before the downstream call,
    and appends user/assistant messages afterward.

    When a :class:`TokenBudget` is provided, the middleware estimates token
    usage and trims the oldest history entries to stay within budget.
    """

    def __init__(
        self,
        session_manager,
        *,
        budget: TokenBudget | None = None,
        history_limit: int = 50,
    ) -> None:
        self._session = session_manager
        self._budget = budget or TokenBudget()
        self._limit = history_limit

    async def process(
        self, ctx: InvocationContext, next_fn: NextFn
    ) -> AsyncIterator[AgentEvent]:
        history = await self._session.get_history(
            ctx.workspace_id, ctx.agent_type, limit=self._limit
        )

        if self._budget:
            history = self._trim_to_budget(history, ctx)

        ctx.history = history
        async for event in next_fn(ctx):
            yield event

    def _trim_to_budget(self, history: list, ctx: InvocationContext) -> list:
        budget = self._budget
        remaining = budget.max_context_tokens - budget.system_prompt_reserve - budget.tool_results_reserve
        history_tokens = int(remaining * budget.history_allocation)

        estimated = 0
        trimmed: list = []
        for msg in reversed(history):
            char_estimate = len(msg.content) // 4  # rough chars-to-tokens
            if estimated + char_estimate > history_tokens:
                break
            trimmed.append(msg)
            estimated += char_estimate

        trimmed.reverse()
        if len(trimmed) < len(history):
            logger.debug(
                "Trimmed session history from %d to %d messages (budget %d tokens)",
                len(history), len(trimmed), history_tokens,
            )
        return trimmed
