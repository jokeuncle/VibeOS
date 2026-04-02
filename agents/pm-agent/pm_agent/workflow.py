"""Workflow engine for VibeOS project lifecycle orchestration.

Orchestrates multi-phase, multi-agent project execution using the unified
SSE protocol.  All events are emitted as:

    event: <category>:<action>
    data: {"sid": "...", ...payload}
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import httpx

from vibeos_agent import (
    AGENT_PHASE_MAP,
    PHASE_CONTRACTS,
    AgentStatus,
    AgentTask,
    AgentType,
    GraphExecutor,
    HAS_LANGGRAPH,
    LLMGatewayClient,
    PhaseContract,
    PhaseStatus,
    RegistryClient,
    WSGatewayClient,
    WorkspaceClient,
    config,
)
from vibeos_agent.mcp_discovery import discover_and_register_mcp_tools
from vibeos_agent.tools.mcp_provider import MCPServerConfig, MCPToolProvider
from vibeos_agent.tools.provider import ToolManager

from .dispatch import Dispatcher
from .session import SessionManager

_logger = logging.getLogger(__name__)

KNOWLEDGE_SVC_URL = os.getenv("KNOWLEDGE_SVC_URL", config.knowledge_svc_url)
RAG_SVC_URL = os.getenv("RAG_SVC_URL", config.rag_svc_url)
MEMORY_SVC_URL = os.getenv("MEMORY_SVC_URL", config.memory_svc_url)

DEFAULT_PHASE_ORDER = [
    "requirement", "architecture", "design",
    "development", "testing", "deployment", "monitoring",
]

PIPELINE_KEY_TO_PHASE: dict[str, str] = {
    "requirement": "requirement",
    "architecture": "architecture",
    "design": "design",
    "development": "development",
    "testing": "testing",
    "cicd": "deployment",
    "monitoring": "monitoring",
}


def resolve_branch_name(task_title: str, strategy: str, default_branch: str) -> str:
    slug = re.sub(r"[^\w]+", "-", task_title.lower())[:40].strip("-")
    if strategy == "feature":
        return f"feat/{slug}"
    if strategy == "gitflow":
        return f"feature/{slug}"
    return default_branch


async def _trigger_distill(workspace_id: str, access_level: str = "enterprise") -> None:
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(f"{KNOWLEDGE_SVC_URL}/api/distill", json={"workspace_id": workspace_id, "target_access_level": access_level})
            resp.raise_for_status()
            body = resp.json()
            _logger.info("Distillation complete for workspace=%s: stored %s items", workspace_id, body.get("stored_count", "?"))
    except Exception as exc:
        _logger.warning("Async distillation failed (non-blocking): %s", exc)


async def _auto_index_to_rag(workspace_id: str, title: str, content: str, doc_type: str = "agent_output") -> None:
    if len(content) < 100:
        return
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.post(f"{RAG_SVC_URL}/api/index/documents", json={"workspace_id": workspace_id, "documents": [{"title": title, "content": content[:8000], "doc_type": doc_type}]})
    except Exception as exc:
        _logger.warning("Auto-RAG index failed (non-blocking): %s", exc)


async def _store_org_memory(workspace_id: str, content: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            await client.post(f"{MEMORY_SVC_URL}/api/memory/org/add", json={"content": content, "metadata": {"source_workspace": workspace_id, "layer": "org"}})
    except Exception as exc:
        _logger.warning("Org memory store failed (non-blocking): %s", exc)


def _agent_for_phase(phase_type: str) -> AgentType:
    for agent_key, phase_key in AGENT_PHASE_MAP.items():
        if phase_key == phase_type:
            try:
                return AgentType(agent_key)
            except ValueError:
                pass
    return AgentType.DEVELOPMENT


class WorkflowEngine:
    """Orchestrator for full project lifecycle execution (unified SSE protocol)."""

    def __init__(
        self,
        dispatcher: Dispatcher,
        ws_client: WorkspaceClient,
        ws_gw: WSGatewayClient,
        sm: SessionManager,
        graph_executor: GraphExecutor | None = None,
        llm: LLMGatewayClient | None = None,
        tool_manager: ToolManager | None = None,
        registry: RegistryClient | None = None,
    ) -> None:
        self.dispatcher = dispatcher
        self.ws_client = ws_client
        self.ws_gw = ws_gw
        self.sm = sm
        self.graph_executor = graph_executor
        self.llm = llm
        self.tool_manager = tool_manager
        self.registry = registry
        self._workspace_locks: dict[str, asyncio.Lock] = {}
        self._active_runs: dict[str, str] = {}
        self._pending_approvals: dict[str, asyncio.Event] = {}
        self._approval_results: dict[str, bool] = {}
        self._mcp_loaded_workspaces: set[str] = set()
        self._trace_by_sid: dict[str, list[dict[str, Any]]] = {}

    def _trace_ev(
        self,
        sid: str,
        category: str,
        action: str,
        payload: dict[str, Any] | None = None,
    ) -> str:
        """Emit SSE like sm.ev and append a summary step for Traces UI."""
        p = payload or {}
        label = (
            p.get("task_title")
            or p.get("title")
            or p.get("phase")
            or p.get("error")
            or f"{category} · {action}"
        )
        if category == "phase" and p.get("phase"):
            label = f"{p.get('phase')} — {action}"
        detail = ""
        if p and action in ("error", "complete") and category in ("task", "phase", "project"):
            detail = json.dumps(p, ensure_ascii=False, default=str)[:1200]
        if action == "start":
            step_status = "running"
        elif action == "error":
            step_status = "error"
        else:
            step_status = "completed"
        bucket = self._trace_by_sid.setdefault(sid, [])
        bucket.append({
            "id": f"{category}_{action}_{len(bucket)}",
            "label": str(label)[:240],
            "status": step_status,
            "detail": detail,
        })
        return self.sm.ev(sid, category, action, payload)

    def _dump_trace(self, sid: str) -> str | None:
        steps = self._trace_by_sid.pop(sid, None)
        if not steps:
            return None
        return json.dumps(steps, ensure_ascii=False)

    async def _ensure_mcp_providers(self, workspace_id: str) -> None:
        """Lazily load MCP tool providers for a workspace into the ToolManager."""
        if not self.tool_manager or workspace_id in self._mcp_loaded_workspaces:
            return
        self._mcp_loaded_workspaces.add(workspace_id)
        try:
            servers = await self.ws_client.list_mcp_servers(workspace_id)
            for srv in servers:
                try:
                    cfg = MCPServerConfig.from_db_row(srv)
                except Exception:
                    _logger.warning("Invalid MCP config: %s", srv.get("name", "?"), exc_info=True)
                    continue
                if cfg.enabled:
                    provider = MCPToolProvider(cfg)
                    self.tool_manager.register_provider(provider)
            await self.tool_manager.refresh_index()
        except Exception:
            self._mcp_loaded_workspaces.discard(workspace_id)
            _logger.warning("Failed to load MCP providers for ws=%s", workspace_id, exc_info=True)

        if self.registry:
            try:
                await discover_and_register_mcp_tools(self.ws_client, self.registry, workspace_id)
            except Exception:
                _logger.debug("MCP discovery failed for ws=%s", workspace_id, exc_info=True)

    async def _resolve_agent_config(
        self, workspace_id: str, agent_type: str,
    ) -> dict[str, Any]:
        """Return agent row from workspace (status, preferredModel, descriptor fields, etc.)."""
        try:
            agents = await self.ws_client.list_agents(workspace_id)
            for ag in agents:
                if ag.get("type") == agent_type:
                    return ag
        except Exception:
            _logger.debug("Could not load agent config for %s/%s", workspace_id, agent_type)
        return {}

    @staticmethod
    def _descriptor_kwargs(agent_cfg: dict[str, Any]) -> dict[str, Any]:
        """Extract AgentTask descriptor fields from a workspace agent row."""
        kw: dict[str, Any] = {}
        if agent_cfg.get("preferredModel"):
            kw["preferred_model"] = agent_cfg["preferredModel"]
        if agent_cfg.get("systemPromptTemplate"):
            kw["system_prompt"] = agent_cfg["systemPromptTemplate"]
        if agent_cfg.get("type"):
            kw["agent_type"] = agent_cfg["type"]
        tools = agent_cfg.get("toolManifest")
        if tools and isinstance(tools, list) and len(tools) > 0:
            names: list[str] = []
            for t in tools:
                if isinstance(t, str):
                    names.append(t)
                elif isinstance(t, dict):
                    n = t.get("name") or t.get("function", {}).get("name", "")
                    if n:
                        names.append(n)
            if names:
                kw["enabled_tools"] = names
        caps = agent_cfg.get("capabilities")
        if caps and isinstance(caps, dict) and caps:
            kw["capability"] = caps
        if "trustThreshold" in agent_cfg:
            kw["trust_threshold"] = float(agent_cfg["trustThreshold"])
        return kw

    async def _check_governance_gate(
        self,
        workspace_id: str,
        agent_type: AgentType,
        task: AgentTask,
        *,
        sid: str | None = None,
        timeout: float = 300,
        force_approval: bool = False,
    ) -> bool:
        """Check autonomy level; if supervised, wait for human approval.

        When ``force_approval`` is True (user set require_approval on the
        agent profile), approval is always required regardless of trust level.
        Returns True if execution may proceed, False if rejected.
        """
        if not self.llm and not force_approval:
            return True
        model = task.preferred_model or "default"
        level = "autonomous"
        try:
            result = await self.llm.check_autonomy(model, agent_type.value) if self.llm else {}
            level = result.get("autonomy", "autonomous")
        except Exception:
            pass

        if not force_approval and level == "autonomous":
            return True

        approval_key = f"{workspace_id}:{task.task_id}"
        event = asyncio.Event()
        self._pending_approvals[approval_key] = event

        payload = {
            "workspace_id": workspace_id,
            "task_id": task.task_id,
            "agent_type": agent_type.value,
            "autonomy_level": level,
            "description": task.description,
            "approval_key": approval_key,
        }
        await self.ws_gw.publish({
            "type": "approval:required",
            "workspaceId": workspace_id,
            "payload": payload,
        })
        if sid:
            await self.sm.broadcast(workspace_id, sid, "approval", "required", payload)

        await self.ws_gw.publish_log(
            workspace_id, "pm",
            f"Awaiting approval for {agent_type.value}: {task.description} (level={level})",
            level="warn", task_id=task.task_id,
        )

        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            self._pending_approvals.pop(approval_key, None)
            self._approval_results.pop(approval_key, None)
            await self.ws_gw.publish_log(
                workspace_id, "pm", f"Approval timed out for task {task.task_id}",
                level="error", task_id=task.task_id,
            )
            return False

        self._pending_approvals.pop(approval_key, None)
        approved = self._approval_results.pop(approval_key, False)

        result_str = "approved" if approved else "rejected"
        await self.ws_gw.publish({
            "type": f"approval:{result_str}",
            "workspaceId": workspace_id,
            "payload": {"approval_key": approval_key, "task_id": task.task_id},
        })
        return approved

    def resolve_approval(self, approval_key: str, approved: bool) -> bool:
        """Called by the REST endpoint when a human approves/rejects."""
        event = self._pending_approvals.get(approval_key)
        if not event:
            return False
        self._approval_results[approval_key] = approved
        event.set()
        return True

    def _get_lock(self, workspace_id: str) -> asyncio.Lock:
        if workspace_id not in self._workspace_locks:
            self._workspace_locks[workspace_id] = asyncio.Lock()
        return self._workspace_locks[workspace_id]

    def is_busy(self, workspace_id: str) -> bool:
        return workspace_id in self._active_runs

    async def _fetch_workspace_graph(self, workspace_id: str) -> dict[str, Any] | None:
        try:
            resp = await self.ws_client._http.get(f"/api/workspaces/{workspace_id}/graphs/active")
            if resp.status_code != 200:
                return None
            body = resp.json()
            data = body.get("data")
            if data and isinstance(data, dict) and data.get("graphDef"):
                graph_def = data["graphDef"]
                if isinstance(graph_def, dict) and graph_def.get("nodes"):
                    return graph_def
        except Exception as exc:
            _logger.debug("Failed to fetch workspace graph: %s", exc)
        return None

    async def _fetch_graph_by_id(self, workspace_id: str, graph_id: str) -> dict[str, Any] | None:
        try:
            resp = await self.ws_client._http.get(f"/api/workspaces/{workspace_id}/graphs/{graph_id}")
            if resp.status_code != 200:
                return None
            body = resp.json()
            data = body.get("data")
            if data and isinstance(data, dict) and data.get("graphDef"):
                graph_def = data["graphDef"]
                if isinstance(graph_def, dict) and graph_def.get("nodes"):
                    return graph_def
        except Exception as exc:
            _logger.debug("Failed to fetch graph %s: %s", graph_id, exc)
        return None

    async def _resolve_phase_graph(
        self, workspace_id: str, phase_type: str,
        pipeline_configs: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any] | None:
        """Resolve graph for a phase: phase-specific graphId first, then workspace active fallback."""
        if not self.graph_executor or not HAS_LANGGRAPH:
            return None
        configs = pipeline_configs or await self._resolve_pipeline_configs(workspace_id)
        phase_cfg = next((c for c in configs if c.get("phaseKey") == phase_type), None)
        graph_id = phase_cfg.get("graphId") if phase_cfg else None
        if graph_id:
            return await self._fetch_graph_by_id(workspace_id, graph_id)
        return await self._fetch_workspace_graph(workspace_id)

    @staticmethod
    def _auto_graph_for_tasks(
        phase_type: str, tasks: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Generate a sequential capability graph from pending tasks.

        Each task becomes a capability node targeting the phase's domain agent.
        """
        agent_type = _agent_for_phase(phase_type)
        agent_key = agent_type.value
        cap_ref_map: dict[str, str] = {
            "requirement": "requirement.analyze",
            "architecture": "architecture.design",
            "design": "design.ui",
            "development": "development.code_gen",
            "testing": "testing.run",
            "deployment": "cicd.pipeline",
            "monitoring": "monitoring.setup",
        }
        cap_ref = cap_ref_map.get(phase_type, f"{agent_key}.{agent_key}")

        nodes = [
            {
                "id": t["id"],
                "type": "capability",
                "capability_ref": cap_ref,
                "config": {
                    "task_title": t.get("title", "Untitled"),
                    "task_description": t.get("description", ""),
                    "timeout": 300,
                },
            }
            for t in tasks
        ]
        edges: list[dict[str, str]] = []
        if nodes:
            edges.append({"source": "__start__", "target": nodes[0]["id"]})
            for i in range(len(nodes) - 1):
                edges.append({"source": nodes[i]["id"], "target": nodes[i + 1]["id"]})
            edges.append({"source": nodes[-1]["id"], "target": "__end__"})

        return {
            "nodes": nodes,
            "edges": edges,
            "state_schema": {
                "messages": {"type": "list", "reducer": "append"},
            },
            "config": {"checkpointer": "memory", "recursion_limit": 25},
        }

    async def _build_cross_phase_context(
        self, workspace_id: str, completed_phases: list[str],
    ) -> str:
        """Build rich artifact context from completed upstream phases."""
        sections: list[str] = []
        phase_to_agent = {v: k for k, v in AGENT_PHASE_MAP.items()}
        for phase in completed_phases[-3:]:
            agent_key = phase_to_agent.get(phase, phase)
            try:
                artifacts = await self.ws_client.list_artifacts(workspace_id, agent_type=agent_key)
                for art in artifacts[:5]:
                    title = art.get("title", "untitled")
                    art_type = art.get("type", "unknown")
                    content = art.get("content", "")[:2000]
                    sections.append(f"### [{phase}] {title} ({art_type})\n{content}")
            except Exception:
                _logger.debug("Failed to fetch artifacts for cross-phase context: %s", phase)
        if not sections:
            return ""
        return "## Upstream Phase Artifacts\n\n" + "\n\n---\n\n".join(sections)

    async def _fetch_upstream_artifacts_for_phase(
        self, workspace_id: str, phase_type: str,
    ) -> list[dict[str, Any]]:
        """Fetch actual artifact dicts from upstream phases for graph state injection."""
        upstream_phases = {
            "requirement": [],
            "architecture": ["requirement"],
            "design": ["requirement", "architecture"],
            "development": ["requirement", "architecture", "design"],
            "testing": ["development", "design"],
        }.get(phase_type, [])

        phase_to_agent = {v: k for k, v in AGENT_PHASE_MAP.items()}
        results: list[dict[str, Any]] = []
        for up_phase in upstream_phases:
            agent_key = phase_to_agent.get(up_phase, up_phase)
            try:
                artifacts = await self.ws_client.list_artifacts(workspace_id, agent_type=agent_key)
                for art in artifacts[:5]:
                    results.append({
                        "phase": up_phase,
                        "agent_type": agent_key,
                        "type": art.get("type", ""),
                        "title": art.get("title", ""),
                        "content": art.get("content", "")[:3000],
                    })
            except Exception:
                _logger.debug("Failed to fetch upstream artifacts for phase %s", up_phase)
        return results

    async def _execute_graph_for_phase(
        self, workspace_id: str, phase_type: str, graph_def: dict[str, Any],
        sid: str, user_message: str = "", preferred_model: str | None = None,
    ) -> AsyncIterator[str]:
        if not self.graph_executor:
            yield self._trace_ev(sid, "phase", "skip", {"phase": phase_type, "reason": "GraphExecutor not available"})
            return
        await self._ensure_mcp_providers(workspace_id)

        gitlab_ctx: dict[str, Any] = {}
        try:
            repos = await self.ws_client.get_repos_for_phase(workspace_id, phase_type)
            primary = next((r for r in repos if r.get("isPrimary")), repos[0] if repos else None)
            if primary:
                strategy = primary.get("branchStrategy", "feature")
                default_branch = primary.get("branchDefault", "main")
                project_url = primary.get("projectUrl", "")
                project_path = ""
                if project_url:
                    from urllib.parse import urlparse
                    project_path = urlparse(project_url).path.strip("/")
                gitlab_ctx = {
                    "gitlab_repos": repos,
                    "gitlab_primary_project": primary.get("projectId"),
                    "gitlab_primary_url": primary.get("gitlabUrl"),
                    "gitlab_project_path": project_path,
                    "gitlab_url": primary.get("gitlabUrl"),
                    "gitlab_branch_strategy": strategy,
                    "gitlab_branch_default": default_branch,
                    "gitlab_branch": resolve_branch_name(phase_type, strategy, default_branch),
                    "gitlab_credential_id": primary.get("credentialId"),
                }
        except Exception:
            _logger.debug("Could not load repos for graph phase %s", phase_type)

        upstream_artifacts = await self._fetch_upstream_artifacts_for_phase(workspace_id, phase_type)

        input_state = {
            "workspace_id": workspace_id,
            "phase_type": phase_type,
            "user_message": user_message,
            "preferred_model": preferred_model or "default",
            "agent_type": _agent_for_phase(phase_type).value,
            "upstream_artifacts": upstream_artifacts,
            **gitlab_ctx,
        }
        try:
            async for event in self.graph_executor.execute(graph_def, input_state):
                evt_type = event.get("event", "")
                data = event.get("data", {})
                if evt_type == "graph:node_complete":
                    output = data.get("output", {})
                    node_error = output.get("_error", "") if isinstance(output, dict) else ""
                    node_id = data.get("node", "")
                    if node_error:
                        payload = {"phase": phase_type, "task_id": node_id, "task_title": node_id, "error": node_error[:500], "source": "graph"}
                        yield self._trace_ev(sid, "task", "error", payload)
                        await self.sm.broadcast(workspace_id, sid, "task", "error", payload)
                    else:
                        payload = {"phase": phase_type, "task_id": node_id, "task_title": node_id, "result_summary": str(output)[:200], "source": "graph"}
                        yield self._trace_ev(sid, "task", "complete", payload)
                        await self.sm.broadcast(workspace_id, sid, "task", "complete", payload)
                elif evt_type == "graph:error":
                    payload = {"phase": phase_type, "error": data.get("error", "unknown graph error"), "source": "graph"}
                    yield self._trace_ev(sid, "task", "error", payload)
                    await self.sm.broadcast(workspace_id, sid, "task", "error", payload)
        except Exception as exc:
            payload = {"phase": phase_type, "error": str(exc), "source": "graph"}
            yield self._trace_ev(sid, "task", "error", payload)
            await self.sm.broadcast(workspace_id, sid, "task", "error", payload)

    async def _sync_phase_task_status(
        self, workspace_id: str, phase_id: str, phase_status: PhaseStatus,
    ) -> None:
        """After graph execution, sync workspace task statuses to match phase outcome.

        When a phase completes successfully, mark all pending tasks in that phase
        as completed so progress tracking and the frontend reflect reality.
        """
        try:
            tasks = await self.ws_client.get_tasks_by_phase(workspace_id, phase_id)
            target_status = "completed" if phase_status == PhaseStatus.COMPLETED else "in_progress"
            for t in tasks:
                if t.get("status") in ("pending", "in_progress"):
                    try:
                        if target_status == "completed":
                            await self.ws_client.complete_task(workspace_id, t["id"])
                        else:
                            await self.ws_client.update_task(workspace_id, t["id"], {"status": target_status})
                    except Exception:
                        pass
        except Exception:
            _logger.debug("Failed to sync task status for phase %s", phase_id)

    async def _recover_after_project_error(self, workspace_id: str, phase_type: str, failed_task_id: str | None) -> None:
        phase_id = await self.ws_client.find_phase_by_type(workspace_id, phase_type)
        if not phase_id:
            return
        try:
            await self.ws_client.update_phase(workspace_id, phase_id, status=PhaseStatus.PENDING)
        except Exception:
            pass
        if failed_task_id:
            try:
                await self.ws_client.update_task(workspace_id, failed_task_id, {"status": "pending"})
            except Exception:
                pass
        await self.ws_gw.publish_log(workspace_id, "pm", f"Project run stopped in {phase_type}; phase reset to pending and failed task unlocked for retry.", level="warn")

    # ------------------------------------------------------------------
    # run_task
    # ------------------------------------------------------------------

    async def run_task(self, workspace_id: str, task_id: str, user_message: str = "") -> AsyncIterator[str]:
        phases = await self.ws_client.get_phases(workspace_id)
        target_task: dict[str, Any] | None = None
        phase_type: str = "development"
        for phase in phases:
            for t in phase.get("tasks", []):
                if t.get("id") == task_id:
                    target_task = t
                    phase_type = phase.get("type", "development")
                    break
            if target_task:
                break

        if not target_task:
            sid_err = "err-" + task_id[:8]
            yield self._trace_ev(sid_err, "task", "error", {"task_id": task_id, "error": "Task not found"})
            return

        task_title = target_task.get("title", "Untitled")
        agent_type = _agent_for_phase(phase_type)
        requirement_id = target_task.get("requirementId")

        sid = await self.sm.create(
            "workflow_task", workspace_id, user_message=user_message,
            intent_type=f"execute_{phase_type}", intent_summary=task_title,
            agent_type=agent_type.value, triggered_by="workflow",
            requirement_id=requirement_id, task_ids=[task_id], result_type=phase_type,
        )
        yield self.sm.session_start(sid, "workflow_task", workspace_id)

        payload_start = {"phase": phase_type, "task_id": task_id, "task_title": task_title, "index": 0, "total": 1}
        yield self._trace_ev(sid, "task", "start", payload_start)
        await self.sm.broadcast(workspace_id, sid, "task", "start", payload_start)

        try:
            await self.ws_client.update_task(workspace_id, task_id, {"status": "in_progress"})
        except Exception:
            pass

        repos = await self.ws_client.get_repos_for_phase(workspace_id, phase_type)
        primary = next((r for r in repos if r.get("isPrimary")), repos[0] if repos else None)
        gitlab_ctx: dict[str, Any] = {}
        if primary:
            strategy = primary.get("branchStrategy", "feature")
            default_branch = primary.get("branchDefault", "main")
            gitlab_ctx = {
                "gitlab_repos": repos, "gitlab_primary_project": primary.get("projectId"),
                "gitlab_primary_url": primary.get("gitlabUrl"), "gitlab_branch_strategy": strategy,
                "gitlab_branch_default": default_branch,
                "gitlab_branch": resolve_branch_name(task_title, strategy, default_branch),
                "gitlab_credential_id": primary.get("credentialId"),
            }

        agent_cfg = await self._resolve_agent_config(workspace_id, agent_type.value)
        desc_kw = self._descriptor_kwargs(agent_cfg)
        agent_task = AgentTask(
            task_id=task_id, workspace_id=workspace_id,
            intent=f"execute_{phase_type}", description=task_title,
            user_message=user_message or target_task.get("description", ""),
            context={"task_title": task_title, "task_description": target_task.get("description", ""), "phase_type": phase_type, **gitlab_ctx},
            **desc_kw,
        )

        try:
            result = await self.dispatcher.dispatch(agent_type, agent_task)
            if isinstance(result, dict) and result.get("error"):
                try:
                    await self.ws_client.update_task(workspace_id, task_id, {"status": "pending"})
                except Exception:
                    pass
                payload_err = {"phase": phase_type, "task_id": task_id, "task_title": task_title, "error": str(result["error"])}
                yield self._trace_ev(sid, "task", "error", payload_err)
                await self.sm.broadcast(workspace_id, sid, "task", "error", payload_err)
                yield self.sm.session_complete(sid, "failed")
                await self.sm.finish(
                    sid, workspace_id, "failed", str(result["error"]),
                    steps=self._dump_trace(sid),
                )
            else:
                try:
                    await self.ws_client.complete_task(workspace_id, task_id)
                except Exception:
                    pass
                full_result = str(result)
                payload_done = {"phase": phase_type, "task_id": task_id, "task_title": task_title, "result_summary": full_result[:200]}
                yield self._trace_ev(sid, "task", "complete", payload_done)
                await self.sm.broadcast(workspace_id, sid, "task", "complete", payload_done)
                if len(full_result) > 100:
                    asyncio.create_task(_auto_index_to_rag(workspace_id, f"[{phase_type}] {task_title}", full_result))
                yield self.sm.session_complete(sid)
                await self.sm.finish(sid, workspace_id, steps=self._dump_trace(sid))
        except Exception as exc:
            try:
                await self.ws_client.update_task(workspace_id, task_id, {"status": "pending"})
            except Exception:
                pass
            payload_err = {"phase": phase_type, "task_id": task_id, "task_title": task_title, "error": str(exc)}
            yield self._trace_ev(sid, "task", "error", payload_err)
            await self.sm.broadcast(workspace_id, sid, "task", "error", payload_err)
            yield self.sm.session_complete(sid, "failed")
            await self.sm.finish(
                sid, workspace_id, "failed", str(exc), steps=self._dump_trace(sid),
            )

    # ------------------------------------------------------------------
    # run_phase
    # ------------------------------------------------------------------

    async def run_phase(self, workspace_id: str, phase_type: str, user_message: str = "") -> AsyncIterator[str]:
        lock = self._get_lock(workspace_id)
        if lock.locked():
            current = self._active_runs.get(workspace_id, "unknown")
            sid_skip = "skip-" + phase_type[:8]
            yield self._trace_ev(sid_skip, "phase", "skip", {"phase": phase_type, "reason": f"Workspace busy (running: {current}). Please wait for it to finish."})
            return

        async with lock:
            self._active_runs[workspace_id] = f"phase:{phase_type}"
            try:
                async for evt in self._run_phase_inner(workspace_id, phase_type, user_message):
                    yield evt
            finally:
                self._active_runs.pop(workspace_id, None)

    async def _run_phase_inner(
        self, workspace_id: str, phase_type: str, user_message: str = "",
        pipeline_configs: list[dict[str, Any]] | None = None,
    ) -> AsyncIterator[str]:
        sid = await self.sm.create(
            "workflow_phase", workspace_id, user_message=user_message,
            intent_type=f"execute_phase_{phase_type}", intent_summary=f"Phase: {phase_type}",
            agent_type="pm", triggered_by="workflow", result_type=phase_type,
        )
        yield self.sm.session_start(sid, "workflow_phase", workspace_id)

        payload_phase_start = {"phase": phase_type, "workspace_id": workspace_id}
        yield self._trace_ev(sid, "phase", "start", payload_phase_start)
        await self.sm.broadcast(workspace_id, sid, "phase", "start", payload_phase_start)
        await self.ws_gw.publish_agent_status(workspace_id, AgentType.PM, AgentStatus.RUNNING, detail=f"Running phase: {phase_type}")

        phase_id = await self.ws_client.find_phase_by_type(workspace_id, phase_type)
        if not phase_id:
            payload_skip = {"phase": phase_type, "reason": "not found"}
            yield self._trace_ev(sid, "phase", "skip", payload_skip)
            await self.sm.broadcast(workspace_id, sid, "phase", "skip", payload_skip)
            yield self.sm.session_complete(sid, "cancelled")
            await self.sm.finish(
                sid, workspace_id, "cancelled", steps=self._dump_trace(sid),
            )
            return

        # Resolve agent config + governance gate BEFORE choosing execution mode
        agent_type = _agent_for_phase(phase_type)
        agent_cfg = await self._resolve_agent_config(workspace_id, agent_type.value)

        if not agent_cfg.get("enabled", True):
            payload_skip = {"phase": phase_type, "reason": "phase disabled in agent profile"}
            yield self._trace_ev(sid, "phase", "skip", payload_skip)
            await self.sm.broadcast(workspace_id, sid, "phase", "skip", payload_skip)
            yield self.sm.session_complete(sid, "cancelled")
            await self.sm.finish(
                sid, workspace_id, "cancelled", steps=self._dump_trace(sid),
            )
            return

        desc_kw = self._descriptor_kwargs(agent_cfg)
        preferred_model = desc_kw.get("preferred_model")

        gate_task = AgentTask(
            task_id=f"phase:{phase_type}", workspace_id=workspace_id,
            intent=f"execute_{phase_type}", description=f"Phase: {phase_type}",
            user_message=user_message,
            context={"phase_type": phase_type},
            **desc_kw,
        )
        require_approval = agent_cfg.get("requireApproval", False)
        approved = await self._check_governance_gate(
            workspace_id, agent_type, gate_task, sid=sid,
            force_approval=require_approval,
        )
        if not approved:
            payload_skip = {"phase": phase_type, "reason": "Governance gate rejected or timed out"}
            yield self._trace_ev(sid, "phase", "skip", payload_skip)
            await self.sm.broadcast(workspace_id, sid, "phase", "skip", payload_skip)
            yield self.sm.session_complete(sid, "cancelled")
            await self.sm.finish(
                sid, workspace_id, "cancelled", steps=self._dump_trace(sid),
            )
            return

        # Graph mode: agent config graphId → pipeline config graphId → workspace active fallback
        agent_graph_id = agent_cfg.get("graphId")
        if agent_graph_id and self.graph_executor and HAS_LANGGRAPH:
            graph_def = await self._fetch_graph_by_id(workspace_id, agent_graph_id)
        else:
            if pipeline_configs is None:
                pipeline_configs = await self._resolve_pipeline_configs(workspace_id)
            graph_def = await self._resolve_phase_graph(workspace_id, phase_type, pipeline_configs)
        effective_graph = graph_def
        graph_source = "graph"
        if not effective_graph:
            from .default_graphs import DEFAULT_PHASE_GRAPHS
            dg = DEFAULT_PHASE_GRAPHS.get(phase_type)
            if dg and self.graph_executor and HAS_LANGGRAPH:
                effective_graph = dg
                graph_source = "default_graph"

        if effective_graph:
            await self.ws_gw.publish_log(workspace_id, "pm", f"Using {graph_source} execution for phase: {phase_type}")
            try:
                await self.ws_client.update_phase(workspace_id, phase_id, status=PhaseStatus.IN_PROGRESS)
            except Exception:
                pass
            graph_tasks = 0
            graph_errors = 0
            async for evt in self._execute_graph_for_phase(workspace_id, phase_type, effective_graph, sid, user_message, preferred_model=preferred_model):
                yield evt
                if "task:complete" in evt:
                    graph_tasks += 1
                elif "task:error" in evt:
                    graph_errors += 1
            final_status = PhaseStatus.COMPLETED if graph_errors == 0 else PhaseStatus.IN_PROGRESS
            try:
                await self.ws_client.update_phase(workspace_id, phase_id, status=final_status)
            except Exception:
                pass

            await self._sync_phase_task_status(workspace_id, phase_id, final_status)

            payload_done = {"phase": phase_type, "tasks_executed": graph_tasks, "tasks_total": graph_tasks + graph_errors, "tasks_failed": graph_errors, "source": graph_source}
            yield self._trace_ev(sid, "phase", "complete", payload_done)
            await self.sm.broadcast(workspace_id, sid, "phase", "complete", payload_done)
            yield self.sm.session_complete(sid)
            await self.sm.finish(sid, workspace_id, steps=self._dump_trace(sid))
            return

        # Fallback: direct agent dispatch mode (no graph executor)
        tasks = await self.ws_client.get_tasks_by_phase(workspace_id, phase_id)
        pending = [t for t in tasks if t.get("status") != "completed"]
        if not pending:
            payload_skip = {"phase": phase_type, "reason": "no pending tasks"}
            yield self._trace_ev(sid, "phase", "skip", payload_skip)
            await self.sm.broadcast(workspace_id, sid, "phase", "skip", payload_skip)
            yield self.sm.session_complete(sid, "cancelled")
            await self.sm.finish(
                sid, workspace_id, "cancelled", steps=self._dump_trace(sid),
            )
            return

        try:
            await self.ws_client.update_phase(workspace_id, phase_id, status=PhaseStatus.IN_PROGRESS)
        except Exception:
            pass

        tasks_succeeded = 0
        tasks_failed = 0
        upstream_results: list[dict[str, Any]] = []
        for i, task in enumerate(pending):
            task_title = task.get("title", "Untitled")
            payload_start = {"phase": phase_type, "task_id": task["id"], "task_title": task_title, "index": i, "total": len(pending)}
            yield self._trace_ev(sid, "task", "start", payload_start)
            await self.sm.broadcast(workspace_id, sid, "task", "start", payload_start)
            await self.ws_gw.publish_log(workspace_id, "pm", f"[{phase_type}] Executing task {i+1}/{len(pending)}: {task_title}", task_id=task["id"])

            claimed = await self.ws_client.claim_task(workspace_id, task["id"], agent=agent_type.value)
            if claimed is None:
                await self.ws_gw.publish_log(workspace_id, "pm", f"Task '{task_title}' already claimed — skipping", level="warn", task_id=task["id"])
                continue

            repos = await self.ws_client.get_repos_for_phase(workspace_id, phase_type)
            primary = next((r for r in repos if r.get("isPrimary")), repos[0] if repos else None)
            gitlab_ctx: dict[str, Any] = {}
            if primary:
                strategy = primary.get("branchStrategy", "feature")
                default_branch = primary.get("branchDefault", "main")
                gitlab_ctx = {
                    "gitlab_repos": repos, "gitlab_primary_project": primary.get("projectId"),
                    "gitlab_primary_url": primary.get("gitlabUrl"), "gitlab_branch_strategy": strategy,
                    "gitlab_branch_default": default_branch,
                    "gitlab_branch": resolve_branch_name(task_title, strategy, default_branch),
                    "gitlab_credential_id": primary.get("credentialId"),
                }

            task_context: dict[str, Any] = {
                "task_title": task_title,
                "task_description": task.get("description", ""),
                "phase_type": phase_type,
                **gitlab_ctx,
            }
            if upstream_results:
                task_context["upstream_results"] = upstream_results[-3:]

            agent_task = AgentTask(
                task_id=task["id"], workspace_id=workspace_id,
                intent=f"execute_{phase_type}", description=task_title,
                user_message=user_message or task.get("description", ""),
                context=task_context,
                **desc_kw,
            )

            try:
                result = await self.dispatcher.dispatch(agent_type, agent_task)
                if isinstance(result, dict) and result.get("error"):
                    tasks_failed += 1
                    payload_err = {"phase": phase_type, "task_id": task["id"], "task_title": task_title, "error": str(result["error"])}
                    yield self._trace_ev(sid, "task", "error", payload_err)
                    await self.sm.broadcast(workspace_id, sid, "task", "error", payload_err)
                else:
                    tasks_succeeded += 1
                    try:
                        await self.ws_client.complete_task(workspace_id, task["id"])
                    except Exception:
                        pass
                    result_summary = str(result)[:200]
                    upstream_results.append({"task": task_title, "result": str(result)[:1000]})
                    payload_done = {"phase": phase_type, "task_id": task["id"], "task_title": task_title, "result_summary": result_summary}
                    yield self._trace_ev(sid, "task", "complete", payload_done)
                    await self.sm.broadcast(workspace_id, sid, "task", "complete", payload_done)
                    full_result = str(result)
                    if len(full_result) > 100:
                        asyncio.create_task(_auto_index_to_rag(workspace_id, f"[{phase_type}] {task_title}", full_result))
            except Exception as exc:
                tasks_failed += 1
                payload_err = {"phase": phase_type, "task_id": task["id"], "task_title": task_title, "error": str(exc)}
                yield self._trace_ev(sid, "task", "error", payload_err)
                await self.sm.broadcast(workspace_id, sid, "task", "error", payload_err)

        final_status = PhaseStatus.COMPLETED if tasks_failed == 0 else PhaseStatus.IN_PROGRESS
        try:
            await self.ws_client.update_phase(workspace_id, phase_id, status=final_status)
        except Exception:
            pass

        payload_phase_done = {"phase": phase_type, "tasks_executed": tasks_succeeded, "tasks_total": len(pending), "tasks_failed": tasks_failed}
        yield self._trace_ev(sid, "phase", "complete", payload_phase_done)
        await self.sm.broadcast(workspace_id, sid, "phase", "complete", payload_phase_done)

        if tasks_failed:
            await self.ws_gw.publish_log(workspace_id, "pm", f"Phase {phase_type} finished: {tasks_succeeded} succeeded, {tasks_failed} failed", level="error" if tasks_succeeded == 0 else "warn")
        else:
            await self.ws_gw.publish_log(workspace_id, "pm", f"Phase {phase_type} complete: {tasks_succeeded} tasks executed", level="success")
            asyncio.create_task(_trigger_distill(workspace_id))
            asyncio.create_task(_store_org_memory(workspace_id, f"Phase '{phase_type}' completed with {tasks_succeeded} tasks in workspace {workspace_id}."))

        status_str = "success" if tasks_failed == 0 else "failed"
        yield self.sm.session_complete(sid, status_str)
        await self.sm.finish(
            sid,
            workspace_id,
            status_str,
            f"{tasks_failed} task(s) failed" if tasks_failed else None,
            steps=self._dump_trace(sid),
        )

    # ------------------------------------------------------------------
    # run_project
    # ------------------------------------------------------------------

    async def run_project(self, workspace_id: str, user_message: str = "", *, start_phase: str | None = None) -> AsyncIterator[str]:
        lock = self._get_lock(workspace_id)
        if lock.locked():
            current = self._active_runs.get(workspace_id, "unknown")
            sid_err = "proj-err"
            yield self._trace_ev(sid_err, "project", "error", {"error": f"Workspace busy (running: {current}). Please wait for it to finish."})
            return

        async with lock:
            self._active_runs[workspace_id] = "project:full-lifecycle"
            try:
                async for evt in self._run_project_inner(workspace_id, user_message, start_phase=start_phase):
                    yield evt
            finally:
                self._active_runs.pop(workspace_id, None)

    async def _resolve_pipeline_configs(self, workspace_id: str) -> list[dict[str, Any]]:
        """Build pipeline-like configs from the unified agent table.

        Falls back to the legacy workspace_pipeline_configs endpoint if agents
        don't yet have the new profile fields.
        """
        try:
            agents = await self.ws_client.list_agents(workspace_id)
            if agents and isinstance(agents, list) and any("enabled" in a for a in agents):
                return [
                    {
                        "phaseKey": a.get("type", ""),
                        "enabled": a.get("enabled", True),
                        "requireApproval": a.get("requireApproval", False),
                        "qualityGate": a.get("qualityGate"),
                        "graphId": a.get("graphId"),
                    }
                    for a in agents
                ]
        except Exception:
            pass
        try:
            configs = await self.ws_client.get_pipeline_configs(workspace_id)
            if isinstance(configs, list):
                return configs
        except Exception:
            _logger.debug("Could not load pipeline config for %s", workspace_id)
        return []

    def _phase_order_from_configs(self, configs: list[dict[str, Any]]) -> list[str]:
        """Derive phase execution order from pipeline/agent configs (SDLC-sequential)."""
        if configs:
            enabled: set[str] = set()
            for cfg in configs:
                key = cfg.get("phaseKey", "")
                if not cfg.get("enabled", True):
                    continue
                enabled.add(PIPELINE_KEY_TO_PHASE.get(key, key))
            if enabled:
                return [p for p in DEFAULT_PHASE_ORDER if p in enabled]
        return list(DEFAULT_PHASE_ORDER)

    async def _check_quality_gate(
        self, workspace_id: str, phase_type: str, sid: str,
        configs: list[dict[str, Any]] | None = None,
        agent_cfg: dict[str, Any] | None = None,
    ) -> bool:
        """Run post-phase quality gate. Returns True if gate passes or no gate configured."""
        gate_expr: str | None = agent_cfg.get("qualityGate") if agent_cfg else None
        if gate_expr is None:
            if configs is None:
                configs = await self._resolve_pipeline_configs(workspace_id)
            for cfg in configs:
                key = cfg.get("phaseKey", "")
                resolved = PIPELINE_KEY_TO_PHASE.get(key, key)
                if resolved == phase_type:
                    gate_expr = cfg.get("qualityGate")
                    break

        if not gate_expr:
            return True

        payload = {
            "phase": phase_type,
            "gate": gate_expr,
            "workspace_id": workspace_id,
        }

        await self.ws_gw.publish_log(
            workspace_id, "pm",
            f"Quality gate check for {phase_type}: {gate_expr}",
            level="info",
        )
        await self.ws_gw.publish({
            "type": "quality_gate:check",
            "workspaceId": workspace_id,
            "payload": payload,
        })

        gate_lower = gate_expr.strip().lower()

        if gate_lower == "manual":
            approval_key = f"qg:{workspace_id}:{phase_type}"
            event = asyncio.Event()
            self._pending_approvals[approval_key] = event
            await self.ws_gw.publish({
                "type": "approval:required",
                "workspaceId": workspace_id,
                "payload": {
                    "workspace_id": workspace_id,
                    "phase": phase_type,
                    "approval_key": approval_key,
                    "agent_type": "pm",
                    "description": f"Quality gate (manual) for {phase_type}",
                },
            })
            try:
                await asyncio.wait_for(event.wait(), timeout=600)
            except asyncio.TimeoutError:
                self._pending_approvals.pop(approval_key, None)
                self._approval_results.pop(approval_key, None)
                return False

            self._pending_approvals.pop(approval_key, None)
            passed = self._approval_results.pop(approval_key, False)
            return passed

        if gate_lower == "artifact_check":
            return await self._quality_gate_artifact_check(
                workspace_id, phase_type, sid,
            )

        if gate_lower == "llm_review":
            return await self._quality_gate_llm_review(
                workspace_id, phase_type, sid,
            )

        await self.ws_gw.publish({
            "type": "quality_gate:passed",
            "workspaceId": workspace_id,
            "payload": {**payload, "result": "auto_pass"},
        })
        return True

    async def _quality_gate_artifact_check(
        self, workspace_id: str, phase_type: str, sid: str,
    ) -> bool:
        """Verify that expected artifact types were produced for the phase."""
        contract = await self.resolve_phase_contract(workspace_id, phase_type)
        if not contract.expected_artifact_types:
            return True

        try:
            arts = await self.ws_client.query_artifacts(workspace_id, phase=phase_type)
        except Exception:
            arts = []

        produced_types = {a.get("type", "") for a in arts} if arts else set()
        missing = [t for t in contract.expected_artifact_types if t not in produced_types]

        if missing:
            self._trace_ev(sid, "quality_gate", "fail", {
                "phase": phase_type, "gate": "artifact_check",
                "missing_artifacts": missing,
            })
            await self.ws_gw.publish_log(
                workspace_id, "pm",
                f"Quality gate failed for {phase_type}: missing artifacts {missing}",
                level="warn",
            )
            await self.ws_gw.publish({
                "type": "quality_gate:failed",
                "workspaceId": workspace_id,
                "payload": {"phase": phase_type, "gate": "artifact_check", "missing": missing},
            })
            return False

        await self.ws_gw.publish({
            "type": "quality_gate:passed",
            "workspaceId": workspace_id,
            "payload": {"phase": phase_type, "gate": "artifact_check", "result": "all_present"},
        })
        return True

    async def _quality_gate_llm_review(
        self, workspace_id: str, phase_type: str, sid: str,
    ) -> bool:
        """Use the LLM gateway to review phase artifacts for quality."""
        try:
            arts = await self.ws_client.query_artifacts(workspace_id, phase=phase_type)
        except Exception:
            arts = []

        if not arts:
            await self.ws_gw.publish_log(
                workspace_id, "pm",
                f"LLM quality gate for {phase_type}: no artifacts to review, auto-pass",
                level="info",
            )
            return True

        arts_summary = "\n\n".join(
            f"### {a.get('title', 'Untitled')} ({a.get('type', '?')})\n{a.get('content', '')[:1500]}"
            for a in arts[:5]
        )

        prompt = (
            f"Review the following artifacts from the '{phase_type}' phase of a software project.\n"
            f"Determine if the quality is sufficient to proceed to the next phase.\n"
            f"Respond with ONLY 'PASS' or 'FAIL' on the first line, followed by a brief explanation.\n\n"
            f"{arts_summary}"
        )

        try:
            result = await self.llm.chat(
                [{"role": "user", "content": prompt}],
                temperature=0.1,
            )
            reply = result.get("choices", [{}])[0].get("message", {}).get("content", "")
            first_line = reply.strip().split("\n")[0].strip().upper()
            passed = first_line.startswith("PASS")

            event_type = "quality_gate:passed" if passed else "quality_gate:failed"
            await self.ws_gw.publish({
                "type": event_type,
                "workspaceId": workspace_id,
                "payload": {
                    "phase": phase_type, "gate": "llm_review",
                    "result": "pass" if passed else "fail",
                    "review": reply[:500],
                },
            })
            if not passed:
                await self.ws_gw.publish_log(
                    workspace_id, "pm",
                    f"LLM quality gate failed for {phase_type}: {reply[:200]}",
                    level="warn",
                )
            return passed
        except Exception as exc:
            logger.warning("LLM quality gate error for %s: %s", phase_type, exc)
            return True  # fail open on LLM error

    async def _run_project_inner(self, workspace_id: str, user_message: str = "", *, start_phase: str | None = None) -> AsyncIterator[str]:
        sid = await self.sm.create(
            "workflow_project", workspace_id, user_message=user_message,
            intent_type="execute_project", intent_summary="Full project lifecycle",
            agent_type="pm", triggered_by="workflow",
        )
        yield self.sm.session_start(sid, "workflow_project", workspace_id)

        pipeline_configs = await self._resolve_pipeline_configs(workspace_id)
        phase_order = self._phase_order_from_configs(pipeline_configs)

        payload_start = {"workspace_id": workspace_id, "phases": phase_order}
        yield self._trace_ev(sid, "project", "start", payload_start)
        await self.sm.broadcast(workspace_id, sid, "project", "start", payload_start)
        await self.ws_gw.publish_agent_status(workspace_id, AgentType.PM, AgentStatus.RUNNING, detail="Running full project lifecycle")

        enabled_set = set(phase_order)
        skipped_phases: list[str] = []
        for p in DEFAULT_PHASE_ORDER:
            if p not in enabled_set:
                skipped_phases.append(p)
                skip_payload = {"phase": p, "reason": "disabled in agent profile"}
                yield self._trace_ev(sid, "phase", "skip", skip_payload)
                await self.sm.broadcast(workspace_id, sid, "phase", "skip", skip_payload)

        start_idx = 0
        if start_phase and start_phase in phase_order:
            start_idx = phase_order.index(start_phase)

        has_error = False
        phase_summaries: list[str] = []
        phases_completed: list[str] = []
        total_tasks_run = 0
        for phase_type in phase_order[start_idx:]:
            enriched_message = user_message
            if phases_completed:
                artifact_context = await self._build_cross_phase_context(workspace_id, phases_completed)
                if artifact_context:
                    enriched_message += "\n\n" + artifact_context
                elif phase_summaries:
                    enriched_message += "\n\nPrevious phase results:\n" + "\n".join(phase_summaries[-3:])

            failed_task_id: str | None = None
            phase_tasks = 0
            async for event_str in self._run_phase_inner(workspace_id, phase_type, enriched_message, pipeline_configs=pipeline_configs):
                yield event_str
                if "task:complete" in event_str:
                    phase_tasks += 1
                if "task:error" in event_str:
                    import json as _json
                    try:
                        for line in event_str.split("\n"):
                            if line.startswith("data: "):
                                data = _json.loads(line[6:])
                                failed_task_id = data.get("task_id")
                    except Exception:
                        pass
                    payload_proj_err = {"phase": phase_type, "error": "task failed", "task_id": failed_task_id}
                    yield self._trace_ev(sid, "project", "error", payload_proj_err)
                    await self.sm.broadcast(workspace_id, sid, "project", "error", payload_proj_err)
                    has_error = True
                    break
            if has_error:
                await self._recover_after_project_error(workspace_id, phase_type, failed_task_id)
                break

            phases_completed.append(phase_type)
            total_tasks_run += phase_tasks
            phase_summaries.append(f"- {phase_type}: {phase_tasks} task(s) completed")

            gate_passed = await self._check_quality_gate(workspace_id, phase_type, sid, configs=pipeline_configs)
            if not gate_passed:
                payload_gate_fail = {"phase": phase_type, "error": "quality gate failed"}
                yield self._trace_ev(sid, "project", "error", payload_gate_fail)
                await self.sm.broadcast(workspace_id, sid, "project", "error", payload_gate_fail)
                has_error = True
                break

        summary_payload = {
            "blockType": "project_summary",
            "phases_completed": phases_completed,
            "phases_skipped": skipped_phases,
            "total_tasks": total_tasks_run,
            "success": not has_error,
        }
        yield self._trace_ev(sid, "content", "payload", summary_payload)

        payload_done = {"workspace_id": workspace_id, "success": not has_error}
        yield self._trace_ev(sid, "project", "complete", payload_done)
        await self.sm.broadcast(workspace_id, sid, "project", "complete", payload_done)
        await self.ws_gw.publish_agent_status(workspace_id, AgentType.PM, AgentStatus.IDLE)
        await self.ws_gw.publish_log(workspace_id, "pm", "Full project lifecycle complete" if not has_error else "Project stopped due to errors", level="success" if not has_error else "error")

        status_str = "success" if not has_error else "failed"
        yield self.sm.session_complete(sid, status_str)
        await self.sm.finish(
            sid, workspace_id, status_str, steps=self._dump_trace(sid),
        )

    # ------------------------------------------------------------------
    # run_requirement
    # ------------------------------------------------------------------

    async def run_requirement(self, workspace_id: str, requirement_id: str, user_message: str = "", phase_type: str | None = None) -> AsyncIterator[str]:
        lock = self._get_lock(workspace_id)
        if lock.locked():
            sid_skip = "skip-req"
            yield self._trace_ev(sid_skip, "phase", "skip", {"phase": phase_type or "?", "reason": "busy"})
            return

        async with lock:
            self._active_runs[workspace_id] = f"requirement:{requirement_id}"
            try:
                async for evt in self._run_requirement_inner(workspace_id, requirement_id, user_message, phase_type):
                    yield evt
            finally:
                self._active_runs.pop(workspace_id, None)
                try:
                    await self.ws_gw.publish_agent_status(workspace_id, "pm", AgentStatus.IDLE)
                except Exception:
                    pass

    async def _run_requirement_inner(self, workspace_id: str, requirement_id: str, user_message: str, phase_type: str | None) -> AsyncIterator[str]:
        req = await self.ws_client.get_requirement(workspace_id, requirement_id)
        if not req:
            sid_err = "err-req"
            yield self._trace_ev(sid_err, "task", "error", {"error": "requirement not found"})
            return

        phase_type = phase_type or req.get("currentPhase", "requirement")
        req_title = req.get("title", "Untitled")

        sid = await self.sm.create(
            "workflow_requirement", workspace_id, user_message=user_message,
            intent_type=f"execute_requirement_{phase_type}", intent_summary=f"{req_title} — {phase_type}",
            agent_type="pm", triggered_by="workflow",
            requirement_id=requirement_id, result_type=phase_type,
        )
        yield self.sm.session_start(sid, "workflow_requirement", workspace_id)

        payload_start = {"phase": phase_type, "requirement_id": requirement_id, "requirement_title": req_title}
        yield self._trace_ev(sid, "phase", "start", payload_start)
        await self.sm.broadcast(workspace_id, sid, "phase", "start", payload_start)
        await self.ws_gw.publish_agent_status(workspace_id, "pm", AgentStatus.RUNNING, detail=f"Requirement: {req_title}")

        phase_id = await self.ws_client.find_phase_by_type(workspace_id, phase_type)
        if not phase_id:
            payload_skip = {"phase": phase_type, "reason": "not found"}
            yield self._trace_ev(sid, "phase", "skip", payload_skip)
            await self.sm.broadcast(workspace_id, sid, "phase", "skip", payload_skip)
            yield self.sm.session_complete(sid, "cancelled")
            await self.sm.finish(
                sid, workspace_id, "cancelled", steps=self._dump_trace(sid),
            )
            return

        all_tasks = req.get("tasks", [])
        pending = [t for t in all_tasks if t.get("phaseId") == phase_id and t.get("status") != "completed"]
        if not pending:
            payload_skip = {"phase": phase_type, "reason": "no pending tasks"}
            yield self._trace_ev(sid, "phase", "skip", payload_skip)
            await self.sm.broadcast(workspace_id, sid, "phase", "skip", payload_skip)
            yield self.sm.session_complete(sid, "cancelled")
            await self.sm.finish(
                sid, workspace_id, "cancelled", steps=self._dump_trace(sid),
            )
            return

        try:
            await self.ws_client.update_requirement(workspace_id, requirement_id, status="in_progress")
        except Exception:
            pass
        try:
            await self.ws_client.update_phase(workspace_id, phase_id, status=PhaseStatus.IN_PROGRESS)
        except Exception:
            pass

        related_artifacts: dict[str, Any] = {}
        try:
            related_artifacts = await self.ws_client.get_related_artifacts(workspace_id, requirement_id)
        except Exception:
            pass

        for rel in req.get("relations", []):
            if rel.get("relationType") == "depends_on":
                try:
                    dep_req = await self.ws_client.get_requirement(workspace_id, rel["targetId"])
                    if dep_req and dep_req.get("status") != "completed":
                        yield self.sm.content_block(sid, "warning", {"message": f"Dependency '{dep_req.get('title', '?')}' is not completed yet"})
                except Exception:
                    pass

        agent_type = _agent_for_phase(phase_type)
        tasks_succeeded = 0
        tasks_failed = 0

        for i, task in enumerate(pending):
            task_title = task.get("title", "Untitled")
            payload_task_start = {"phase": phase_type, "task_id": task["id"], "task_title": task_title, "index": i, "total": len(pending), "requirement_id": requirement_id}
            yield self._trace_ev(sid, "task", "start", payload_task_start)
            await self.sm.broadcast(workspace_id, sid, "task", "start", payload_task_start)
            await self.ws_gw.publish_log(workspace_id, "pm", f"[{phase_type}] Executing task {i+1}/{len(pending)}: {task_title}", task_id=task["id"])

            claimed = await self.ws_client.claim_task(workspace_id, task["id"], agent=agent_type.value)
            if claimed is None:
                continue

            agent_cfg = await self._resolve_agent_config(workspace_id, agent_type.value)
            req_desc_kw = self._descriptor_kwargs(agent_cfg)
            agent_task = AgentTask(
                task_id=task["id"], workspace_id=workspace_id,
                intent=f"execute_{phase_type}", description=task_title,
                user_message=user_message or task.get("description", ""),
                context={
                    "task_title": task_title, "task_description": task.get("description", ""),
                    "phase_type": phase_type, "requirement_id": requirement_id,
                    "requirement_description": req.get("description", ""),
                    "related_artifacts": related_artifacts,
                },
                **req_desc_kw,
            )

            try:
                result = await self.dispatcher.dispatch(agent_type, agent_task)
                if isinstance(result, dict) and result.get("error"):
                    tasks_failed += 1
                    payload_err = {"phase": phase_type, "task_id": task["id"], "task_title": task_title, "error": str(result["error"]), "requirement_id": requirement_id}
                    yield self._trace_ev(sid, "task", "error", payload_err)
                    await self.sm.broadcast(workspace_id, sid, "task", "error", payload_err)
                else:
                    tasks_succeeded += 1
                    await self.ws_client.complete_task(workspace_id, task["id"])
                    payload_done = {"phase": phase_type, "task_id": task["id"], "task_title": task_title, "result_summary": str(result)[:200], "requirement_id": requirement_id}
                    yield self._trace_ev(sid, "task", "complete", payload_done)
                    await self.sm.broadcast(workspace_id, sid, "task", "complete", payload_done)
                    if result and isinstance(result, dict):
                        content = result.get("summary", str(result))
                        if len(content) > 100:
                            asyncio.create_task(_auto_index_to_rag(workspace_id, f"[{req_title}] {task_title}", content))
            except Exception as exc:
                tasks_failed += 1
                payload_err = {"phase": phase_type, "task_id": task["id"], "task_title": task_title, "error": str(exc)[:200], "requirement_id": requirement_id}
                yield self._trace_ev(sid, "task", "error", payload_err)
                await self.sm.broadcast(workspace_id, sid, "task", "error", payload_err)

        total = len(pending)
        progress = tasks_succeeded / total if total > 0 else 0
        req_status = "completed" if tasks_failed == 0 else "in_progress"
        try:
            await self.ws_client.update_requirement(workspace_id, requirement_id, status=req_status, progress=progress)
        except Exception:
            pass

        payload_phase_done = {"phase": phase_type, "tasks_executed": tasks_succeeded, "tasks_total": total, "tasks_failed": tasks_failed, "requirement_id": requirement_id}
        yield self._trace_ev(sid, "phase", "complete", payload_phase_done)
        await self.sm.broadcast(workspace_id, sid, "phase", "complete", payload_phase_done)

        if tasks_failed == 0:
            asyncio.create_task(_trigger_distill(workspace_id))
            asyncio.create_task(_store_org_memory(workspace_id, f"Requirement '{req_title}' phase '{phase_type}' completed with {tasks_succeeded} tasks."))

        status_str = "success" if tasks_failed == 0 else "failed"
        yield self.sm.session_complete(sid, status_str)
        await self.sm.finish(
            sid,
            workspace_id,
            status_str,
            f"{tasks_failed} task(s) failed" if tasks_failed else None,
            steps=self._dump_trace(sid),
        )

    # ------------------------------------------------------------------
    # resolve_phase_contract
    # ------------------------------------------------------------------

    async def resolve_phase_contract(
        self, workspace_id: str, phase_type: str,
    ) -> PhaseContract:
        """Merge static PHASE_CONTRACTS with runtime agent config from DB."""
        static = PHASE_CONTRACTS.get(phase_type)
        if not static:
            return PhaseContract(phase_type=phase_type, agent_type=phase_type)
        contract = static.model_copy()

        agent_type = _agent_for_phase(phase_type)
        agent_cfg = await self._resolve_agent_config(workspace_id, agent_type.value)
        if agent_cfg:
            contract.enabled = agent_cfg.get("enabled", True)
            contract.require_approval = agent_cfg.get("requireApproval", False)
            contract.quality_gate = agent_cfg.get("qualityGate")
            contract.trust_threshold = float(agent_cfg.get("trustThreshold", 50.0))
            contract.preferred_model = agent_cfg.get("preferredModel")
            if agent_cfg.get("graphId"):
                contract.graph_id = agent_cfg["graphId"]

        return contract

    # ------------------------------------------------------------------
    # run_requirement_pipeline  (phase-level stop-and-go)
    # ------------------------------------------------------------------

    async def run_requirement_pipeline(
        self,
        workspace_id: str,
        requirement_id: str,
        user_message: str = "",
        *,
        start_phase: str | None = None,
        approved_phase: str | None = None,
    ) -> AsyncIterator[str]:
        """Run a requirement through SDLC phases with stop-and-go approval.

        Cascades automatically until hitting a phase whose agent has
        ``requireApproval = true``, then stops and emits
        ``phase:awaiting_approval``.  Resume by calling again with
        ``approved_phase`` set to the approved phase.
        """
        lock = self._get_lock(workspace_id)
        if lock.locked():
            current = self._active_runs.get(workspace_id, "unknown")
            yield self._trace_ev("skip-pipeline", "phase", "skip", {
                "reason": f"Workspace busy ({current})",
            })
            return

        async with lock:
            self._active_runs[workspace_id] = f"pipeline:{requirement_id}"
            try:
                async for evt in self._run_requirement_pipeline_inner(
                    workspace_id, requirement_id, user_message,
                    start_phase=start_phase,
                    approved_phase=approved_phase,
                ):
                    yield evt
            finally:
                self._active_runs.pop(workspace_id, None)
                try:
                    await self.ws_gw.publish_agent_status(
                        workspace_id, "pm", AgentStatus.IDLE,
                    )
                except Exception:
                    pass

    async def _run_requirement_pipeline_inner(
        self,
        workspace_id: str,
        requirement_id: str,
        user_message: str,
        *,
        start_phase: str | None = None,
        approved_phase: str | None = None,
    ) -> AsyncIterator[str]:
        req = await self.ws_client.get_requirement(workspace_id, requirement_id)
        if not req:
            yield self._trace_ev("err-pipe", "task", "error", {
                "error": "requirement not found",
            })
            return

        req_title = req.get("title", "Untitled")
        current_phase = start_phase or req.get("currentPhase", "requirement")

        sid = await self.sm.create(
            "workflow_requirement_pipeline", workspace_id,
            user_message=user_message,
            intent_type="execute_requirement_pipeline",
            intent_summary=f"{req_title} — pipeline from {current_phase}",
            agent_type="pm", triggered_by="workflow",
            requirement_id=requirement_id,
        )
        yield self.sm.session_start(sid, "workflow_requirement_pipeline", workspace_id)
        await self.ws_gw.publish_agent_status(
            workspace_id, "pm", AgentStatus.RUNNING,
            detail=f"Pipeline: {req_title}",
        )

        start_idx = 0
        if current_phase in DEFAULT_PHASE_ORDER:
            start_idx = DEFAULT_PHASE_ORDER.index(current_phase)

        phases_completed: list[str] = []
        for phase_type in DEFAULT_PHASE_ORDER[start_idx:]:
            contract = await self.resolve_phase_contract(workspace_id, phase_type)

            if not contract.enabled:
                skip_payload = {
                    "phase": phase_type, "reason": "disabled",
                    "requirement_id": requirement_id,
                }
                yield self._trace_ev(sid, "phase", "skip", skip_payload)
                await self.sm.broadcast(
                    workspace_id, sid, "phase", "skip", skip_payload,
                )
                continue

            # Phase-level approval gate: stop if approval required and
            # this phase was not explicitly approved by the caller.
            if contract.require_approval and phase_type != approved_phase:
                await_payload = {
                    "phase": phase_type,
                    "requirement_id": requirement_id,
                    "requirement_title": req_title,
                    "approval_key": f"phase:{workspace_id}:{requirement_id}:{phase_type}",
                }
                yield self._trace_ev(
                    sid, "phase", "awaiting_approval", await_payload,
                )
                await self.sm.broadcast(
                    workspace_id, sid, "phase", "awaiting_approval",
                    await_payload,
                )
                try:
                    await self.ws_client.update_requirement(
                        workspace_id, requirement_id,
                        current_phase=phase_type,
                        status="awaiting_approval",
                    )
                except Exception:
                    pass

                await self.ws_gw.publish_log(
                    workspace_id, "pm",
                    f"Pipeline paused: phase '{phase_type}' requires approval",
                    level="warn",
                )
                yield self.sm.session_complete(sid, "paused")
                await self.sm.finish(
                    sid, workspace_id, "paused",
                    f"Awaiting approval for phase: {phase_type}",
                    steps=self._dump_trace(sid),
                )
                return  # STOP — user must re-trigger with approved_phase

            # Execute the phase for this requirement
            phase_ok = True
            async for evt in self._run_requirement_inner(
                workspace_id, requirement_id, user_message, phase_type,
            ):
                yield evt
                if "task:error" in evt:
                    phase_ok = False

            if not phase_ok:
                yield self.sm.session_complete(sid, "failed")
                await self.sm.finish(
                    sid, workspace_id, "failed",
                    steps=self._dump_trace(sid),
                )
                return

            phases_completed.append(phase_type)

            # Post-phase quality gate
            agent_cfg = await self._resolve_agent_config(
                workspace_id, _agent_for_phase(phase_type).value,
            )
            gate_passed = await self._check_quality_gate(
                workspace_id, phase_type, sid, agent_cfg=agent_cfg,
            )
            if not gate_passed:
                yield self._trace_ev(sid, "phase", "error", {
                    "phase": phase_type,
                    "error": "quality gate failed",
                    "requirement_id": requirement_id,
                })
                yield self.sm.session_complete(sid, "failed")
                await self.sm.finish(
                    sid, workspace_id, "failed",
                    f"Quality gate failed for {phase_type}",
                    steps=self._dump_trace(sid),
                )
                return

            # Look ahead: should we auto-continue or stop?
            next_idx = DEFAULT_PHASE_ORDER.index(phase_type) + 1
            while next_idx < len(DEFAULT_PHASE_ORDER):
                next_contract = await self.resolve_phase_contract(
                    workspace_id, DEFAULT_PHASE_ORDER[next_idx],
                )
                if not next_contract.enabled:
                    next_idx += 1
                    continue
                if next_contract.require_approval:
                    next_phase = DEFAULT_PHASE_ORDER[next_idx]
                    try:
                        await self.ws_client.update_requirement(
                            workspace_id, requirement_id,
                            current_phase=next_phase,
                            status="awaiting_approval",
                        )
                    except Exception:
                        pass
                    await_payload = {
                        "phase": next_phase,
                        "requirement_id": requirement_id,
                        "requirement_title": req_title,
                        "approval_key": f"phase:{workspace_id}:{requirement_id}:{next_phase}",
                    }
                    yield self._trace_ev(
                        sid, "phase", "awaiting_approval", await_payload,
                    )
                    await self.sm.broadcast(
                        workspace_id, sid, "phase", "awaiting_approval",
                        await_payload,
                    )
                    await self.ws_gw.publish_log(
                        workspace_id, "pm",
                        f"Pipeline paused before '{next_phase}' (requires approval). "
                        f"Completed: {', '.join(phases_completed)}",
                        level="warn",
                    )
                    yield self.sm.session_complete(sid, "paused")
                    await self.sm.finish(
                        sid, workspace_id, "paused",
                        f"Awaiting approval for phase: {next_phase}",
                        steps=self._dump_trace(sid),
                    )
                    return  # STOP
                break  # next phase auto-continues
            else:
                break  # no more phases in the order

        # All reachable phases completed
        try:
            await self.ws_client.update_requirement(
                workspace_id, requirement_id, status="completed",
            )
        except Exception:
            pass

        yield self._trace_ev(sid, "project", "complete", {
            "requirement_id": requirement_id,
            "phases_completed": phases_completed,
        })
        await self.sm.broadcast(workspace_id, sid, "project", "complete", {
            "requirement_id": requirement_id,
            "phases_completed": phases_completed,
        })

        yield self.sm.session_complete(sid)
        await self.sm.finish(
            sid, workspace_id, steps=self._dump_trace(sid),
        )
