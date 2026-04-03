"""Single source of truth for SDLC phase constants and graph definitions.

All phase-related topology -- dependency graphs, agent mappings, contracts,
tool hints, ordering, and the default project-level DCG -- lives here.
Every consumer (BaseAgent, SDLCAgent, ContextEnricherMiddleware, WorkflowEngine)
imports from this module.
"""

from __future__ import annotations

from typing import Any

from .models import PhaseContract

# ---------------------------------------------------------------------------
# Phase dependency graph
# ---------------------------------------------------------------------------

PHASE_CONTEXT: dict[str, list[str]] = {
    "requirement": [],
    "architecture": ["requirement"],
    "design": ["requirement", "architecture"],
    "development": ["requirement", "architecture", "design"],
    "testing": ["development", "design"],
    "deployment": ["development", "testing"],
    "monitoring": ["deployment"],
}

# ---------------------------------------------------------------------------
# Agent type -> SDLC phase mapping (bidirectional helpers below)
# ---------------------------------------------------------------------------

AGENT_PHASE_MAP: dict[str, str] = {
    "requirement": "requirement",
    "architecture": "architecture",
    "design": "design",
    "development": "development",
    "testing": "testing",
    "cicd": "deployment",
    "monitoring": "monitoring",
}

# ---------------------------------------------------------------------------
# Canonical phase ordering (fallback when no project graph exists)
# ---------------------------------------------------------------------------

DEFAULT_PHASE_ORDER: list[str] = [
    "requirement",
    "architecture",
    "design",
    "development",
    "testing",
    "deployment",
    "monitoring",
]

# ---------------------------------------------------------------------------
# Static phase contracts
# ---------------------------------------------------------------------------

PHASE_CONTRACTS: dict[str, PhaseContract] = {
    "requirement": PhaseContract(
        phase_type="requirement",
        agent_type="requirement",
        upstream_phases=[],
        required_artifact_types=[],
        default_graph_key="requirement",
        expected_artifact_types=["prd", "user_stories", "acceptance_criteria"],
    ),
    "architecture": PhaseContract(
        phase_type="architecture",
        agent_type="architecture",
        upstream_phases=["requirement"],
        required_artifact_types=["prd", "user_stories"],
        default_graph_key="architecture",
        expected_artifact_types=["architecture_doc", "adr", "tech_stack"],
    ),
    "design": PhaseContract(
        phase_type="design",
        agent_type="design",
        upstream_phases=["requirement", "architecture"],
        required_artifact_types=["prd", "architecture_doc"],
        default_graph_key="design",
        expected_artifact_types=["wireframe", "ui_spec", "component_spec"],
    ),
    "development": PhaseContract(
        phase_type="development",
        agent_type="development",
        upstream_phases=["requirement", "architecture", "design"],
        required_artifact_types=["architecture_doc", "ui_spec"],
        default_graph_key="development",
        expected_artifact_types=["source_code", "api_impl"],
    ),
    "testing": PhaseContract(
        phase_type="testing",
        agent_type="testing",
        upstream_phases=["development", "design"],
        required_artifact_types=["source_code"],
        default_graph_key="testing",
        expected_artifact_types=["test_suite", "test_report"],
    ),
    "deployment": PhaseContract(
        phase_type="deployment",
        agent_type="cicd",
        upstream_phases=["development", "testing"],
        required_artifact_types=["source_code", "test_report"],
        default_graph_key="deployment",
        expected_artifact_types=["pipeline_config", "deploy_manifest"],
    ),
    "monitoring": PhaseContract(
        phase_type="monitoring",
        agent_type="monitoring",
        upstream_phases=["deployment"],
        required_artifact_types=["deploy_manifest"],
        default_graph_key="monitoring",
        expected_artifact_types=["alert_rules", "dashboard_config"],
    ),
}

# ---------------------------------------------------------------------------
# Recommended tools per phase (injected into SDLCAgent prompts)
# ---------------------------------------------------------------------------

PHASE_TOOL_HINTS: dict[str, list[str]] = {
    "requirement": [
        "workspace_create_artifact", "workspace_query_artifacts",
        "workspace_create_task", "workspace_query_phases",
    ],
    "architecture": [
        "workspace_create_artifact", "workspace_query_artifacts",
        "workspace_create_task", "workspace_query_phases",
    ],
    "design": [
        "workspace_create_artifact", "workspace_query_artifacts",
        "workspace_create_task", "workspace_query_phases",
    ],
    "development": [
        "workspace_create_artifact", "gitlab_push_file", "gitlab_create_mr",
        "workspace_query_artifacts", "workspace_create_task",
    ],
    "testing": [
        "workspace_create_artifact", "gitlab_push_file",
        "workspace_query_artifacts", "workspace_create_task",
    ],
    "deployment": [
        "workspace_create_artifact", "gitlab_push_file", "gitlab_create_mr",
        "workspace_query_artifacts",
    ],
    "monitoring": [
        "workspace_create_artifact", "workspace_query_artifacts",
    ],
}

# ---------------------------------------------------------------------------
# Default project-level DCG (Directed Cyclic Graph)
# ---------------------------------------------------------------------------


def _phase_node(phase: str, agent: str) -> dict[str, Any]:
    return {
        "id": phase,
        "type": "phase",
        "config": {
            "agent": agent,
            "phase_type": phase,
            "max_cycles": 3,
        },
    }


DEFAULT_PROJECT_GRAPH: dict[str, Any] = {
    "nodes": [
        _phase_node("requirement", "requirement"),
        _phase_node("architecture", "architecture"),
        _phase_node("design", "design"),
        _phase_node("development", "development"),
        _phase_node("testing", "testing"),
        _phase_node("deployment", "cicd"),
        _phase_node("monitoring", "monitoring"),
    ],
    "edges": [
        {"source": "__start__", "target": "requirement"},
        {"source": "requirement", "target": "architecture"},
        {"source": "architecture", "target": "design"},
        {"source": "design", "target": "development"},
        {"source": "development", "target": "testing"},
        {"source": "testing", "target": "deployment"},
        {"source": "deployment", "target": "monitoring"},
        {"source": "monitoring", "target": "__end__"},
        # Rework back-edges (conditioned, guarded by max_cycles)
        {"source": "design", "target": "requirement", "condition": "rework_needed"},
        {"source": "testing", "target": "development", "condition": "bugs_found"},
        {"source": "development", "target": "design", "condition": "design_gap"},
    ],
    "state_schema": {
        "messages": {"type": "list", "reducer": "append"},
    },
    "config": {"recursion_limit": 50},
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PHASE_TO_AGENT = {v: k for k, v in AGENT_PHASE_MAP.items()}


def phase_for_agent(agent_key: str) -> str:
    """Return the SDLC phase key for a given agent type key."""
    return AGENT_PHASE_MAP.get(agent_key, agent_key)


def agent_for_phase(phase_key: str) -> str:
    """Return the agent type key responsible for a given phase."""
    return _PHASE_TO_AGENT.get(phase_key, phase_key)


def upstream_phases(agent_key: str) -> list[str]:
    """Return upstream phases whose artifacts should be injected as context."""
    phase = phase_for_agent(agent_key)
    return PHASE_CONTEXT.get(phase, [])
