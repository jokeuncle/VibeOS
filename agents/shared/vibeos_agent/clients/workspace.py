"""WorkspaceClient – thin async wrapper around the workspace-svc REST API."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from ..config import config
from ..models import PhaseStatus, Task

logger = logging.getLogger(__name__)


class WorkspaceClient:
    """Thin async wrapper around the workspace-svc REST API."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or config.workspace_svc_url
        self._http = httpx.AsyncClient(base_url=self._base, timeout=30)

    async def get_phases(self, workspace_id: str) -> list[dict[str, Any]]:
        """Extract phases from the workspace GET response."""
        ws = await self.get_workspace(workspace_id)
        if isinstance(ws, dict) and "data" in ws:
            ws = ws["data"]
        return ws.get("phases", []) if isinstance(ws, dict) else []

    async def find_phase_by_type(
        self, workspace_id: str, phase_type: str
    ) -> str | None:
        """Return the phase ID for a given phase type, or None."""
        phases = await self.get_phases(workspace_id)
        for p in phases:
            if p.get("type") == phase_type:
                return p["id"]
        return None

    async def create_task(
        self, workspace_id: str, task: Task, *, phase_id: str | None = None
    ) -> dict[str, Any]:
        if not phase_id:
            phase_id = await self.find_phase_by_type(workspace_id, "architecture")
        if not phase_id:
            phases = await self.get_phases(workspace_id)
            if phases:
                phase_id = phases[0]["id"]
        resp = await self._http.post(
            f"/api/workspaces/{workspace_id}/phases/{phase_id}/tasks",
            json=task.model_dump(mode="json", exclude_none=True),
        )
        resp.raise_for_status()
        return resp.json()

    async def update_task(
        self, workspace_id: str, task_id: str, updates: dict[str, Any]
    ) -> dict[str, Any]:
        resp = await self._http.patch(
            f"/api/workspaces/{workspace_id}/tasks/{task_id}",
            json=updates,
        )
        resp.raise_for_status()
        return resp.json()

    async def complete_task(
        self, workspace_id: str, task_id: str
    ) -> dict[str, Any]:
        return await self.update_task(workspace_id, task_id, {"status": "completed"})

    async def claim_task(
        self, workspace_id: str, task_id: str, agent: str = "pm"
    ) -> dict[str, Any] | None:
        """Atomically claim a pending task. Returns None if already claimed."""
        resp = await self._http.post(
            f"/api/workspaces/{workspace_id}/tasks/{task_id}/claim",
            json={"agent": agent},
        )
        if resp.status_code == 409:
            return None
        resp.raise_for_status()
        return resp.json()

    async def get_task(
        self, workspace_id: str, task_id: str
    ) -> dict[str, Any] | None:
        """Get task info from the workspace phases (by walking phases)."""
        phases = await self.get_phases(workspace_id)
        for phase in phases:
            for task in phase.get("tasks", []):
                if task.get("id") == task_id:
                    return {**task, "phaseId": phase["id"], "phaseType": phase.get("type")}
        return None

    # ------------------------------------------------------------------
    # Agent executions (persistent)
    # ------------------------------------------------------------------

    async def create_execution(
        self,
        workspace_id: str,
        *,
        execution_id: str | None = None,
        requirement_id: str | None = None,
        task_ids: list[str] | None = None,
        intent_type: str,
        intent_summary: str = "",
        triggered_by: str = "nlp",
        user_message: str = "",
        agent_type: str = "pm",
        result_type: str = "general",
        parent_execution_id: str | None = None,
        chat_message_id: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "intentType": intent_type,
            "intentSummary": intent_summary,
            "triggeredBy": triggered_by,
            "userMessage": user_message,
            "agentType": agent_type,
            "resultType": result_type,
        }
        if execution_id:
            body["id"] = execution_id
        if requirement_id:
            body["requirementId"] = requirement_id
        if task_ids:
            body["taskIds"] = task_ids
        if parent_execution_id:
            body["parentExecutionId"] = parent_execution_id
        if chat_message_id:
            body["chatMessageId"] = chat_message_id
        resp = await self._http.post(
            f"/api/workspaces/{workspace_id}/executions", json=body,
        )
        resp.raise_for_status()
        return resp.json()

    async def update_execution(
        self,
        workspace_id: str,
        execution_id: str,
        *,
        status: str | None = None,
        error_message: str | None = None,
        task_ids: list[str] | None = None,
        chat_message_id: str | None = None,
        steps: str | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {}
        if status:
            body["status"] = status
        if error_message is not None:
            body["errorMessage"] = error_message
        if task_ids is not None:
            body["taskIds"] = task_ids
        if chat_message_id is not None:
            body["chatMessageId"] = chat_message_id
        if steps is not None:
            body["steps"] = steps
        resp = await self._http.patch(
            f"/api/workspaces/{workspace_id}/executions/{execution_id}",
            json=body,
        )
        resp.raise_for_status()
        return resp.json()

    async def get_tasks_by_phase(
        self, workspace_id: str, phase_id: str
    ) -> list[dict[str, Any]]:
        """Get all tasks under a specific phase."""
        phases = await self.get_phases(workspace_id)
        for phase in phases:
            if phase.get("id") == phase_id:
                return phase.get("tasks", [])
        return []

    async def update_phase(
        self,
        workspace_id: str,
        phase_id: str,
        status: PhaseStatus | None = None,
        progress: float | None = None,
    ) -> dict[str, Any]:
        if status is not None:
            resp = await self._http.patch(
                f"/api/workspaces/{workspace_id}/phases/{phase_id}/status",
                json={"status": status.value},
            )
            resp.raise_for_status()
            return resp.json()
        return {}

    async def get_workspace(self, workspace_id: str) -> dict[str, Any]:
        resp = await self._http.get(f"/api/workspaces/{workspace_id}")
        resp.raise_for_status()
        return resp.json()

    async def create_artifact(
        self,
        workspace_id: str,
        *,
        agent_type: str,
        artifact_type: str,
        title: str,
        content: str,
        execution_id: str | None = None,
        metadata: str = "{}",
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "agentType": agent_type,
            "type": artifact_type,
            "title": title,
            "content": content,
            "metadata": metadata,
        }
        if execution_id:
            body["executionId"] = execution_id
        resp = await self._http.post(
            f"/api/workspaces/{workspace_id}/artifacts", json=body
        )
        resp.raise_for_status()
        return resp.json()

    async def list_artifacts(
        self, workspace_id: str, *, execution_id: str | None = None
    ) -> list[dict[str, Any]]:
        url = f"/api/workspaces/{workspace_id}/artifacts"
        if execution_id:
            url = f"/api/workspaces/{workspace_id}/executions/{execution_id}/artifacts"
        resp = await self._http.get(url)
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", data) if isinstance(data, dict) else data

    async def get_repos_for_phase(
        self, workspace_id: str, phase_type: str
    ) -> list[dict[str, Any]]:
        """Fetch workspace repos applicable for a given phase type."""
        try:
            resp = await self._http.get(f"/api/workspaces/{workspace_id}/repos")
            resp.raise_for_status()
            repos: list[dict[str, Any]] = resp.json().get("data", [])
            result = []
            for r in repos:
                pt = r.get("phaseTypes") or []
                if not pt or phase_type in pt:
                    result.append(r)
            return result
        except Exception as exc:
            logger.warning(
                "get_repos_for_phase failed for workspace=%s phase=%s: %s",
                workspace_id, phase_type, exc,
            )
            return []

    async def list_workspace_repos(self, workspace_id: str) -> list[dict[str, Any]]:
        """All workspace repo bindings (no phase filter)."""
        resp = await self._http.get(f"/api/workspaces/{workspace_id}/repos")
        resp.raise_for_status()
        data = resp.json().get("data", [])
        return data if isinstance(data, list) else []

    async def list_gitlab_credentials(self) -> list[dict[str, Any]]:
        resp = await self._http.get("/api/gitlab/credentials")
        resp.raise_for_status()
        data = resp.json().get("data", [])
        return data if isinstance(data, list) else []

    async def search_gitlab_projects(self, credential_id: str, search: str) -> list[dict[str, Any]]:
        resp = await self._http.get(
            f"/api/gitlab/credentials/{credential_id}/projects",
            params={"search": search},
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        return data if isinstance(data, list) else []

    async def create_workspace_repo(
        self,
        workspace_id: str,
        *,
        credential_id: str,
        project_id: str,
        project_name: str,
        project_url: str = "",
        is_primary: bool = True,
        branch_default: str = "main",
        branch_strategy: str = "feature",
        phase_types: list[str] | None = None,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "credentialId": credential_id,
            "projectId": project_id,
            "projectName": project_name,
            "isPrimary": is_primary,
            "branchDefault": branch_default,
            "branchStrategy": branch_strategy,
        }
        if project_url:
            body["projectUrl"] = project_url
        if phase_types is not None:
            body["phaseTypes"] = phase_types
        resp = await self._http.post(f"/api/workspaces/{workspace_id}/repos", json=body)
        resp.raise_for_status()
        wrapped = resp.json()
        return wrapped.get("data", wrapped) if isinstance(wrapped, dict) else {}

    # ------------------------------------------------------------------
    # Requirement APIs
    # ------------------------------------------------------------------

    async def create_requirement(
        self, workspace_id: str, title: str, description: str = "", priority: str | None = None
    ) -> dict[str, Any]:
        body: dict[str, Any] = {"title": title, "description": description}
        if priority:
            body["priority"] = priority
        resp = await self._http.post(f"/api/workspaces/{workspace_id}/requirements", json=body)
        resp.raise_for_status()
        return resp.json().get("data", {})

    async def get_requirement(self, workspace_id: str, requirement_id: str) -> dict[str, Any]:
        resp = await self._http.get(f"/api/workspaces/{workspace_id}/requirements/{requirement_id}")
        resp.raise_for_status()
        return resp.json().get("data", {})

    async def list_requirements(self, workspace_id: str) -> list[dict[str, Any]]:
        resp = await self._http.get(f"/api/workspaces/{workspace_id}/requirements")
        resp.raise_for_status()
        return resp.json().get("data", [])

    async def update_requirement(self, workspace_id: str, requirement_id: str, **updates: Any) -> dict[str, Any]:
        resp = await self._http.patch(
            f"/api/workspaces/{workspace_id}/requirements/{requirement_id}", json=updates
        )
        resp.raise_for_status()
        return resp.json().get("data", {})

    async def reset_requirement_phase(self, workspace_id: str, requirement_id: str, phase_type: str) -> None:
        resp = await self._http.post(
            f"/api/workspaces/{workspace_id}/requirements/{requirement_id}/phases/{phase_type}/reset"
        )
        resp.raise_for_status()

    async def add_requirement_relation(
        self, workspace_id: str, requirement_id: str, target_id: str, relation_type: str, description: str = ""
    ) -> dict[str, Any]:
        resp = await self._http.post(
            f"/api/workspaces/{workspace_id}/requirements/{requirement_id}/relations",
            json={"targetId": target_id, "relationType": relation_type, "description": description},
        )
        resp.raise_for_status()
        return resp.json().get("data", {})

    async def remove_requirement_relation(
        self, workspace_id: str, requirement_id: str, relation_id: str
    ) -> None:
        resp = await self._http.delete(
            f"/api/workspaces/{workspace_id}/requirements/{requirement_id}/relations/{relation_id}"
        )
        resp.raise_for_status()

    async def get_related_artifacts(
        self, workspace_id: str, requirement_id: str
    ) -> dict[str, list[dict[str, Any]]]:
        resp = await self._http.get(
            f"/api/workspaces/{workspace_id}/requirements/{requirement_id}/related-artifacts"
        )
        resp.raise_for_status()
        return resp.json().get("data", {})

    async def upsert_artifact(
        self,
        workspace_id: str,
        *,
        agent_type: str,
        artifact_type: str,
        title: str,
        content: str,
        execution_id: str | None = None,
        metadata: str = "{}",
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "agentType": agent_type,
            "type": artifact_type,
            "title": title,
            "content": content,
            "metadata": metadata,
        }
        if execution_id:
            body["executionId"] = execution_id
        resp = await self._http.put(f"/api/workspaces/{workspace_id}/artifacts", json=body)
        resp.raise_for_status()
        return resp.json().get("data", {})

    async def close(self) -> None:
        await self._http.aclose()
