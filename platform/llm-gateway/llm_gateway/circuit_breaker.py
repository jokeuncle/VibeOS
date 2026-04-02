"""Per-model circuit breaker with CLOSED / OPEN / HALF_OPEN states."""

from __future__ import annotations

import asyncio
import time
from enum import Enum


class State(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 3,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls

        self._state = State.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_calls = 0
        self._last_failure_time: float = 0.0
        self._lock = asyncio.Lock()

        self.total_requests: int = 0
        self.total_failures: int = 0

    @property
    def state(self) -> State:
        if self._state == State.OPEN:
            if time.monotonic() - self._last_failure_time >= self.recovery_timeout:
                self._state = State.HALF_OPEN
                self._half_open_calls = 0
        return self._state

    async def allow_request(self) -> bool:
        async with self._lock:
            current = self.state
            if current == State.CLOSED:
                return True
            if current == State.HALF_OPEN:
                if self._half_open_calls < self.half_open_max_calls:
                    self._half_open_calls += 1
                    return True
                return False
            return False

    async def record_success(self) -> None:
        async with self._lock:
            self.total_requests += 1
            self._success_count += 1
            if self._state == State.HALF_OPEN:
                if self._success_count >= self.half_open_max_calls:
                    self._reset()
            elif self._state == State.CLOSED:
                self._failure_count = 0

    async def record_failure(self) -> None:
        async with self._lock:
            self.total_requests += 1
            self.total_failures += 1
            self._failure_count += 1
            self._last_failure_time = time.monotonic()

            if self._state == State.HALF_OPEN:
                self._trip()
            elif self._failure_count >= self.failure_threshold:
                self._trip()

    def _trip(self) -> None:
        self._state = State.OPEN
        self._success_count = 0

    def _reset(self) -> None:
        self._state = State.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._half_open_calls = 0

    @property
    def failure_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return self.total_failures / self.total_requests

    def status(self) -> dict:
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self._failure_count,
            "failure_rate": round(self.failure_rate, 4),
            "total_requests": self.total_requests,
        }


class CircuitBreakerRegistry:
    """Manages per-model circuit breaker instances."""

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 3,
    ) -> None:
        self._breakers: dict[str, CircuitBreaker] = {}
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._half_open_max_calls = half_open_max_calls

    def get(self, model: str) -> CircuitBreaker:
        if model not in self._breakers:
            self._breakers[model] = CircuitBreaker(
                name=model,
                failure_threshold=self._failure_threshold,
                recovery_timeout=self._recovery_timeout,
                half_open_max_calls=self._half_open_max_calls,
            )
        return self._breakers[model]

    def all_status(self) -> list[dict]:
        return [cb.status() for cb in self._breakers.values()]

    def reset_all(self) -> int:
        count = 0
        for cb in self._breakers.values():
            cb._reset()
            count += 1
        return count
