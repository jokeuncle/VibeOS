"""BaseAdapter — uniform interface isolating AI from traditional infrastructure.

.. note::

    **Experimental / internal.** Prefer ``BaseTool`` for new integrations.
    See ``adapters/__init__.py`` for details.

Every adapter (GitLab Pipeline, SSH, script runner, etc.) must implement three
methods so the orchestration layer never touches infrastructure details directly.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class AdapterStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELED = "canceled"
    UNKNOWN = "unknown"


class AdapterResult(BaseModel):
    """Standardised return value from every adapter method."""

    task_id: str = Field(description="External identifier (e.g. GitLab pipeline ID)")
    status: AdapterStatus = AdapterStatus.UNKNOWN
    detail: str = ""
    web_url: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)


class BaseAdapter(ABC):
    """Abstract bridge-layer adapter.

    Subclasses wrap a specific infrastructure service and expose a stable
    interface so the AI orchestration layer is zero-coupled to the underlying
    platform.  When the platform changes, only the adapter needs updating.
    """

    name: str = "base"

    @abstractmethod
    async def execute_task(self, params: dict[str, Any]) -> AdapterResult:
        """Trigger a task on the remote infrastructure.

        Returns an ``AdapterResult`` with an external ``task_id`` that can be
        used for subsequent ``get_task_status`` / ``cancel_task`` calls.
        """
        ...

    @abstractmethod
    async def get_task_status(self, task_id: str) -> AdapterResult:
        """Query the current status of a previously triggered task."""
        ...

    @abstractmethod
    async def cancel_task(self, task_id: str) -> AdapterResult:
        """Request cancellation of a running task (best-effort)."""
        ...
