"""Per-workspace monthly token budget management backed by Redis."""

from __future__ import annotations

import datetime
from dataclasses import dataclass
from enum import Enum

import redis.asyncio as redis


class BudgetStatus(str, Enum):
    OK = "ok"
    WARNING = "warning"
    EXCEEDED = "exceeded"


@dataclass
class UsageRecord:
    workspace_id: str
    input_tokens: int
    output_tokens: int
    total_tokens: int
    limit: int
    status: BudgetStatus
    remaining: int
    period: str


class TokenBudgetManager:
    def __init__(
        self,
        redis_client: redis.Redis,
        monthly_limit: int = 10_000_000,
        warn_pct: float = 0.8,
    ) -> None:
        self._redis = redis_client
        self.monthly_limit = monthly_limit
        self.warn_pct = warn_pct

    def _key(self, workspace_id: str, dt: datetime.date | None = None) -> str:
        dt = dt or datetime.date.today()
        return f"budget:{workspace_id}:{dt.year}:{dt.month}"

    async def record_usage(
        self,
        workspace_id: str,
        input_tokens: int,
        output_tokens: int,
    ) -> UsageRecord:
        key = self._key(workspace_id)
        pipe = self._redis.pipeline()
        pipe.hincrby(key, "input_tokens", input_tokens)
        pipe.hincrby(key, "output_tokens", output_tokens)
        pipe.hincrby(key, "total_tokens", input_tokens + output_tokens)
        pipe.expire(key, 60 * 60 * 24 * 35)  # auto-expire after ~35 days
        results = await pipe.execute()

        total = int(results[2])
        return self._build_record(workspace_id, int(results[0]), int(results[1]), total)

    async def get_usage(self, workspace_id: str) -> UsageRecord:
        key = self._key(workspace_id)
        data = await self._redis.hgetall(key)
        input_t = int(data.get(b"input_tokens", data.get("input_tokens", 0)))
        output_t = int(data.get(b"output_tokens", data.get("output_tokens", 0)))
        total_t = int(data.get(b"total_tokens", data.get("total_tokens", 0)))
        return self._build_record(workspace_id, input_t, output_t, total_t)

    async def check_budget(self, workspace_id: str, priority: str = "normal") -> BudgetStatus:
        usage = await self.get_usage(workspace_id)
        if usage.status == BudgetStatus.EXCEEDED and priority == "P0":
            return BudgetStatus.WARNING
        return usage.status

    def _build_record(
        self, workspace_id: str, input_t: int, output_t: int, total_t: int
    ) -> UsageRecord:
        remaining = max(0, self.monthly_limit - total_t)

        if total_t >= self.monthly_limit:
            status = BudgetStatus.EXCEEDED
        elif total_t >= int(self.monthly_limit * self.warn_pct):
            status = BudgetStatus.WARNING
        else:
            status = BudgetStatus.OK

        now = datetime.date.today()
        return UsageRecord(
            workspace_id=workspace_id,
            input_tokens=input_t,
            output_tokens=output_t,
            total_tokens=total_t,
            limit=self.monthly_limit,
            status=status,
            remaining=remaining,
            period=f"{now.year}-{now.month:02d}",
        )
