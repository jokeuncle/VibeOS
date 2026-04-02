"""PM-level tools: workspace queries, phase/task execution, graph runner.

These replace the old intent-handler functions with proper BaseTool
subclasses so the LLM can invoke them via tool_calls.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from .base import BaseTool

logger = logging.getLogger(__name__)


class QueryProgressTool(BaseTool):
    name = "query_progress"
    display_name = "查询进度"
    description = (
        "Query the current workspace's overall progress: phase statuses, "
        "task counts, and completion rates. Returns structured data that "
        "you should present in the user's language."
    )
    parameters = {"type": "object", "properties": {}}

    def __init__(self, ws_client: Any) -> None:
        self._ws = ws_client

    async def execute(self, **kwargs: Any) -> str:
        workspace_id = kwargs.pop("_workspace_id", "")
        if not workspace_id or workspace_id == "__home__":
            return self._json_result({"error": "No workspace selected"})

        ws_data = await self._ws.get_workspace(workspace_id)
        if isinstance(ws_data, dict) and "data" in ws_data:
            ws_data = ws_data["data"]

        phases = ws_data.get("phases", []) if isinstance(ws_data, dict) else []
        total_tasks = sum(len(p.get("tasks", [])) for p in phases)
        completed = sum(
            1 for p in phases for t in p.get("tasks", [])
            if t.get("status") == "completed"
        )
        phase_details = []
        for p in phases:
            tasks = p.get("tasks", [])
            phase_details.append({
                "name": p.get("name", ""),
                "type": p.get("type", ""),
                "status": p.get("status", "pending"),
                "task_count": len(tasks),
                "completed": sum(1 for t in tasks if t.get("status") == "completed"),
            })
        return self._json_result({
            "total_tasks": total_tasks,
            "completed_tasks": completed,
            "phases": phase_details,
        })


class CreateWorkspaceTool(BaseTool):
    name = "create_workspace"
    display_name = "创建工作区"
    description = (
        "Create a new workspace with a title and optional description. "
        "Use when the user asks to start a new project or workspace."
    )
    parameters = {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Workspace title"},
            "description": {
                "type": "string",
                "description": "Brief project description",
            },
        },
        "required": ["title"],
    }

    def __init__(self, ws_client: Any) -> None:
        self._ws = ws_client

    async def execute(self, **kwargs: Any) -> str:
        kwargs.pop("_workspace_id", "")
        title = kwargs.get("title", "Untitled")
        description = kwargs.get("description", "")
        result = await self._ws.create_workspace(title, description)
        data = result.get("data", result) if isinstance(result, dict) else result
        return self._json_result({"status": "created", "workspace": data})


class RunPhaseTool(BaseTool):
    name = "run_phase"
    display_name = "执行阶段"
    description = (
        "Execute all pending tasks in a specific SDLC phase of the current "
        "workspace. Phase types: requirement, architecture, design, "
        "development, testing, deployment, monitoring."
    )
    parameters = {
        "type": "object",
        "properties": {
            "phase_type": {
                "type": "string",
                "enum": [
                    "requirement", "architecture", "design",
                    "development", "testing", "deployment", "monitoring",
                ],
                "description": "The phase to execute",
            },
        },
        "required": ["phase_type"],
    }

    def __init__(self, workflow_engine: Any) -> None:
        self._workflow = workflow_engine

    async def execute(self, **kwargs: Any) -> str:
        workspace_id = kwargs.pop("_workspace_id", "")
        phase_type = kwargs.get("phase_type", "requirement")
        results: list[str] = []
        try:
            async for event in self._workflow.run_phase(
                workspace_id, phase_type, ""
            ):
                results.append(event)
            return self._json_result({
                "status": "completed",
                "phase": phase_type,
                "events_count": len(results),
            })
        except Exception as exc:
            return self._json_result({"error": str(exc), "phase": phase_type})


class RunTaskTool(BaseTool):
    name = "run_task"
    display_name = "执行任务"
    description = (
        "Execute a specific task by ID in the current workspace."
    )
    parameters = {
        "type": "object",
        "properties": {
            "task_id": {"type": "string", "description": "The task ID to execute"},
        },
        "required": ["task_id"],
    }

    def __init__(self, workflow_engine: Any) -> None:
        self._workflow = workflow_engine

    async def execute(self, **kwargs: Any) -> str:
        workspace_id = kwargs.pop("_workspace_id", "")
        task_id = kwargs.get("task_id", "")
        results: list[str] = []
        try:
            async for event in self._workflow.run_task(
                workspace_id, task_id, ""
            ):
                results.append(event)
            return self._json_result({
                "status": "completed",
                "task_id": task_id,
            })
        except Exception as exc:
            return self._json_result({"error": str(exc), "task_id": task_id})


class RunProjectTool(BaseTool):
    name = "run_project"
    display_name = "执行项目"
    description = (
        "Execute the full project lifecycle starting from a given phase. "
        "Runs all phases sequentially from the start phase onward."
    )
    parameters = {
        "type": "object",
        "properties": {
            "start_phase": {
                "type": "string",
                "description": "Phase to start from (default: requirement)",
            },
        },
    }

    def __init__(self, workflow_engine: Any) -> None:
        self._workflow = workflow_engine

    async def execute(self, **kwargs: Any) -> str:
        workspace_id = kwargs.pop("_workspace_id", "")
        start_phase = kwargs.get("start_phase", "requirement")
        results: list[str] = []
        try:
            async for event in self._workflow.run_project(
                workspace_id, "", start_phase=start_phase
            ):
                results.append(event)
            return self._json_result({
                "status": "completed",
                "start_phase": start_phase,
            })
        except Exception as exc:
            return self._json_result({"error": str(exc)})


class RunGraphTool(BaseTool):
    name = "run_graph"
    display_name = "执行图谱"
    description = (
        "Execute a structured workflow graph for complex multi-step tasks. "
        "Use when a graph_id is specified or the task needs orchestrated execution."
    )
    parameters = {
        "type": "object",
        "properties": {
            "graph_id": {
                "type": "string",
                "description": "Graph ID from workspace or registry",
            },
        },
        "required": ["graph_id"],
    }

    def __init__(self, graph_executor: Any, ws_client: Any) -> None:
        self._executor = graph_executor
        self._ws = ws_client

    async def execute(self, **kwargs: Any) -> str:
        workspace_id = kwargs.pop("_workspace_id", "")
        graph_id = kwargs.get("graph_id", "")

        try:
            import httpx
            from ..config import config
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    f"{config.workspace_svc_url}/api/workspaces/{workspace_id}/graphs/{graph_id}"
                )
                if resp.status_code != 200:
                    return self._json_result({"error": f"Graph {graph_id} not found"})
                graph_def = resp.json().get("data", {}).get("graphDef", {})
        except Exception as exc:
            return self._json_result({"error": f"Failed to load graph: {exc}"})

        if not graph_def or not graph_def.get("nodes"):
            return self._json_result({"error": "Empty graph definition"})

        results: list[dict[str, Any]] = []
        async for event in self._executor.execute(
            graph_def, {"workspace_id": workspace_id}
        ):
            results.append(event)

        last_output = {}
        for r in reversed(results):
            if r.get("event") == "graph:node_complete":
                last_output = r.get("data", {}).get("output", {})
                break

        summary = last_output.get("_summary", "") or last_output.get("llm_output", "")
        return self._json_result({
            "status": "completed",
            "graph_id": graph_id,
            "summary": summary[:2000],
            "events_count": len(results),
        })


class ListWorkspacesTool(BaseTool):
    name = "list_workspaces"
    display_name = "查询工作区"
    description = "List all available workspaces for the user."
    parameters = {"type": "object", "properties": {}}

    def __init__(self, ws_client: Any) -> None:
        self._ws = ws_client

    async def execute(self, **kwargs: Any) -> str:
        kwargs.pop("_workspace_id", "")
        try:
            result = await self._ws.list_workspaces()
            data = result.get("data", result) if isinstance(result, dict) else result
            if isinstance(data, list):
                summary = [
                    {"id": w.get("id"), "title": w.get("title"), "status": w.get("status")}
                    for w in data[:20]
                ]
                return self._json_result({"workspaces": summary})
            return self._json_result({"workspaces": []})
        except Exception as exc:
            return self._json_result({"error": str(exc)})


def create_pm_tools(
    ws_client: Any,
    workflow_engine: Any | None = None,
    graph_executor: Any | None = None,
) -> list[BaseTool]:
    """Factory: create all PM-level tools."""
    tools: list[BaseTool] = [
        QueryProgressTool(ws_client),
        CreateWorkspaceTool(ws_client),
        ListWorkspacesTool(ws_client),
    ]
    if workflow_engine:
        tools.extend([
            RunPhaseTool(workflow_engine),
            RunTaskTool(workflow_engine),
            RunProjectTool(workflow_engine),
        ])
    if graph_executor and ws_client:
        tools.append(RunGraphTool(graph_executor, ws_client))
    return tools
