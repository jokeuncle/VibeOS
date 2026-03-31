"""GitLabPipelineAdapter — trigger / monitor / cancel GitLab CI pipelines.

This is the primary bridge-layer adapter.  It wraps ``python-gitlab`` and
exposes the uniform ``BaseAdapter`` interface so that the AI orchestration
never touches GitLab internals.

Credential resolution follows the same priority as ``gitlab_tools``:
  1. Explicit ``credential_id`` → workspace-svc decrypt endpoint
  2. Environment variables ``GITLAB_URL`` / ``GITLAB_TOKEN``
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

import httpx

from .base import AdapterResult, AdapterStatus, BaseAdapter

logger = logging.getLogger(__name__)

_GITLAB_URL = os.getenv("GITLAB_URL", os.getenv("GITLAB_BASE_URL", ""))
_GITLAB_TOKEN = os.getenv("GITLAB_TOKEN", "")
_WORKSPACE_SVC_URL = os.getenv("WORKSPACE_SVC_URL", "http://localhost:8010")

_cred_cache: dict[str, tuple[str, str, float]] = {}
_CACHE_TTL = 300.0

_STATUS_MAP: dict[str, AdapterStatus] = {
    "created": AdapterStatus.PENDING,
    "waiting_for_resource": AdapterStatus.PENDING,
    "preparing": AdapterStatus.PENDING,
    "pending": AdapterStatus.PENDING,
    "running": AdapterStatus.RUNNING,
    "success": AdapterStatus.SUCCESS,
    "failed": AdapterStatus.FAILED,
    "canceled": AdapterStatus.CANCELED,
    "skipped": AdapterStatus.CANCELED,
    "manual": AdapterStatus.PENDING,
}


async def _fetch_credential(credential_id: str) -> tuple[str, str]:
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
            raise RuntimeError(f"Decrypt response missing fields for {credential_id}")
    _cred_cache[credential_id] = (url, tok, now + _CACHE_TTL)
    return url, tok


def _get_gl_client(gitlab_url: str | None = None, token: str | None = None) -> Any:
    try:
        import gitlab as _gitlab  # type: ignore[import-untyped]
    except ImportError:
        raise RuntimeError("python-gitlab is not installed. Run: pip install python-gitlab")
    url = gitlab_url or _GITLAB_URL
    tok = token or _GITLAB_TOKEN
    if not url or not tok:
        raise RuntimeError("No GitLab credentials — set GITLAB_URL + GITLAB_TOKEN or pass credential_id")
    return _gitlab.Gitlab(url, private_token=tok)


class GitLabPipelineAdapter(BaseAdapter):
    """Bridge adapter for GitLab CI/CD pipelines.

    ``execute_task`` params:
        project_id (str):  GitLab project ID or namespace/path  (required)
        ref (str):         Branch / tag to run pipeline on       (default "main")
        variables (list):  Pipeline variables [{key, value}]     (optional)
        credential_id (str): workspace-svc credential ID         (optional)

    ``get_task_status`` / ``cancel_task`` expect ``task_id`` formatted as
    ``"<project_id>::<pipeline_id>"``.
    """

    name = "gitlab_pipeline"

    @staticmethod
    def _pack_id(project_id: str, pipeline_id: int) -> str:
        return f"{project_id}::{pipeline_id}"

    @staticmethod
    def _unpack_id(task_id: str) -> tuple[str, int]:
        parts = task_id.rsplit("::", 1)
        if len(parts) != 2:
            raise ValueError(f"Invalid task_id format: {task_id}")
        return parts[0], int(parts[1])

    async def _resolve_client(self, params: dict[str, Any]) -> Any:
        credential_id = params.get("credential_id")
        if credential_id:
            try:
                url, tok = await _fetch_credential(credential_id)
                return _get_gl_client(url, tok)
            except Exception as exc:
                logger.warning("Credential %s fetch failed: %s — falling back to env", credential_id, exc)
        return _get_gl_client()

    async def execute_task(self, params: dict[str, Any]) -> AdapterResult:
        project_id = params.get("project_id")
        if not project_id:
            return AdapterResult(task_id="", status=AdapterStatus.FAILED, detail="project_id is required")

        ref = params.get("ref", "main")
        variables = params.get("variables", [])
        gl = await self._resolve_client(params)

        def _trigger() -> dict[str, Any]:
            project = gl.projects.get(project_id)
            pipe_data: dict[str, Any] = {"ref": ref}
            if variables:
                pipe_data["variables"] = variables
            pipeline = project.pipelines.create(pipe_data)
            return {
                "id": pipeline.id,
                "status": pipeline.status,
                "ref": pipeline.ref,
                "web_url": pipeline.web_url,
                "created_at": str(getattr(pipeline, "created_at", "")),
            }

        try:
            result = await asyncio.to_thread(_trigger)
        except Exception as exc:
            return AdapterResult(task_id="", status=AdapterStatus.FAILED, detail=str(exc))

        return AdapterResult(
            task_id=self._pack_id(str(project_id), result["id"]),
            status=_STATUS_MAP.get(result["status"], AdapterStatus.UNKNOWN),
            detail=f"Pipeline #{result['id']} triggered on {ref}",
            web_url=result.get("web_url", ""),
            raw=result,
        )

    async def get_task_status(self, task_id: str) -> AdapterResult:
        try:
            project_id, pipeline_id = self._unpack_id(task_id)
        except ValueError as exc:
            return AdapterResult(task_id=task_id, status=AdapterStatus.FAILED, detail=str(exc))

        gl = _get_gl_client()

        def _query() -> dict[str, Any]:
            project = gl.projects.get(project_id)
            pipeline = project.pipelines.get(pipeline_id)
            jobs = list(pipeline.jobs.list(per_page=50))
            return {
                "id": pipeline.id,
                "status": pipeline.status,
                "ref": pipeline.ref,
                "web_url": pipeline.web_url,
                "duration": getattr(pipeline, "duration", None),
                "finished_at": str(getattr(pipeline, "finished_at", "")),
                "jobs": [
                    {"id": j.id, "name": j.name, "status": j.status, "stage": j.stage}
                    for j in jobs
                ],
            }

        try:
            result = await asyncio.to_thread(_query)
        except Exception as exc:
            return AdapterResult(task_id=task_id, status=AdapterStatus.FAILED, detail=str(exc))

        status = _STATUS_MAP.get(result["status"], AdapterStatus.UNKNOWN)
        duration = result.get("duration")
        detail = f"Pipeline #{pipeline_id} is {result['status']}"
        if duration:
            detail += f" ({duration}s)"

        return AdapterResult(
            task_id=task_id,
            status=status,
            detail=detail,
            web_url=result.get("web_url", ""),
            raw=result,
        )

    async def cancel_task(self, task_id: str) -> AdapterResult:
        try:
            project_id, pipeline_id = self._unpack_id(task_id)
        except ValueError as exc:
            return AdapterResult(task_id=task_id, status=AdapterStatus.FAILED, detail=str(exc))

        gl = _get_gl_client()

        def _cancel() -> dict[str, Any]:
            project = gl.projects.get(project_id)
            pipeline = project.pipelines.get(pipeline_id)
            pipeline.cancel()
            pipeline = project.pipelines.get(pipeline_id)
            return {"id": pipeline.id, "status": pipeline.status, "web_url": pipeline.web_url}

        try:
            result = await asyncio.to_thread(_cancel)
        except Exception as exc:
            return AdapterResult(task_id=task_id, status=AdapterStatus.FAILED, detail=str(exc))

        return AdapterResult(
            task_id=task_id,
            status=_STATUS_MAP.get(result["status"], AdapterStatus.CANCELED),
            detail=f"Pipeline #{pipeline_id} cancel requested",
            web_url=result.get("web_url", ""),
            raw=result,
        )

    async def get_pipeline_jobs(self, task_id: str) -> AdapterResult:
        """Fetch detailed job list with log traces (extended query beyond base interface)."""
        try:
            project_id, pipeline_id = self._unpack_id(task_id)
        except ValueError as exc:
            return AdapterResult(task_id=task_id, status=AdapterStatus.FAILED, detail=str(exc))

        gl = _get_gl_client()

        def _jobs() -> dict[str, Any]:
            project = gl.projects.get(project_id)
            pipeline = project.pipelines.get(pipeline_id)
            jobs = list(pipeline.jobs.list(per_page=50))
            job_details = []
            for j in jobs:
                trace = ""
                try:
                    raw_trace = j.trace()
                    trace = raw_trace.decode("utf-8", errors="replace") if isinstance(raw_trace, bytes) else str(raw_trace)
                    if len(trace) > 4000:
                        trace = f"…(truncated)\n{trace[-4000:]}"
                except Exception:
                    trace = "(log unavailable)"
                job_details.append({
                    "id": j.id, "name": j.name, "status": j.status,
                    "stage": j.stage, "duration": getattr(j, "duration", None),
                    "log_tail": trace,
                })
            return {"pipeline_id": pipeline_id, "jobs": job_details}

        try:
            result = await asyncio.to_thread(_jobs)
        except Exception as exc:
            return AdapterResult(task_id=task_id, status=AdapterStatus.FAILED, detail=str(exc))

        return AdapterResult(
            task_id=task_id,
            status=AdapterStatus.SUCCESS,
            detail=f"{len(result['jobs'])} jobs retrieved",
            raw=result,
        )
