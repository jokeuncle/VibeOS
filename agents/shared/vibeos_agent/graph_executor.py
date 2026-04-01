"""GraphExecutor: compiles a graph_def dict into a real LangGraph StateGraph.

Resolves capability nodes from the registry at compile time, builds a dynamic
typed-state with reducer annotations, and streams execution events compatible
with the AgentEvent SSE protocol.

Requires the ``langgraph`` optional dependency::

    pip install vibeos-agent[graph]
"""

from __future__ import annotations

import logging
import uuid
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
    type: str  # capability | llm_call | human_in_loop | condition | subgraph | intent
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
    """Compiles graph_def -> LangGraph StateGraph, resolves capabilities, executes."""

    def __init__(
        self,
        registry: RegistryClient,
        llm: Any | None = None,
        tool_manager: Any | None = None,
    ) -> None:
        if not HAS_LANGGRAPH:
            raise ImportError(
                "langgraph is required for GraphExecutor. "
                "Install with: pip install vibeos-agent[graph]"
            )
        self._registry = registry
        self._llm = llm
        self._tool_manager = tool_manager
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

    # ------------------------------------------------------------------
    # Node function factories
    # ------------------------------------------------------------------

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

            # MCP tool routing: provider == "mcp" means use ToolManager
            if cap.get("provider") == "mcp" and self._tool_manager:
                tool_name = cap.get("name", cap_ref)
                try:
                    result = await self._tool_manager.execute(
                        tool_name,
                        {k: v for k, v in state.items() if not k.startswith("_")},
                    )
                    return {
                        "_last_node": node_def.id,
                        "_result": result.content if hasattr(result, "content") else str(result),
                    }
                except Exception as exc:
                    return {"_last_node": node_def.id, "_error": f"MCP tool {tool_name}: {exc}"}

            endpoint = cap.get("endpoint", "")
            if not endpoint:
                logger.warning("Capability %s has no endpoint", cap_ref)
                return {"_last_node": node_def.id, "_error": f"capability {cap_ref} has no endpoint"}

            task_payload = _build_agent_task(node_def, state, node_config)
            import httpx
            timeout = node_config.get("timeout", 300)
            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(endpoint, json=task_payload)
                    resp.raise_for_status()
                    result = resp.json()
            except Exception as exc:
                logger.error("Capability %s call failed: %s", cap_ref, exc)
                return {"_last_node": node_def.id, "_error": str(exc)}

            output: dict[str, Any] = {"_last_node": node_def.id}
            payload = result.get("payload", result)
            if isinstance(payload, dict):
                summary = payload.get("summary", "")
                if summary:
                    output["_summary"] = summary
                output["_result"] = payload
            return output

        async def _llm_node(state: dict[str, Any]) -> dict[str, Any]:
            if not self._llm:
                logger.warning("LLM client not available for llm_call node %s", node_def.id)
                return {"_last_node": node_def.id, "_error": "LLM client not available"}

            system_prompt = node_config.get("system_prompt", "You are a helpful assistant.")
            prompt_template = node_config.get("prompt", "")
            model = node_config.get("model")
            temperature = node_config.get("temperature", 0.7)

            user_msg = prompt_template or state.get("user_message", "")
            if not user_msg:
                user_msg = str(state.get("_summary", "Continue processing."))

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ]

            try:
                result = await self._llm.chat(
                    messages, model=model, temperature=temperature,
                )
                reply = result.get("choices", [{}])[0].get("message", {}).get("content", "")
                return {"_last_node": node_def.id, "llm_output": reply}
            except Exception as exc:
                logger.error("LLM call failed for node %s: %s", node_def.id, exc)
                return {"_last_node": node_def.id, "_error": str(exc)}

        async def _human_node(state: dict[str, Any]) -> dict[str, Any]:
            return {"_last_node": node_def.id, "_awaiting_human": True}

        async def _intent_node(state: dict[str, Any]) -> dict[str, Any]:
            intent_name = node_config.get("intent_name", cap_ref)
            if not intent_name:
                return {"_last_node": node_def.id, "_error": "No intent name specified"}

            template = await self._registry.resolve_template(intent_name)
            if not template:
                return {"_last_node": node_def.id, "_error": f"No template for intent: {intent_name}"}

            if template.handler_type == "graph" and template.graph_def:
                sub_results: dict[str, Any] = {}
                async for evt in self.execute(template.graph_def, state):
                    if evt.get("event") == "graph:node_complete":
                        output = evt.get("data", {}).get("output", {})
                        if isinstance(output, dict):
                            sub_results.update(output)
                return {**sub_results, "_last_node": node_def.id}

            if template.handler_type == "agent" and template.handler_ref:
                cap_name = f"{template.handler_ref}.{template.handler_ref}"
                for req_cap in template.required_capabilities:
                    if req_cap.startswith(f"{template.handler_ref}."):
                        cap_name = req_cap
                        break
                cap = await self._resolve_capability(cap_name)
                if cap and cap.get("endpoint"):
                    task_payload = _build_agent_task(node_def, state, node_config)
                    task_payload["intent"] = intent_name
                    import httpx
                    try:
                        async with httpx.AsyncClient(timeout=300) as client:
                            resp = await client.post(cap["endpoint"], json=task_payload)
                            resp.raise_for_status()
                            result = resp.json()
                        payload = result.get("payload", result)
                        return {"_last_node": node_def.id, "_result": payload}
                    except Exception as exc:
                        return {"_last_node": node_def.id, "_error": str(exc)}

            return {"_last_node": node_def.id, "_error": f"Cannot execute template: {template.handler_type}"}

        async def _subgraph_node(state: dict[str, Any]) -> dict[str, Any]:
            sub_graph_def = node_config.get("graph_def")
            graph_id = node_config.get("graph_id")
            workspace_id = state.get("workspace_id", "")

            if not sub_graph_def and graph_id and workspace_id:
                try:
                    import httpx
                    from .config import config as _cfg
                    ws_url = _cfg.workspace_svc_url
                    async with httpx.AsyncClient(timeout=15) as client:
                        resp = await client.get(f"{ws_url}/api/workspaces/{workspace_id}/graphs/{graph_id}")
                        if resp.status_code == 200:
                            data = resp.json().get("data", {})
                            sub_graph_def = data.get("graphDef", {})
                except Exception as exc:
                    logger.warning("Failed to load subgraph %s: %s", graph_id, exc)

            if not sub_graph_def or not sub_graph_def.get("nodes"):
                return {"_last_node": node_def.id, "_error": "No sub-graph definition found"}

            sub_results: dict[str, Any] = {}
            async for evt in self.execute(sub_graph_def, state):
                if evt.get("event") == "graph:node_complete":
                    output = evt.get("data", {}).get("output", {})
                    if isinstance(output, dict):
                        sub_results.update(output)
            return {**sub_results, "_last_node": node_def.id}

        async def _passthrough_node(state: dict[str, Any]) -> dict[str, Any]:
            return {"_last_node": node_def.id}

        dispatch: dict[str, Any] = {
            "capability": _capability_node,
            "llm_call": _llm_node,
            "human_in_loop": _human_node,
            "intent": _intent_node,
            "subgraph": _subgraph_node,
        }
        return dispatch.get(node_type, _passthrough_node)

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

    # ------------------------------------------------------------------
    # Compile & Execute
    # ------------------------------------------------------------------

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

def _build_agent_task(
    node_def: GraphNodeDef,
    state: dict[str, Any],
    node_config: dict[str, Any],
) -> dict[str, Any]:
    """Build an AgentTask-compatible JSON payload from graph node + state."""
    workspace_id = state.get("workspace_id", "")
    task_title = node_config.get("task_title", node_def.id)
    task_desc = node_config.get("task_description", "")
    user_msg = state.get("user_message", task_desc)

    return {
        "task_id": f"graph-{node_def.id}-{uuid.uuid4().hex[:8]}",
        "workspace_id": workspace_id,
        "intent": f"execute_{node_def.capability_ref}" if node_def.capability_ref else node_def.id,
        "description": task_title,
        "user_message": user_msg,
        "context": {
            "source": "graph_executor",
            "node_id": node_def.id,
            "node_type": node_def.type,
            "task_title": task_title,
            "task_description": task_desc,
            **{k: v for k, v in state.items() if not k.startswith("_") and k != "workspace_id"},
        },
        "preferred_model": node_config.get("model"),
    }


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
