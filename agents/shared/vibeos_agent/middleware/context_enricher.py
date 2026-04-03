"""ContextEnricherMiddleware -- builds enriched system prompt from external sources."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from typing import Any

from ..base_agent import AGENT_PHASE_MAP, PHASE_CONTEXT
from ..clients._utils import _enum_val
from ..models import AgentEvent
from .base import InvocationContext, Middleware, NextFn

logger = logging.getLogger(__name__)


class ContextEnricherMiddleware(Middleware):
    """Assembles an enriched system prompt by querying Memory, RAG, Knowledge,
    and upstream SDLC artifacts, then stores it on ``ctx.enriched_prompt``.
    """

    def __init__(
        self,
        workspace_client,
        memory_client,
        rag_client,
        knowledge_client,
    ) -> None:
        self._workspace = workspace_client
        self._memory = memory_client
        self._rag = rag_client
        self._knowledge = knowledge_client

    async def process(
        self, ctx: InvocationContext, next_fn: NextFn
    ) -> AsyncIterator[AgentEvent]:
        enriched = await self._enrich(ctx)
        ctx.enriched_prompt = enriched
        async for event in next_fn(ctx):
            yield event

    async def _enrich(self, ctx: InvocationContext) -> str:
        sections = [ctx.system_prompt]

        if ctx.repo_context and ctx.repo_context.get("gitlab_primary_project"):
            sections.append(self._build_repo_section(ctx.repo_context))

        await self._append_upstream_artifacts(sections, ctx)
        await self._append_memory(sections, ctx)
        await self._append_rag(sections, ctx)
        await self._append_knowledge(sections, ctx)

        return "\n\n".join(sections)

    # ------------------------------------------------------------------

    def _build_repo_section(self, repo_ctx: dict[str, Any]) -> str:
        primary = repo_ctx["gitlab_primary_project"]
        url = repo_ctx.get("gitlab_primary_url", "")
        strategy = repo_ctx.get("gitlab_branch_strategy", "feature")
        default_br = repo_ctx.get("gitlab_branch_default", "main")
        branch = repo_ctx.get("gitlab_branch", default_br)

        desc = {
            "feature": f"create a feature branch per task (feat/<slug>) and open a Merge Request to main",
            "direct": f"commit directly to the default branch ({default_br})",
            "gitflow": "use feature/<slug> branch, merge via MR to develop",
        }.get(strategy, strategy)

        all_repos = repo_ctx.get("gitlab_repos", [])
        extra = [r for r in all_repos if r.get("projectId") != primary]

        section = (
            f"## Project Repository\n\n"
            f"Primary: {primary}  ({url})\n"
            f"Branch strategy: {desc}\n"
            f"Current branch: {branch}\n"
            f"Default branch: {default_br}\n\n"
            f'All source code changes MUST be committed to this repository using the `gitlab_push_file` tool.\n'
            f'Use `project_id = "{primary}"` and `branch = "{branch}"` for every file commit.\n'
            f"After committing all files, call `gitlab_create_mr` to open a Merge Request to `{default_br}`.\n"
        )
        if extra:
            lines = "\n".join(
                f"- {r.get('projectName', r.get('projectId'))} ({r.get('role', 'secondary')}): {r.get('projectId')}"
                for r in extra
            )
            section += f"\nAdditional repos (secondary):\n{lines}\n"
        return section

    async def _append_upstream_artifacts(
        self, sections: list[str], ctx: InvocationContext
    ) -> None:
        agent_key = _enum_val(ctx.agent_type)
        phase_key = AGENT_PHASE_MAP.get(agent_key, agent_key)
        upstream_phases = PHASE_CONTEXT.get(phase_key, [])
        if not upstream_phases:
            return
        phase_to_agent = {v: k for k, v in AGENT_PHASE_MAP.items()}
        parts: list[str] = []
        for up_phase in upstream_phases:
            upstream_agent = phase_to_agent.get(up_phase, up_phase)
            try:
                artifacts = await self._workspace.list_artifacts(
                    ctx.workspace_id, agent_type=upstream_agent
                )
                for art in artifacts[:5]:
                    title = art.get("title", "untitled")
                    content = art.get("content", "")[:2000]
                    art_type = art.get("type", "unknown")
                    parts.append(f"### [{up_phase}] {title} ({art_type})\n{content}")
            except Exception:
                logger.warning("Upstream artifacts fetch failed phase=%s", up_phase, exc_info=True)
        if parts:
            sections.append("## Upstream Artifacts\n\n" + "\n\n---\n\n".join(parts))

    async def _append_memory(self, sections: list[str], ctx: InvocationContext) -> None:
        try:
            mem_ctx = await self._memory.assemble_context(
                ctx.workspace_id, _enum_val(ctx.agent_type), ctx.user_message
            )
            if mem_ctx:
                sections.append(f"## Context from past interactions and preferences\n{mem_ctx}")
        except Exception:
            logger.warning("Memory assembly failed ws=%s", ctx.workspace_id, exc_info=True)

    async def _append_rag(self, sections: list[str], ctx: InvocationContext) -> None:
        if self._rag is None:
            return
        try:
            results = await self._rag.search(
                ctx.user_message, workspace_id=ctx.workspace_id, top_k=3
            )
            if results:
                chunks = "\n---\n".join(
                    r.get("text", r.get("content", "")) for r in results
                )
                sections.append(f"## Relevant project documents\n{chunks}")
        except Exception:
            logger.warning("RAG search failed ws=%s", ctx.workspace_id, exc_info=True)

    async def _append_knowledge(self, sections: list[str], ctx: InvocationContext) -> None:
        if self._knowledge is None:
            return
        try:
            patterns = await self._knowledge.search(
                ctx.user_message, access_level="enterprise", limit=3
            )
            if patterns:
                text = "\n".join(
                    f"- {p.get('name', '')}: {p.get('description', '')}" for p in patterns
                )
                sections.append(f"## Organization best practices\n{text}")
        except Exception:
            logger.warning("Knowledge search failed ws=%s", ctx.workspace_id, exc_info=True)
