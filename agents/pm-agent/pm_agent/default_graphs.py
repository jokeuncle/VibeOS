"""Default graph definitions for each SDLC phase.

Each phase has a minimal, role-specific micro-flow graph that replaces the
trivial linear auto-graph. These are used when no user-defined graph is
configured for a phase.
"""

from __future__ import annotations

_COMMON_STATE = {
    "messages": {"type": "list", "reducer": "append"},
}

_COMMON_CONFIG = {"checkpointer": "memory", "recursion_limit": 25}


def _cap_node(node_id: str, cap_ref: str, title: str, timeout: int = 300, retries: int = 2) -> dict:
    return {
        "id": node_id,
        "type": "capability",
        "capability_ref": cap_ref,
        "config": {"task_title": title, "timeout": timeout, "retries": retries},
    }


def _linear_edges(*node_ids: str) -> list[dict[str, str]]:
    edges: list[dict[str, str]] = []
    if not node_ids:
        return edges
    edges.append({"source": "__start__", "target": node_ids[0]})
    for i in range(len(node_ids) - 1):
        edges.append({"source": node_ids[i], "target": node_ids[i + 1]})
    edges.append({"source": node_ids[-1], "target": "__end__"})
    return edges


DEFAULT_PHASE_GRAPHS: dict[str, dict] = {
    "requirement": {
        "nodes": [
            _cap_node("clarify", "requirement.analyze", "Requirement Clarification"),
            _cap_node("stories", "requirement.analyze", "User Story Decomposition"),
            _cap_node("prd", "requirement.analyze", "PRD Document Generation"),
        ],
        "edges": _linear_edges("clarify", "stories", "prd"),
        "state_schema": _COMMON_STATE,
        "config": _COMMON_CONFIG,
    },
    "architecture": {
        "nodes": [
            _cap_node("architecture_design", "architecture.design", "Technical Architecture Design"),
        ],
        "edges": _linear_edges("architecture_design"),
        "state_schema": _COMMON_STATE,
        "config": _COMMON_CONFIG,
    },
    "design": {
        "nodes": [
            _cap_node("ui_design", "design.ui", "UI Design & Wireframes"),
        ],
        "edges": _linear_edges("ui_design"),
        "state_schema": _COMMON_STATE,
        "config": _COMMON_CONFIG,
    },
    "development": {
        "nodes": [
            _cap_node("code_implementation", "coding.execute", "Code Implementation (OpenHands)", timeout=900, retries=1),
        ],
        "edges": _linear_edges("code_implementation"),
        "state_schema": _COMMON_STATE,
        "config": _COMMON_CONFIG,
    },
    "testing": {
        "nodes": [
            _cap_node("test_implementation", "testing.run", "Test Implementation & Execution", timeout=600),
        ],
        "edges": _linear_edges("test_implementation"),
        "state_schema": _COMMON_STATE,
        "config": _COMMON_CONFIG,
    },
}
