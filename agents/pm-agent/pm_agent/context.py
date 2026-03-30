"""NLP context helpers: phase extraction and GitLab repo enrichment."""

from __future__ import annotations

from typing import Any

from vibeos_agent import WorkspaceClient

from .workflow import PHASE_ORDER, resolve_branch_name


def phase_type_from_nlp_context(context: dict[str, Any] | None) -> str | None:
    """Extract the active phase type from the UI-supplied NLP context."""
    if not context:
        return None
    for key in ("phase_type", "current_phase_type"):
        raw = context.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip().lower()
    return None


def start_phase_from_nlp_context(context: dict[str, Any] | None) -> str | None:
    """Extract a 'start_phase' override from context (used by run_project)."""
    if not context:
        return None
    raw = context.get("start_phase")
    if isinstance(raw, str) and raw.strip():
        s = raw.strip().lower()
        if s in PHASE_ORDER:
            return s
    return None


async def enrich_context_with_gitlab(
    workspace_id: str,
    client_context: dict[str, Any] | None,
    ws_client: WorkspaceClient,
) -> dict[str, Any]:
    """Merge client-supplied context with server-side GitLab repo information.

    Ensures domain agents always receive credential_id, project_id, and branch
    info even when called via the NLP path rather than the workflow engine.
    """
    ctx = dict(client_context or {})
    if ctx.get("gitlab_credential_id"):
        return ctx

    phase_type = ctx.get("phase_type", "development")
    try:
        repos = await ws_client.get_repos_for_phase(workspace_id, phase_type)
        primary = next((r for r in repos if r.get("isPrimary")), repos[0] if repos else None)
        if primary:
            strategy = primary.get("branchStrategy", "feature")
            default_branch = primary.get("branchDefault", "main")
            ctx.setdefault("gitlab_repos", repos)
            ctx.setdefault("gitlab_primary_project", primary.get("projectId"))
            ctx.setdefault("gitlab_primary_url", primary.get("gitlabUrl"))
            ctx.setdefault("gitlab_branch_strategy", strategy)
            ctx.setdefault("gitlab_branch_default", default_branch)
            ctx.setdefault("gitlab_credential_id", primary.get("credentialId"))
            task_hint = ctx.get("task_title", "task")
            ctx.setdefault("gitlab_branch", resolve_branch_name(task_hint, strategy, default_branch))
    except Exception:
        pass
    return ctx
