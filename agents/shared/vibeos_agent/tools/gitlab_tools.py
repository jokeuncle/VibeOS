"""GitLab tools – agent-callable functions backed by the python-gitlab library."""

from __future__ import annotations

import logging
import os
from typing import Any

from .base import BaseTool

logger = logging.getLogger(__name__)

_GITLAB_URL = os.getenv("GITLAB_URL", "")
_GITLAB_TOKEN = os.getenv("GITLAB_TOKEN", "")


def _get_gl() -> Any:
    """Lazy-init python-gitlab client."""
    try:
        import gitlab  # type: ignore[import-untyped]
    except ImportError:
        raise RuntimeError("python-gitlab is not installed. Run: pip install python-gitlab")

    if not _GITLAB_URL or not _GITLAB_TOKEN:
        raise RuntimeError("GITLAB_URL and GITLAB_TOKEN env vars must be set")

    return gitlab.Gitlab(_GITLAB_URL, private_token=_GITLAB_TOKEN)


class GitLabCreateIssue(BaseTool):
    name = "gitlab_create_issue"
    description = "Create a new issue in a GitLab project."
    parameters = {
        "type": "object",
        "properties": {
            "project_id": {"type": "string", "description": "GitLab project ID or 'namespace/name'"},
            "title": {"type": "string", "description": "Issue title"},
            "description": {"type": "string", "description": "Issue description (Markdown)"},
            "labels": {"type": "string", "description": "Comma-separated labels"},
        },
        "required": ["project_id", "title"],
    }

    async def execute(self, **kwargs: Any) -> str:
        import asyncio
        project_id = kwargs["project_id"]
        title = kwargs["title"]
        description = kwargs.get("description", "")
        labels = kwargs.get("labels", "")

        def _create() -> dict[str, Any]:
            gl = _get_gl()
            project = gl.projects.get(project_id)
            issue = project.issues.create({
                "title": title,
                "description": description,
                "labels": labels,
            })
            return {"id": issue.iid, "web_url": issue.web_url, "title": issue.title}

        result = await asyncio.to_thread(_create)
        return self._json_result({"status": "created", "issue": result})


class GitLabCreateMR(BaseTool):
    name = "gitlab_create_mr"
    description = "Create a merge request in a GitLab project."
    parameters = {
        "type": "object",
        "properties": {
            "project_id": {"type": "string", "description": "GitLab project ID or 'namespace/name'"},
            "source_branch": {"type": "string", "description": "Source branch name"},
            "target_branch": {"type": "string", "description": "Target branch (default: main)"},
            "title": {"type": "string", "description": "MR title"},
            "description": {"type": "string", "description": "MR description"},
        },
        "required": ["project_id", "source_branch", "title"],
    }

    async def execute(self, **kwargs: Any) -> str:
        import asyncio
        project_id = kwargs["project_id"]
        source = kwargs["source_branch"]
        target = kwargs.get("target_branch", "main")
        title = kwargs["title"]
        description = kwargs.get("description", "")

        def _create() -> dict[str, Any]:
            gl = _get_gl()
            project = gl.projects.get(project_id)
            mr = project.mergerequests.create({
                "source_branch": source,
                "target_branch": target,
                "title": title,
                "description": description,
            })
            return {"id": mr.iid, "web_url": mr.web_url, "title": mr.title}

        result = await asyncio.to_thread(_create)
        return self._json_result({"status": "created", "merge_request": result})


class GitLabListPipelines(BaseTool):
    name = "gitlab_list_pipelines"
    description = "List recent CI/CD pipelines for a GitLab project."
    parameters = {
        "type": "object",
        "properties": {
            "project_id": {"type": "string", "description": "GitLab project ID or 'namespace/name'"},
            "ref": {"type": "string", "description": "Branch/tag ref to filter (optional)"},
            "limit": {"type": "integer", "description": "Max results (default 5)"},
        },
        "required": ["project_id"],
    }

    async def execute(self, **kwargs: Any) -> str:
        import asyncio
        project_id = kwargs["project_id"]
        ref = kwargs.get("ref")
        limit = kwargs.get("limit", 5)

        def _list() -> list[dict[str, Any]]:
            gl = _get_gl()
            project = gl.projects.get(project_id)
            params: dict[str, Any] = {"per_page": limit}
            if ref:
                params["ref"] = ref
            pipelines = project.pipelines.list(**params)
            return [
                {
                    "id": p.id,
                    "status": p.status,
                    "ref": p.ref,
                    "web_url": p.web_url,
                    "created_at": p.created_at,
                }
                for p in pipelines
            ]

        result = await asyncio.to_thread(_list)
        return self._json_result({"pipelines": result})


class GitLabPushFile(BaseTool):
    name = "gitlab_push_file"
    description = "Create or update a file in a GitLab repository via commit."
    parameters = {
        "type": "object",
        "properties": {
            "project_id": {"type": "string", "description": "GitLab project ID or 'namespace/name'"},
            "file_path": {"type": "string", "description": "Path of the file in the repo"},
            "content": {"type": "string", "description": "File content"},
            "branch": {"type": "string", "description": "Target branch (default: main)"},
            "commit_message": {"type": "string", "description": "Commit message"},
        },
        "required": ["project_id", "file_path", "content", "commit_message"],
    }

    async def execute(self, **kwargs: Any) -> str:
        import asyncio
        project_id = kwargs["project_id"]
        file_path = kwargs["file_path"]
        content = kwargs["content"]
        branch = kwargs.get("branch", "main")
        commit_message = kwargs["commit_message"]

        def _push() -> dict[str, Any]:
            gl = _get_gl()
            project = gl.projects.get(project_id)
            try:
                existing = project.files.get(file_path=file_path, ref=branch)
                existing.content = content
                existing.save(branch=branch, commit_message=commit_message)
                return {"action": "updated", "file_path": file_path}
            except Exception:
                project.files.create({
                    "file_path": file_path,
                    "branch": branch,
                    "content": content,
                    "commit_message": commit_message,
                })
                return {"action": "created", "file_path": file_path}

        result = await asyncio.to_thread(_push)
        return self._json_result({"status": "committed", **result})


def create_gitlab_tools() -> list[BaseTool]:
    """Factory: create all GitLab tools (they lazy-init the client on first call)."""
    return [
        GitLabCreateIssue(),
        GitLabCreateMR(),
        GitLabListPipelines(),
        GitLabPushFile(),
    ]
