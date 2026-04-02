"""Default graph definitions for each SDLC phase.

Loads from the shared `deploy/default-graphs.json` so that Go and Python
use the same definitions. Falls back to a minimal inline dict if the JSON
file is unavailable.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

_logger = logging.getLogger(__name__)

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


_FALLBACK_GRAPHS: dict[str, dict] = {
    "requirement": {
        "nodes": [
            _cap_node("clarify", "requirement.analyze", "Requirement Clarification & Scope"),
            _cap_node("stakeholders", "requirement.analyze", "Stakeholder & User Role Analysis"),
            _cap_node("stories", "requirement.analyze", "User Story Decomposition"),
            _cap_node("acceptance", "requirement.analyze", "Acceptance Criteria Definition"),
            _cap_node("nfr", "requirement.analyze", "Non-functional Requirements & Constraints"),
            _cap_node("prd", "requirement.analyze", "PRD Document Generation"),
        ],
        "edges": _linear_edges("clarify", "stakeholders", "stories", "acceptance", "nfr", "prd"),
        "state_schema": _COMMON_STATE,
        "config": _COMMON_CONFIG,
    },
    "architecture": {
        "nodes": [
            _cap_node("tech_stack", "architecture.design", "Technology Stack Selection"),
            _cap_node("system_design", "architecture.design", "System Architecture Design"),
            _cap_node("data_model", "architecture.design", "Data Model & Storage Design"),
            _cap_node("api_design", "architecture.design", "API Contract Design"),
        ],
        "edges": _linear_edges("tech_stack", "system_design", "data_model", "api_design"),
        "state_schema": _COMMON_STATE,
        "config": _COMMON_CONFIG,
    },
    "design": {
        "nodes": [
            _cap_node("wireframe", "design.ui", "Wireframe & Layout Design"),
            _cap_node("component_spec", "design.ui", "Component Specification"),
            _cap_node("prototype", "design.ui", "Interactive Prototype"),
        ],
        "edges": _linear_edges("wireframe", "component_spec", "prototype"),
        "state_schema": _COMMON_STATE,
        "config": _COMMON_CONFIG,
    },
    "development": {
        "nodes": [
            _cap_node("code_implementation", "coding.execute", "Code Implementation", timeout=900, retries=1),
        ],
        "edges": _linear_edges("code_implementation"),
        "state_schema": _COMMON_STATE,
        "config": _COMMON_CONFIG,
    },
    "testing": {
        "nodes": [
            _cap_node("test_plan", "testing.run", "Test Plan & Strategy"),
            _cap_node("test_implementation", "testing.run", "Test Implementation", timeout=600),
            _cap_node("test_execution", "testing.run", "Test Execution & Reporting", timeout=600),
        ],
        "edges": _linear_edges("test_plan", "test_implementation", "test_execution"),
        "state_schema": _COMMON_STATE,
        "config": _COMMON_CONFIG,
    },
}


def _load_default_graphs() -> dict[str, dict]:
    """Try to load from the shared JSON file, fall back to inline dicts."""
    candidates: list[Path] = []
    try:
        candidates.append(Path(__file__).resolve().parents[3] / "deploy" / "default-graphs.json")
    except IndexError:
        pass
    candidates.append(Path("/app/deploy/default-graphs.json"))

    for path in candidates:
        if path.is_file():
            try:
                data = json.loads(path.read_text())
                if isinstance(data, dict) and data:
                    _logger.info("Loaded default graphs from %s", path)
                    return data
            except Exception:
                _logger.debug("Failed to parse %s, using fallback", path)
    return _FALLBACK_GRAPHS


DEFAULT_PHASE_GRAPHS: dict[str, dict] = _load_default_graphs()
