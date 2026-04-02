"""Trust Score – tracks model reliability per agent type to control autonomy levels."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum

import redis.asyncio as redis


class AutonomyLevel(str, Enum):
    SUPERVISED = "supervised"
    SEMI_AUTONOMOUS = "semi_autonomous"
    AUTONOMOUS = "autonomous"


@dataclass
class TrustRecord:
    model: str
    agent_type: str
    total_calls: int = 0
    successes: int = 0
    failures: int = 0
    score: float = 50.0
    autonomy: AutonomyLevel = AutonomyLevel.SUPERVISED

    @property
    def success_rate(self) -> float:
        if self.total_calls == 0:
            return 0.0
        return self.successes / self.total_calls


AUTO_APPROVE_THRESHOLD = 80.0
HUMAN_REVIEW_THRESHOLD = 50.0

# Exponential moving average weight for new observations
EMA_ALPHA = 0.1


def _compute_autonomy(score: float) -> AutonomyLevel:
    if score >= AUTO_APPROVE_THRESHOLD:
        return AutonomyLevel.AUTONOMOUS
    if score >= HUMAN_REVIEW_THRESHOLD:
        return AutonomyLevel.SEMI_AUTONOMOUS
    return AutonomyLevel.SUPERVISED


class TrustScoreManager:
    """Redis-backed trust score tracking per model + agent_type pair."""

    KEY_PREFIX = "trust"

    def __init__(self, redis_client: redis.Redis) -> None:
        self._redis = redis_client

    def _key(self, model: str, agent_type: str) -> str:
        return f"{self.KEY_PREFIX}:{model}:{agent_type}"

    async def record_outcome(
        self,
        model: str,
        agent_type: str,
        *,
        success: bool,
        latency_ms: float = 0,
    ) -> TrustRecord:
        key = self._key(model, agent_type)
        pipe = self._redis.pipeline()
        pipe.hincrby(key, "total_calls", 1)
        if success:
            pipe.hincrby(key, "successes", 1)
        else:
            pipe.hincrby(key, "failures", 1)
        pipe.hget(key, "score")
        results = await pipe.execute()

        raw_score = results[2]
        current_score = float(raw_score) if raw_score else 50.0

        observation = 100.0 if success else 0.0
        new_score = current_score * (1 - EMA_ALPHA) + observation * EMA_ALPHA
        new_score = max(0.0, min(100.0, new_score))

        autonomy = _compute_autonomy(new_score)
        await self._redis.hset(key, mapping={
            "score": str(new_score),
            "autonomy": autonomy.value,
            "last_updated": str(time.time()),
        })

        data = await self._redis.hgetall(key)
        return TrustRecord(
            model=model,
            agent_type=agent_type,
            total_calls=int(data.get(b"total_calls", data.get("total_calls", 0))),
            successes=int(data.get(b"successes", data.get("successes", 0))),
            failures=int(data.get(b"failures", data.get("failures", 0))),
            score=new_score,
            autonomy=autonomy,
        )

    async def get_trust(self, model: str, agent_type: str) -> TrustRecord:
        key = self._key(model, agent_type)
        data = await self._redis.hgetall(key)
        if not data:
            return TrustRecord(model=model, agent_type=agent_type)

        def _v(k: str) -> str:
            return (data.get(k.encode(), data.get(k, b"0"))).decode() if isinstance(
                data.get(k.encode(), data.get(k, b"0")), bytes
            ) else str(data.get(k, "0"))

        score = float(_v("score")) if _v("score") != "0" else 50.0
        return TrustRecord(
            model=model,
            agent_type=agent_type,
            total_calls=int(_v("total_calls")),
            successes=int(_v("successes")),
            failures=int(_v("failures")),
            score=score,
            autonomy=_compute_autonomy(score),
        )

    async def get_all_scores(self) -> list[TrustRecord]:
        records: list[TrustRecord] = []
        cursor = 0
        while True:
            cursor, keys = await self._redis.scan(cursor, match=f"{self.KEY_PREFIX}:*", count=100)
            for key in keys:
                key_str = key.decode() if isinstance(key, bytes) else key
                parts = key_str.split(":")
                if len(parts) >= 3:
                    model = parts[1]
                    agent_type = ":".join(parts[2:])
                    record = await self.get_trust(model, agent_type)
                    records.append(record)
            if cursor == 0:
                break
        return records

    async def check_autonomy(self, model: str, agent_type: str) -> AutonomyLevel:
        record = await self.get_trust(model, agent_type)
        return record.autonomy
