"""Redis-backed session manager for agent conversations."""

from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis

from .config import config
from .models import AgentType, Message

_KEY_PREFIX = "session"


def _key(workspace_id: str, agent_type: AgentType) -> str:
    return f"{_KEY_PREFIX}:{workspace_id}:{agent_type}"


class SessionManager:
    """Stores per-workspace, per-agent conversation history in Redis."""

    def __init__(self, redis_url: str | None = None) -> None:
        self._redis_url = redis_url or config.redis_url
        self._pool: aioredis.Redis | None = None

    async def _redis(self) -> aioredis.Redis:
        if self._pool is None:
            self._pool = aioredis.from_url(
                self._redis_url, decode_responses=True
            )
        return self._pool

    async def get_history(
        self,
        workspace_id: str,
        agent_type: AgentType,
        limit: int = 50,
    ) -> list[Message]:
        r = await self._redis()
        raw: list[Any] = await r.lrange(_key(workspace_id, agent_type), -limit, -1)
        return [Message.model_validate_json(item) for item in raw]

    async def append(
        self,
        workspace_id: str,
        agent_type: AgentType,
        message: Message,
    ) -> None:
        r = await self._redis()
        await r.rpush(
            _key(workspace_id, agent_type),
            message.model_dump_json(),
        )

    async def clear(self, workspace_id: str, agent_type: AgentType) -> None:
        r = await self._redis()
        await r.delete(_key(workspace_id, agent_type))

    async def get_context(
        self,
        workspace_id: str,
        agent_type: AgentType,
    ) -> dict[str, Any]:
        """Return arbitrary JSON context blob stored alongside history."""
        r = await self._redis()
        raw = await r.get(f"{_key(workspace_id, agent_type)}:ctx")
        if raw is None:
            return {}
        return json.loads(raw)

    async def set_context(
        self,
        workspace_id: str,
        agent_type: AgentType,
        ctx: dict[str, Any],
    ) -> None:
        r = await self._redis()
        await r.set(
            f"{_key(workspace_id, agent_type)}:ctx",
            json.dumps(ctx),
        )

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.aclose()
            self._pool = None
