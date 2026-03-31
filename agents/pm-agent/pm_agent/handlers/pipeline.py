"""Handlers for SDLC pipeline intents: trigger_build, view_build_log, deploy, rollback.

These handlers form the AI → bridge-layer path:
  NLP intent → handler → GitLabPipelineAdapter → existing GitLab infrastructure.

The AI never touches GitLab directly — the adapter is the only contact point.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from vibeos_agent import WSGatewayClient, WorkspaceClient
from vibeos_agent.adapters import AdapterRegistry, AdapterStatus, GitLabPipelineAdapter

logger = logging.getLogger(__name__)

_adapter_registry: AdapterRegistry | None = None


def get_adapter_registry() -> AdapterRegistry:
    global _adapter_registry
    if _adapter_registry is None:
        _adapter_registry = AdapterRegistry()
        _adapter_registry.register(GitLabPipelineAdapter())
    return _adapter_registry


async def _resolve_project_id(
    workspace_id: str,
    ws_client: WorkspaceClient,
    slots: dict[str, Any],
) -> tuple[str, str | None]:
    """Resolve the GitLab project ID and credential ID from slots + workspace repos.

    Returns (project_id, credential_id).
    """
    project_hint = slots.get("project", "")
    credential_id: str | None = None

    repos = await ws_client.get_repos_for_phase(workspace_id, "deployment")
    if not repos:
        return project_hint, credential_id

    if project_hint:
        for r in repos:
            pid = r.get("projectId", "")
            if project_hint.lower() in str(pid).lower() or project_hint.lower() in r.get("projectName", "").lower():
                return pid, r.get("credentialId")

    primary = next((r for r in repos if r.get("isPrimary")), repos[0] if repos else None)
    if primary:
        return primary.get("projectId", project_hint), primary.get("credentialId")
    return project_hint, credential_id


async def handle_trigger_build(
    workspace_id: str,
    message: str,
    slots: dict[str, Any],
    ws_client: WorkspaceClient,
    ws_gw: WSGatewayClient,
) -> dict[str, Any]:
    """Trigger a GitLab CI/CD pipeline via the adapter layer."""
    await ws_gw.publish_log(workspace_id, "pm", "Resolving project and branch for build…")

    project_id, credential_id = await _resolve_project_id(workspace_id, ws_client, slots)
    if not project_id:
        return {
            "handled_by": "pm",
            "action": "trigger_build_failed",
            "summary": "无法确定要构建的项目。请确保工作空间已绑定 GitLab 仓库，或在消息中指定项目名称。",
        }

    ref = slots.get("branch") or "main"
    adapter = get_adapter_registry().get("gitlab_pipeline")
    if not adapter:
        return {"handled_by": "pm", "action": "trigger_build_failed", "summary": "Pipeline adapter not available."}

    await ws_gw.publish_log(workspace_id, "pm", f"Triggering pipeline: project={project_id}, branch={ref}")

    result = await adapter.execute_task({
        "project_id": project_id,
        "ref": ref,
        "credential_id": credential_id,
    })

    if result.status == AdapterStatus.FAILED:
        await ws_gw.publish_log(workspace_id, "pm", f"Pipeline trigger failed: {result.detail}", level="error")
        return {
            "handled_by": "pm",
            "action": "trigger_build_failed",
            "summary": f"构建触发失败: {result.detail}",
        }

    await ws_gw.publish_log(workspace_id, "pm", f"Pipeline triggered: {result.detail}", level="success")

    summary = f"已成功触发构建！\n\n- **项目**: {project_id}\n- **分支**: {ref}\n- **Pipeline ID**: {result.task_id}\n- **状态**: {result.status.value}"
    if result.web_url:
        summary += f"\n- **链接**: {result.web_url}"

    return {
        "handled_by": "pm",
        "action": "trigger_build_success",
        "summary": summary,
        "pipeline_task_id": result.task_id,
        "pipeline_url": result.web_url,
    }


async def handle_view_build_log(
    workspace_id: str,
    message: str,
    slots: dict[str, Any],
    ws_client: WorkspaceClient,
    ws_gw: WSGatewayClient,
) -> dict[str, Any]:
    """Query pipeline status and logs via the adapter layer."""
    await ws_gw.publish_log(workspace_id, "pm", "Querying pipeline status…")

    pipeline_id_raw = slots.get("pipeline_id", "")
    adapter = get_adapter_registry().get("gitlab_pipeline")
    if not adapter or not isinstance(adapter, GitLabPipelineAdapter):
        return {"handled_by": "pm", "action": "view_log_failed", "summary": "Pipeline adapter not available."}

    if pipeline_id_raw and "::" in pipeline_id_raw:
        task_id = pipeline_id_raw
    else:
        project_id, credential_id = await _resolve_project_id(workspace_id, ws_client, slots)
        if not project_id:
            return {
                "handled_by": "pm",
                "action": "view_log_failed",
                "summary": "无法确定项目。请指定项目名称或 Pipeline ID。",
            }

        if pipeline_id_raw:
            task_id = f"{project_id}::{pipeline_id_raw}"
        else:
            from vibeos_agent.adapters.gitlab_pipeline import _get_gl_client
            try:
                import gitlab as _gitlab_mod  # type: ignore[import-untyped]

                gl = _get_gl_client()

                def _latest() -> int | None:
                    project = gl.projects.get(project_id)
                    ref = slots.get("branch")
                    params: dict[str, Any] = {"per_page": 1}
                    if ref:
                        params["ref"] = ref
                    pipelines = project.pipelines.list(**params)
                    return pipelines[0].id if pipelines else None

                latest_id = await asyncio.to_thread(_latest)
                if not latest_id:
                    return {
                        "handled_by": "pm",
                        "action": "view_log_failed",
                        "summary": f"项目 {project_id} 没有找到任何 Pipeline。",
                    }
                task_id = f"{project_id}::{latest_id}"
            except Exception as exc:
                return {
                    "handled_by": "pm",
                    "action": "view_log_failed",
                    "summary": f"查询最近 Pipeline 失败: {exc}",
                }

    status_result = await adapter.get_task_status(task_id)
    jobs_result = await adapter.get_pipeline_jobs(task_id)

    status_emoji = {
        AdapterStatus.SUCCESS: "✅",
        AdapterStatus.FAILED: "❌",
        AdapterStatus.RUNNING: "🔄",
        AdapterStatus.PENDING: "⏳",
        AdapterStatus.CANCELED: "🚫",
    }.get(status_result.status, "❓")

    summary_parts = [
        f"## {status_emoji} Pipeline 状态",
        f"- **状态**: {status_result.status.value}",
        f"- **详情**: {status_result.detail}",
    ]
    if status_result.web_url:
        summary_parts.append(f"- **链接**: {status_result.web_url}")

    jobs = jobs_result.raw.get("jobs", [])
    if jobs:
        summary_parts.append("\n### Jobs")
        for j in jobs:
            j_status = j.get("status", "unknown")
            j_emoji = {"success": "✅", "failed": "❌", "running": "🔄"}.get(j_status, "⚪")
            duration_str = f" ({j.get('duration', '?')}s)" if j.get("duration") else ""
            summary_parts.append(f"- {j_emoji} **{j.get('name', '?')}** [{j.get('stage', '?')}]: {j_status}{duration_str}")

        failed_jobs = [j for j in jobs if j.get("status") == "failed"]
        if failed_jobs:
            summary_parts.append("\n### 失败日志")
            for fj in failed_jobs[:2]:
                log_tail = fj.get("log_tail", "(无日志)")
                if len(log_tail) > 1500:
                    log_tail = f"…\n{log_tail[-1500:]}"
                summary_parts.append(f"**{fj.get('name', '?')}**:\n```\n{log_tail}\n```")

    await ws_gw.publish_log(workspace_id, "pm", f"Pipeline query complete: {status_result.status.value}", level="success")

    return {
        "handled_by": "pm",
        "action": "view_log_success",
        "summary": "\n".join(summary_parts),
        "pipeline_status": status_result.status.value,
    }
