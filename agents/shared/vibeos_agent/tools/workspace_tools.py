"""Workspace tools – let agents interact with workspace-svc via function calling."""

from __future__ import annotations

from typing import Any

from .base import BaseTool


class WorkspaceCreateTask(BaseTool):
    name = "workspace_create_task"
    display_name = "创建任务"
    description = "Create a new task in the current workspace under a specific phase."
    parameters = {
        "type": "object",
        "properties": {
            "phase_type": {
                "type": "string",
                "description": "Phase type (requirement, architecture, design, development, testing, deployment, monitoring)",
            },
            "title": {"type": "string", "description": "Task title"},
            "description": {"type": "string", "description": "Detailed task description"},
            "priority": {
                "type": "string",
                "enum": ["p0", "p1", "p2", "p3"],
                "description": "Task priority",
            },
        },
        "required": ["phase_type", "title"],
    }

    def __init__(self, ws_client: Any) -> None:
        self._ws = ws_client

    async def execute(self, **kwargs: Any) -> str:
        workspace_id = kwargs.pop("_workspace_id", "")
        phase_type = kwargs.get("phase_type", "architecture")
        title = kwargs.get("title", "Untitled")
        description = kwargs.get("description", "")
        priority = kwargs.get("priority", "p2")

        phase_id = await self._ws.find_phase_by_type(workspace_id, phase_type)
        if not phase_id:
            return self._json_result({"error": f"Phase '{phase_type}' not found"})

        from ..models import Task as TaskModel
        task = TaskModel(title=title, description=description, priority=priority)
        result = await self._ws.create_task(workspace_id, task, phase_id=phase_id)
        return self._json_result({"status": "created", "task": result.get("data", result)})


class WorkspaceUpdateTaskStatus(BaseTool):
    name = "workspace_update_task_status"
    display_name = "更新任务状态"
    description = "Update a task's status (pending, in_progress, completed)."
    parameters = {
        "type": "object",
        "properties": {
            "task_id": {"type": "string", "description": "The task ID to update"},
            "status": {
                "type": "string",
                "enum": ["pending", "in_progress", "completed"],
                "description": "New status",
            },
        },
        "required": ["task_id", "status"],
    }

    def __init__(self, ws_client: Any) -> None:
        self._ws = ws_client

    async def execute(self, **kwargs: Any) -> str:
        workspace_id = kwargs.pop("_workspace_id", "")
        task_id = kwargs.get("task_id", "")
        status = kwargs.get("status", "")
        result = await self._ws.update_task(workspace_id, task_id, {"status": status})
        return self._json_result({"status": "updated", "task": result.get("data", result)})


class WorkspaceCreateArtifact(BaseTool):
    name = "workspace_create_artifact"
    display_name = "创建工件"
    description = "Save a structured artifact (spec, code, config, etc.) to the workspace."
    parameters = {
        "type": "object",
        "properties": {
            "artifact_type": {
                "type": "string",
                "description": "Artifact type (e.g., spec, api_schema, code, test_plan, deployment_config)",
            },
            "title": {"type": "string", "description": "Artifact title"},
            "content": {"type": "string", "description": "Artifact content (text, code, JSON, YAML, etc.)"},
            "phase_type": {
                "type": "string",
                "description": "Phase to attach the artifact to (optional)",
            },
        },
        "required": ["artifact_type", "title", "content"],
    }

    def __init__(self, ws_client: Any, agent_type: str) -> None:
        self._ws = ws_client
        self._agent_type = agent_type

    async def execute(self, **kwargs: Any) -> str:
        workspace_id = kwargs.pop("_workspace_id", "")
        artifact_type = kwargs.get("artifact_type", "document")
        title = kwargs.get("title", "Untitled")
        content = kwargs.get("content", "")

        result = await self._ws.create_artifact(
            workspace_id,
            agent_type=self._agent_type,
            artifact_type=artifact_type,
            title=title,
            content=content,
        )
        return self._json_result({"status": "saved", "artifact": result.get("data", result)})


class WorkspaceQueryPhases(BaseTool):
    name = "workspace_query_phases"
    display_name = "查询阶段"
    description = "List all phases and their tasks/status in the current workspace."
    parameters = {"type": "object", "properties": {}}

    def __init__(self, ws_client: Any) -> None:
        self._ws = ws_client

    async def execute(self, **kwargs: Any) -> str:
        workspace_id = kwargs.pop("_workspace_id", "")
        phases = await self._ws.get_phases(workspace_id)
        summary = []
        for p in phases:
            tasks = p.get("tasks", [])
            summary.append({
                "id": p.get("id"),
                "type": p.get("type"),
                "status": p.get("status"),
                "task_count": len(tasks),
                "completed": sum(1 for t in tasks if t.get("status") == "completed"),
            })
        return self._json_result({"phases": summary})


def create_workspace_tools(ws_client: Any, agent_type: str) -> list[BaseTool]:
    """Factory: create all workspace tools with shared client."""
    return [
        WorkspaceCreateTask(ws_client),
        WorkspaceUpdateTaskStatus(ws_client),
        WorkspaceCreateArtifact(ws_client, agent_type),
        WorkspaceQueryPhases(ws_client),
    ]
