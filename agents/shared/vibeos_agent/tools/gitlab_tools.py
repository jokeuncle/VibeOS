"""GitLab tools – agent-callable functions backed by the python-gitlab library.

Credentials are resolved in the following priority order:
  1. AgentTask.context["gitlab_credential_id"] → fetch token from workspace-svc decrypt endpoint
  2. Environment variables GITLAB_URL / GITLAB_TOKEN (fallback for dev/test)

This ensures that token material never enters the LLM context while still
allowing multiple workspaces to use different GitLab instances.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

import httpx

from .base import BaseTool

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Env-var fallback (dev / backward-compat)
# ---------------------------------------------------------------------------
_GITLAB_URL = os.getenv("GITLAB_URL", os.getenv("GITLAB_BASE_URL", ""))
_GITLAB_TOKEN = os.getenv("GITLAB_TOKEN", "")
_WORKSPACE_SVC_URL = os.getenv("WORKSPACE_SVC_URL", "http://localhost:8010")

# ---------------------------------------------------------------------------
# In-process credential cache (keyed by credential_id, TTL = 5 min)
# ---------------------------------------------------------------------------
_cred_cache: dict[str, tuple[str, str, float]] = {}  # id -> (url, token, expires_at)
_CACHE_TTL = 300.0


async def _fetch_credential(credential_id: str) -> tuple[str, str]:
    """Fetch and decrypt a GitLab credential from workspace-svc.

    Returns (gitlab_url, token).
    """
    now = time.monotonic()
    if credential_id in _cred_cache:
        url, tok, exp = _cred_cache[credential_id]
        if now < exp:
            return url, tok

    async with httpx.AsyncClient(base_url=_WORKSPACE_SVC_URL, timeout=10) as client:
        resp = await client.get(f"/api/gitlab/credentials/{credential_id}/decrypt")
        resp.raise_for_status()
        data = resp.json().get("data", {})
        url = data.get("gitlabUrl") or ""
        tok = data.get("token") or ""
        if not url or not tok:
            raise RuntimeError(f"Decrypt response missing fields for credential {credential_id}")

    _cred_cache[credential_id] = (url, tok, now + _CACHE_TTL)
    return url, tok


async def _get_gl_for_context(context: dict[str, Any]) -> Any:
    """Resolve a python-gitlab client from AgentTask context or env fallback."""
    try:
        import gitlab  # type: ignore[import-untyped]
    except ImportError:
        raise RuntimeError("python-gitlab is not installed. Run: pip install python-gitlab")

    credential_id = context.get("gitlab_credential_id")
    if credential_id:
        try:
            gitlab_url, token = await _fetch_credential(credential_id)
            return gitlab.Gitlab(gitlab_url, private_token=token)
        except Exception as exc:
            logger.warning("Failed to fetch credential %s: %s – falling back to env", credential_id, exc)

    # Env-var fallback
    if not _GITLAB_URL or not _GITLAB_TOKEN:
        raise RuntimeError(
            "No GitLab credential available. Either set gitlab_credential_id in task context "
            "or set GITLAB_URL and GITLAB_TOKEN environment variables."
        )
    return gitlab.Gitlab(_GITLAB_URL, private_token=_GITLAB_TOKEN)


def _get_gl() -> Any:
    """Synchronous env-var client – kept for backward compatibility."""
    try:
        import gitlab  # type: ignore[import-untyped]
    except ImportError:
        raise RuntimeError("python-gitlab is not installed. Run: pip install python-gitlab")

    if not _GITLAB_URL or not _GITLAB_TOKEN:
        raise RuntimeError("GITLAB_URL and GITLAB_TOKEN env vars must be set")
    return gitlab.Gitlab(_GITLAB_URL, private_token=_GITLAB_TOKEN)


# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------

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
        project_id = kwargs["project_id"]
        title = kwargs["title"]
        description = kwargs.get("description", "")
        labels = kwargs.get("labels", "")
        context = kwargs.get("_context", {})

        gl = await _get_gl_for_context(context)

        def _sync() -> dict[str, Any]:
            project = gl.projects.get(project_id)
            issue = project.issues.create({
                "title": title,
                "description": description,
                "labels": labels,
            })
            return {"id": issue.iid, "web_url": issue.web_url, "title": issue.title}

        result = await asyncio.to_thread(_sync)
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
        project_id = kwargs["project_id"]
        source = kwargs["source_branch"]
        target = kwargs.get("target_branch", "main")
        title = kwargs["title"]
        description = kwargs.get("description", "")
        context = kwargs.get("_context", {})

        gl = await _get_gl_for_context(context)

        def _sync() -> dict[str, Any]:
            project = gl.projects.get(project_id)
            mr = project.mergerequests.create({
                "source_branch": source,
                "target_branch": target,
                "title": title,
                "description": description,
            })
            return {"id": mr.iid, "web_url": mr.web_url, "title": mr.title}

        result = await asyncio.to_thread(_sync)
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
        project_id = kwargs["project_id"]
        ref = kwargs.get("ref")
        limit = kwargs.get("limit", 5)
        context = kwargs.get("_context", {})

        gl = await _get_gl_for_context(context)

        def _sync() -> list[dict[str, Any]]:
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

        result = await asyncio.to_thread(_sync)
        return self._json_result({"pipelines": result})


class GitLabPushFile(BaseTool):
    name = "gitlab_push_file"
    description = (
        "Create or update a file in a GitLab repository via commit. "
        "Use the project_id from the task context (gitlab_primary_project). "
        "Use the branch from the task context (gitlab_branch). "
        "Call this once per file; call gitlab_create_mr after all files are committed."
    )
    parameters = {
        "type": "object",
        "properties": {
            "project_id": {
                "type": "string",
                "description": (
                    "GitLab project ID or namespace/path. "
                    "MUST use the value from context.gitlab_primary_project."
                ),
            },
            "file_path": {"type": "string", "description": "Path of the file in the repo (e.g. src/App.tsx)"},
            "content": {"type": "string", "description": "Complete file content"},
            "branch": {
                "type": "string",
                "description": "Target branch. Use context.gitlab_branch if provided.",
            },
            "commit_message": {"type": "string", "description": "Commit message"},
        },
        "required": ["project_id", "file_path", "content", "commit_message"],
    }

    async def execute(self, **kwargs: Any) -> str:
        project_id = kwargs["project_id"]
        file_path = kwargs["file_path"]
        content = kwargs["content"]
        branch = kwargs.get("branch", "main")
        commit_message = kwargs["commit_message"]
        context = kwargs.get("_context", {})

        gl = await _get_gl_for_context(context)

        def _push() -> dict[str, Any]:
            try:
                import gitlab as _gitlab  # type: ignore[import-untyped]
            except ImportError:
                raise RuntimeError("python-gitlab is not installed")
            project = gl.projects.get(project_id)
            actual_branch = branch
            created_branch = False

            def _commit_file(target_branch: str) -> dict[str, Any]:
                try:
                    existing = project.files.get(file_path=file_path, ref=target_branch)
                    existing.content = content
                    existing.save(branch=target_branch, commit_message=commit_message)
                    return {"action": "updated", "file_path": file_path, "branch": target_branch}
                except _gitlab.exceptions.GitlabGetError:
                    project.files.create({
                        "file_path": file_path,
                        "branch": target_branch,
                        "content": content,
                        "commit_message": commit_message,
                    })
                    return {"action": "created", "file_path": file_path, "branch": target_branch}

            try:
                return _commit_file(actual_branch)
            except _gitlab.exceptions.GitlabCreateError as exc:
                err_msg = str(exc)
                if "not allowed to push" not in err_msg and "protected branch" not in err_msg.lower():
                    raise

                feature_branch = f"vibeos/{file_path.replace('/', '-').replace('.', '-')}"
                logger.info("Branch %s is protected, creating feature branch %s", branch, feature_branch)
                try:
                    project.branches.create({"branch": feature_branch, "ref": branch})
                    created_branch = True
                except _gitlab.exceptions.GitlabCreateError:
                    pass  # branch may already exist

                result = _commit_file(feature_branch)
                result["fallback_branch"] = True
                result["source_branch"] = feature_branch
                result["target_branch"] = branch
                return result

        result = await asyncio.to_thread(_push)
        return self._json_result({"status": "committed", **result})


def create_gitlab_tools() -> list[BaseTool]:
    """Factory: create all GitLab tools."""
    return [
        GitLabCreateIssue(),
        GitLabCreateMR(),
        GitLabListPipelines(),
        GitLabPushFile(),
    ]
