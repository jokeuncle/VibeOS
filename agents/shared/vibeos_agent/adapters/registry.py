"""AdapterRegistry — central lookup for bridge-layer adapters.

Usage:
    registry = AdapterRegistry()
    registry.register(GitLabPipelineAdapter())
    adapter = registry.get("gitlab_pipeline")
    result = await adapter.execute_task({...})
"""

from __future__ import annotations

from .base import BaseAdapter


class AdapterRegistry:
    """Thread-safe registry mapping adapter names to instances."""

    def __init__(self) -> None:
        self._adapters: dict[str, BaseAdapter] = {}

    def register(self, adapter: BaseAdapter) -> None:
        self._adapters[adapter.name] = adapter

    def get(self, name: str) -> BaseAdapter | None:
        return self._adapters.get(name)

    def list_adapters(self) -> list[str]:
        return list(self._adapters.keys())

    @property
    def has_adapters(self) -> bool:
        return bool(self._adapters)
