"""GraphExecutor: compiles a graph_def dict into a real LangGraph StateGraph.

Resolves capability nodes from the registry at compile time, builds a dynamic
typed-state with reducer annotations, and streams execution events compatible
with the AgentEvent SSE protocol.

Requires the ``langgraph`` optional dependency::

    pip install vibeos-agent[graph]
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Annotated, AsyncIterator

from .registry import RegistryClient

logger = logging.getLogger(__name__)

try:
    from langgraph.graph import StateGraph, END as LG_END
    from langgraph.graph.message import add_messages

    HAS_LANGGRAPH = True
except ImportError:
    HAS_LANGGRAPH = False


# ---------------------------------------------------------------------------
# Graph definition dataclasses (parsed from graph_def JSON)
# ---------------------------------------------------------------------------

@dataclass
class GraphNodeDef:
    id: str
    type: str  # capability | llm_call | human_in_loop | condition | subgraph
    capability_ref: str = ""
    config: dict[str, Any] = field(default_factory=dict)
    position: dict[str, float] = field(default_factory=dict)


@dataclass
class GraphEdgeDef:
    source: str
    target: str
    condition: str = ""


@dataclass
class StateFieldDef:
    type: str = "any"
    default: Any = None
    reducer: str = ""


@dataclass
class ParsedGraphDef:
    nodes: list[GraphNodeDef]
    edges: list[GraphEdgeDef]
    state_schema: dict[str, StateFieldDef]
    config: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> ParsedGraphDef:
        nodes = [
            GraphNodeDef(
                id=n["id"],
                type=n.get("type", "capability"),
                capability_ref=n.get("capability_ref", n.get("capabilityRef", "")),
                config=n.get("config", {}),
                position=n.get("position", {}),
            )
            for n in raw.get("nodes", [])
        ]
        edges = [
            GraphEdgeDef(
                source=e.get("source", ""),
                target=e.get("target", ""),
                condition=e.get("condition", ""),
            )
            for e in raw.get("edges", [])
        ]
        state_fields: dict[str, StateFieldDef] = {}
        for name, spec in raw.get("state_schema", raw.get("stateSchema", {})).items():
            if isinstance(spec, dict):
                state_fields[name] = StateFieldDef(
                    type=spec.get("type", "any"),
                    default=spec.get("default"),
                    reducer=spec.get("reducer", ""),
                )
            else:
                state_fields[name] = StateFieldDef(type="any", default=spec)
        return cls(
            nodes=nodes,
            edges=edges,
            state_schema=state_fields,
            config=raw.get("config", {}),
        )


# ---------------------------------------------------------------------------
# Reducer helpers
# ---------------------------------------------------------------------------

REDUCERS: dict[str, Any] = {}

if HAS_LANGGRAPH:
    def _append_reducer(existing: list, new: list | Any) -> list:
        if isinstance(new, list):
            return existing + new
        return [*existing, new]

    def _replace_reducer(_existing: Any, new: Any) -> Any:
        return new

    REDUCERS = {
        "append": _append_reducer,
        "add_messages": add_messages,
        "replace": _replace_reducer,
    }


# ---------------------------------------------------------------------------
# GraphExecutor
# ---------------------------------------------------------------------------

class GraphExecutor:
    """Compiles graph_def → LangGraph StateGraph, resolves capabilities, executes."""

    def __init__(self, registry: RegistryClient) -> None:
        if not HAS_LANGGRAPH:
            raise ImportError(
                "langgraph is required for GraphExecutor. "
                "Install with: pip install vibeos-agent[graph]"
            )
        self._registry = registry
        self._capability_cache: dict[str, dict[str, Any]] = {}

    async def _resolve_capability(self, ref: str) -> dict[str, Any] | None:
        if ref in self._capability_cache:
            return self._capability_cache[ref]
        caps = await self._registry.list_capabilities()
        for c in caps:
            key = c.get("name", "")
            self._capability_cache[key] = c
        return self._capability_cache.get(ref)

    def _build_state_type(self, schema: dict[str, StateFieldDef]) -> type:
        """Build a TypedDict-like class with Annotated reducer fields."""
        annotations: dict[str, Any] = {}
        defaults: dict[str, Any] = {}

        for name, sfd in schema.items():
            base_type = _resolve_type(sfd.type)
            if sfd.reducer and sfd.reducer in REDUCERS:
                annotations[name] = Annotated[base_type, REDUCERS[sfd.reducer]]
            else:
                annotations[name] = base_type
            if sfd.default is not None:
                defaults[name] = sfd.default
            elif sfd.type == "list":
                defaults[name] = []
            elif sfd.type == "dict":
                defaults[name] = {}
            elif sfd.type == "string":
                defaults[name] = ""
            elif sfd.type in ("int", "float", "number"):
                defaults[name] = 0

        ns: dict[str, Any] = {"__annotations__": annotations}
        ns.update(defaults)
        return type("GraphState", (), ns)

    def _make_node_fn(self, node_def: GraphNodeDef):
        """Create an async function that becomes a LangGraph node."""
        cap_ref = node_def.capability_ref
        node_config = node_def.config
        node_type = node_def.type

        async def _capability_node(state: dict[str, Any]) -> dict[str, Any]:
            cap = await self._resolve_capability(cap_ref)
            if not cap:
                logger.warning("Capability %s not found, returning empty", cap_ref)
                return {"_last_node": node_def.id, "_error": f"capability {cap_ref} not found"}

            endpoint = cap.get("endpoint", "")
            if endpoint:
                import httpx
                async with httpx.AsyncClient(timeout=node_config.get("timeout", 30)) as client:
                    resp = await client.post(endpoint, json={"state": state, "config": node_config})
                    resp.raise_for_status()
                    result = resp.json()
                    if isinstance(result, dict):
                        return result
            return {"_last_node": node_def.id}

        async def _llm_node(state: dict[str, Any]) -> dict[str, Any]:
            return {"_last_node": node_def.id, "_llm_placeholder": True}

        async def _human_node(state: dict[str, Any]) -> dict[str, Any]:
            return {"_last_node": node_def.id, "_awaiting_human": True}

        async def _passthrough_node(state: dict[str, Any]) -> dict[str, Any]:
            return {"_last_node": node_def.id}

        if node_type == "capability":
            return _capability_node
        elif node_type == "llm_call":
            return _llm_node
        elif node_type == "human_in_loop":
            return _human_node
        else:
            return _passthrough_node

    def _make_condition_router(self, node_def: GraphNodeDef, edges: list[GraphEdgeDef]):
        """Create a routing function for conditional edges from this node."""
        outgoing = [e for e in edges if e.source == node_def.id and e.condition]
        default_target = next(
            (e.target for e in edges if e.source == node_def.id and not e.condition),
            LG_END,
        )

        def _router(state: dict[str, Any]) -> str:
            for edge in outgoing:
                try:
                    if _eval_condition(edge.condition, state):
                        return edge.target
                except Exception:
                    logger.debug("Condition eval failed: %s", edge.condition)
            return default_target if default_target != LG_END else "__end__"

        return _router

    async def compile(self, graph_def: dict[str, Any]) -> Any:
        """Parse graph_def and compile to a LangGraph CompiledGraph."""
        parsed = ParsedGraphDef.from_dict(graph_def)
        state_type = self._build_state_type(parsed.state_schema)
        graph = StateGraph(state_type)

        for node_def in parsed.nodes:
            fn = self._make_node_fn(node_def)
            graph.add_node(node_def.id, fn)

        nodes_with_conditional = set()
        for edge in parsed.edges:
            if edge.condition:
                nodes_with_conditional.add(edge.source)

        for node_def in parsed.nodes:
            if node_def.id in nodes_with_conditional:
                router = self._make_condition_router(node_def, parsed.edges)
                targets = {}
                for e in parsed.edges:
                    if e.source == node_def.id:
                        targets[e.target] = e.target
                graph.add_conditional_edges(node_def.id, router, targets)
            else:
                direct_edges = [e for e in parsed.edges if e.source == node_def.id and not e.condition]
                for e in direct_edges:
                    src = node_def.id
                    tgt = e.target if e.target != "__end__" else LG_END
                    graph.add_edge(src, tgt)

        start_edges = [e for e in parsed.edges if e.source == "__start__"]
        if start_edges:
            graph.set_entry_point(start_edges[0].target)
        elif parsed.nodes:
            graph.set_entry_point(parsed.nodes[0].id)

        recursion_limit = parsed.config.get("recursion_limit", 25)
        compiled = graph.compile()
        compiled.recursion_limit = recursion_limit
        return compiled

    async def execute(
        self,
        graph_def: dict[str, Any],
        input_state: dict[str, Any] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Compile and execute a graph, yielding SSE-compatible event dicts."""
        compiled = await self.compile(graph_def)
        initial = input_state or {}

        yield {"event": "graph:start", "data": {"nodes": [n["id"] for n in graph_def.get("nodes", [])]}}

        try:
            async for event in compiled.astream(initial, stream_mode="updates"):
                for node_name, node_output in event.items():
                    yield {
                        "event": "graph:node_complete",
                        "data": {"node": node_name, "output": node_output},
                    }
        except Exception as exc:
            logger.error("Graph execution error: %s", exc)
            yield {"event": "graph:error", "data": {"error": str(exc)}}
            return

        yield {"event": "graph:complete", "data": {}}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_type(type_str: str) -> type:
    mapping: dict[str, type] = {
        "string": str,
        "str": str,
        "int": int,
        "float": float,
        "number": float,
        "bool": bool,
        "boolean": bool,
        "list": list,
        "dict": dict,
        "any": Any,
    }
    return mapping.get(type_str, Any)


def _eval_condition(expr: str, state: dict[str, Any]) -> bool:
    """Safely evaluate a simple condition expression against state.

    Supports patterns like ``state.field == value`` or ``field == value``.
    Complex expressions are logged and return False.
    """
    normalized = expr.replace("state.", "")

    if "==" in normalized:
        left, right = normalized.split("==", 1)
        left = left.strip()
        right = right.strip().strip("'\"")
        val = state.get(left)
        if right.lower() == "true":
            return bool(val)
        if right.lower() == "false":
            return not val
        return str(val) == right

    if "!=" in normalized:
        left, right = normalized.split("!=", 1)
        left = left.strip()
        right = right.strip().strip("'\"")
        return str(state.get(left)) != right

    val = state.get(normalized.strip())
    return bool(val)
