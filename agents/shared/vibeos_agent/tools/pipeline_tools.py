"""Pipeline tools — agent-callable wrappers around bridge-layer adapters.

These tools let any domain agent (primarily cicd-agent) trigger and monitor
CI/CD pipelines through the unified adapter interface.  The AI never touches
GitLab / Jenkins / scripts directly — everything goes through the adapter.
"""

from __future__ import annotations

from typing import Any

from ..adapters import AdapterRegistry, GitLabPipelineAdapter
from .base import BaseTool


class TriggerPipeline(BaseTool):
    """Trigger a CI/CD pipeline on the configured infrastructure."""

    name = "trigger_pipeline"
    display_name = "触发流水线"
    description = (
        "Trigger a CI/CD pipeline build for a GitLab project. "
        "Returns the pipeline ID and URL for status tracking."
    )
    parameters = {
        "type": "object",
        "properties": {
            "project_id": {
                "type": "string",
                "description": "GitLab project ID or namespace/path",
            },
            "ref": {
                "type": "string",
                "description": "Branch or tag to build (default: main)",
            },
            "variables": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "key": {"type": "string"},
                        "value": {"type": "string"},
                    },
                },
                "description": "Pipeline variables to pass",
            },
        },
        "required": ["project_id"],
    }

    def __init__(self, registry: AdapterRegistry) -> None:
        self._registry = registry

    async def mock(self, **kwargs: Any) -> str:
        return self._json_result({
            "mock": True,
            "task_id": f"{kwargs.get('project_id', 'mock')}::42",
            "status": "created",
            "web_url": "https://gitlab.example.com/mock/pipelines/42",
        })

    async def _execute(self, **kwargs: Any) -> str:
        adapter = self._registry.get("gitlab_pipeline")
        if not adapter:
            return self._json_result({"error": "GitLab pipeline adapter not registered"})

        context = kwargs.pop("_context", {})
        params = {
            "project_id": kwargs["project_id"],
            "ref": kwargs.get("ref", "main"),
            "variables": kwargs.get("variables", []),
            "credential_id": context.get("gitlab_credential_id"),
        }

        result = await adapter.execute_task(params)
        return self._json_result(result.model_dump())


class GetPipelineStatus(BaseTool):
    """Query current status of a previously triggered pipeline."""

    name = "get_pipeline_status"
    display_name = "查询流水线"
    description = (
        "Check the current status of a running or completed CI/CD pipeline. "
        "Provide the task_id returned by trigger_pipeline."
    )
    parameters = {
        "type": "object",
        "properties": {
            "task_id": {
                "type": "string",
                "description": "Pipeline task ID (format: project_id::pipeline_id)",
            },
        },
        "required": ["task_id"],
    }

    def __init__(self, registry: AdapterRegistry) -> None:
        self._registry = registry

    async def mock(self, **kwargs: Any) -> str:
        return self._json_result({
            "mock": True,
            "task_id": kwargs.get("task_id", "mock::1"),
            "status": "success",
            "finished_at": "2025-01-01T00:05:00Z",
        })

    async def _execute(self, **kwargs: Any) -> str:
        adapter = self._registry.get("gitlab_pipeline")
        if not adapter:
            return self._json_result({"error": "GitLab pipeline adapter not registered"})

        result = await adapter.get_task_status(kwargs["task_id"])
        return self._json_result(result.model_dump())


class GetPipelineLogs(BaseTool):
    """Fetch job logs from a CI/CD pipeline."""

    name = "get_pipeline_logs"
    display_name = "查看日志"
    description = (
        "Retrieve build/test logs from a CI/CD pipeline's jobs. "
        "Useful for diagnosing failures or reviewing build output."
    )
    parameters = {
        "type": "object",
        "properties": {
            "task_id": {
                "type": "string",
                "description": "Pipeline task ID (format: project_id::pipeline_id)",
            },
        },
        "required": ["task_id"],
    }

    def __init__(self, registry: AdapterRegistry) -> None:
        self._registry = registry

    async def mock(self, **kwargs: Any) -> str:
        return self._json_result({
            "mock": True,
            "task_id": kwargs.get("task_id", "mock::1"),
            "jobs": [{"name": "build", "status": "success", "log_excerpt": "(mock) Build completed."}],
        })

    async def _execute(self, **kwargs: Any) -> str:
        adapter = self._registry.get("gitlab_pipeline")
        if not adapter or not isinstance(adapter, GitLabPipelineAdapter):
            return self._json_result({"error": "GitLab pipeline adapter not registered"})

        result = await adapter.get_pipeline_jobs(kwargs["task_id"])
        return self._json_result(result.model_dump())


class CancelPipeline(BaseTool):
    """Cancel a running CI/CD pipeline."""

    name = "cancel_pipeline"
    display_name = "取消流水线"
    description = "Cancel a running CI/CD pipeline. Best-effort cancellation."
    parameters = {
        "type": "object",
        "properties": {
            "task_id": {
                "type": "string",
                "description": "Pipeline task ID (format: project_id::pipeline_id)",
            },
        },
        "required": ["task_id"],
    }

    def __init__(self, registry: AdapterRegistry) -> None:
        self._registry = registry

    async def mock(self, **kwargs: Any) -> str:
        return self._json_result({
            "mock": True,
            "task_id": kwargs.get("task_id", "mock::1"),
            "status": "cancelled",
        })

    async def _execute(self, **kwargs: Any) -> str:
        adapter = self._registry.get("gitlab_pipeline")
        if not adapter:
            return self._json_result({"error": "GitLab pipeline adapter not registered"})

        result = await adapter.cancel_task(kwargs["task_id"])
        return self._json_result(result.model_dump())


def create_pipeline_tools(registry: AdapterRegistry | None = None) -> list[BaseTool]:
    """Factory: create all pipeline tools with a shared adapter registry.

    If no registry is provided, a default one with GitLabPipelineAdapter is created.
    """
    if registry is None:
        registry = AdapterRegistry()
        registry.register(GitLabPipelineAdapter())
    return [
        TriggerPipeline(registry),
        GetPipelineStatus(registry),
        GetPipelineLogs(registry),
        CancelPipeline(registry),
    ]
