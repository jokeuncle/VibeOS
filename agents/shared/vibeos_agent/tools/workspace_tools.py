"""Workspace tools – let agents interact with workspace-svc via function calling."""

from __future__ import annotations

import json
import logging
from typing import Any

from .base import BaseTool

logger = logging.getLogger(__name__)


class WorkspaceCreateRequirement(BaseTool):
    """Create a requirement (需求) record in the workspace.

    This is the primary tool for creating trackable requirements that appear
    in the workspace's requirement list / kanban board.
    """

    name = "workspace_create_requirement"
    display_name = "创建需求"
    requires_confirmation = True
    description = (
        "Create a new requirement in the current workspace. "
        "Use this when the user asks to create/add a requirement (需求). "
        "The requirement will appear in the workspace requirement list."
    )
    parameters = {
        "type": "object",
        "properties": {
            "title": {"type": "string", "description": "Requirement title"},
            "description": {
                "type": "string",
                "description": "Detailed requirement description (supports markdown)",
            },
            "priority": {
                "type": "string",
                "enum": ["p0", "p1", "p2", "p3"],
                "description": "Priority level (p0=critical, p1=high, p2=medium, p3=low)",
            },
        },
        "required": ["title"],
    }

    def __init__(self, ws_client: Any) -> None:
        self._ws = ws_client

    async def execute(self, **kwargs: Any) -> str:
        workspace_id = kwargs.pop("_workspace_id", "")
        title = kwargs.get("title", "Untitled")
        description = kwargs.get("description", "")
        priority = kwargs.get("priority")

        result = await self._ws.create_requirement(
            workspace_id, title, description=description, priority=priority,
        )
        return self._json_result({
            "status": "created",
            "requirement_id": result.get("id", ""),
            "title": title,
        })


class WorkspaceCreateTask(BaseTool):
    name = "workspace_create_task"
    display_name = "创建任务"
    requires_confirmation = True
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
    """Unified artifact creation: save to workspace-svc + auto COS upload + RAG index."""

    name = "workspace_create_artifact"
    display_name = "保存产物"
    requires_confirmation = True
    description = (
        "Save a structured artifact to the workspace. Automatically uploads to CDN "
        "and indexes for retrieval. Use this for ALL deliverables: specs, code, "
        "designs, test plans, etc."
    )
    parameters = {
        "type": "object",
        "properties": {
            "artifact_type": {
                "type": "string",
                "description": (
                    "Artifact type: prd_document, clarified_requirements, user_stories, "
                    "acceptance_criteria, nfr_constraints, schema, api, diagram, adr, "
                    "design_spec, design_image, code, test_plan, test_code, "
                    "deployment_config, monitoring_config"
                ),
            },
            "title": {"type": "string", "description": "Artifact title"},
            "content": {
                "type": "string",
                "description": "Full artifact content (markdown, code, JSON, YAML, HTML, etc.)",
            },
        },
        "required": ["artifact_type", "title", "content"],
    }

    def __init__(self, ws_client: Any, agent_type: str, rag_client: Any = None) -> None:
        self._ws = ws_client
        self._agent_type = agent_type
        self._rag = rag_client

    async def execute(self, **kwargs: Any) -> str:
        workspace_id = kwargs.pop("_workspace_id", "")
        artifact_type = kwargs.get("artifact_type", "document")
        title = kwargs.get("title", "Untitled")
        content = kwargs.get("content", "")

        file_url: str | None = None
        metadata: dict[str, Any] = {}

        try:
            from ..cos import get_cos_uploader
            uploader = get_cos_uploader()
            if uploader and content:
                file_url = uploader.upload_artifact(workspace_id, artifact_type, title, content)
                metadata["fileUrl"] = file_url
        except Exception:
            logger.warning("COS upload failed for %s/%s", artifact_type, title, exc_info=True)

        meta_str = json.dumps(metadata) if metadata else "{}"
        result = await self._ws.create_artifact(
            workspace_id,
            agent_type=self._agent_type,
            artifact_type=artifact_type,
            title=title,
            content=content,
            metadata=meta_str,
        )

        if self._rag and content and len(content) > 100:
            try:
                await self._rag.index_documents(
                    workspace_id,
                    [{"title": title, "content": content[:8000], "doc_type": artifact_type}],
                )
            except Exception:
                logger.debug("RAG index failed for artifact %s", title, exc_info=True)

        artifact_data = result.get("data", result)
        return self._json_result({
            "status": "saved",
            "artifact_id": artifact_data.get("id", ""),
            "title": title,
            "type": artifact_type,
            "fileUrl": file_url,
        })


class WorkspaceQueryArtifacts(BaseTool):
    """Query artifacts from upstream phases for context."""

    name = "workspace_query_artifacts"
    display_name = "查询产物"
    description = (
        "Query artifacts from the workspace to understand prior work from upstream phases. "
        "Use this to get context from requirement docs, architecture specs, design specs, etc."
    )
    parameters = {
        "type": "object",
        "properties": {
            "agent_type": {
                "type": "string",
                "description": "Filter by agent/phase (requirement, architecture, design, development, testing)",
            },
            "artifact_type": {
                "type": "string",
                "description": "Filter by artifact type (prd_document, schema, design_spec, code, test_plan, etc.)",
            },
            "limit": {
                "type": "integer",
                "description": "Max number of artifacts to return (default 5)",
            },
        },
    }

    def __init__(self, ws_client: Any) -> None:
        self._ws = ws_client

    async def execute(self, **kwargs: Any) -> str:
        workspace_id = kwargs.pop("_workspace_id", "")
        agent_type = kwargs.get("agent_type", "")
        artifact_type = kwargs.get("artifact_type", "")
        limit = int(kwargs.get("limit", 5))

        artifacts = await self._ws.list_artifacts(
            workspace_id, agent_type=agent_type, artifact_type=artifact_type,
        )
        results = []
        for art in artifacts[:limit]:
            content = art.get("content", "")
            results.append({
                "id": art.get("id", ""),
                "type": art.get("type", ""),
                "agent_type": art.get("agentType", ""),
                "title": art.get("title", ""),
                "content": content[:3000] if len(content) > 3000 else content,
                "fileUrl": _parse_file_url(art.get("metadata")),
                "created_at": art.get("createdAt", ""),
            })
        return self._json_result({"artifacts": results, "total": len(artifacts)})


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


def _parse_file_url(metadata: str | None) -> str | None:
    if not metadata or metadata == "{}":
        return None
    try:
        return json.loads(metadata).get("fileUrl")
    except Exception:
        return None


def create_workspace_tools(ws_client: Any, agent_type: str, rag_client: Any = None) -> list[BaseTool]:
    """Factory: create all workspace tools with shared client."""
    return [
        WorkspaceCreateRequirement(ws_client),
        WorkspaceCreateTask(ws_client),
        WorkspaceUpdateTaskStatus(ws_client),
        WorkspaceCreateArtifact(ws_client, agent_type, rag_client=rag_client),
        WorkspaceQueryArtifacts(ws_client),
        WorkspaceQueryPhases(ws_client),
    ]
