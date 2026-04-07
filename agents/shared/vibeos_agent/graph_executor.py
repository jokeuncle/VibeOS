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
from typing import Any, Annotated, AsyncIterator, ClassVar, cast

from .conversation_payload import build_graph_node_execute_payload
from .registry import RegistryClient

logger = logging.getLogger(__name__)

try:
    from langgraph.graph import StateGraph, END as LG_END
    from langgraph.graph.message import add_messages
    from langgraph.checkpoint.memory import MemorySaver

    HAS_LANGGRAPH = True

    def _append_reducer(existing: list[Any], new: list[Any] | Any) -> list[Any]:
        if isinstance(new, list):
            return existing + new
        return [*existing, new]

    def _replace_reducer(_existing: Any, new: Any) -> Any:
        return new

    REDUCERS: dict[str, Any] = {
        "append": _append_reducer,
        "add_messages": add_messages,
        "replace": _replace_reducer,
    }
except ImportError:
    HAS_LANGGRAPH = False
    REDUCERS = {}
    # Placeholders — GraphExecutor.__init__ raises without langgraph; names must exist for analysis.
    StateGraph = None  # type: ignore[assignment, misc]
    LG_END = "__lg_end__"
    MemorySaver = None  # type: ignore[assignment, misc]


def _ensure_langgraph_loaded() -> None:
    """Raise if optional langgraph deps are missing (also narrows types for pyright)."""
    if not HAS_LANGGRAPH or StateGraph is None or MemorySaver is None:
        raise ImportError(
            "langgraph is required for GraphExecutor. "
            "Install with: pip install vibeos-agent[graph]"
        )


# ---------------------------------------------------------------------------
# Graph definition dataclasses (parsed from graph_def JSON)
# ---------------------------------------------------------------------------

@dataclass
class GraphNodeDef:
    id: str
    type: str  # capability | llm_call | human_in_loop | condition | subgraph | intent | agentic
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
# GraphExecutor
# ---------------------------------------------------------------------------

class GraphExecutor:
    """Compiles graph_def -> LangGraph StateGraph, resolves capabilities, executes."""

    def __init__(
        self,
        registry: RegistryClient,
        llm: Any | None = None,
        tool_manager: Any | None = None,
        endpoint_overrides: dict[str, str] | None = None,
    ) -> None:
        if not HAS_LANGGRAPH:
            raise ImportError(
                "langgraph is required for GraphExecutor. "
                "Install with: pip install vibeos-agent[graph]"
            )
        self._registry = registry
        self._llm = llm
        self._tool_manager = tool_manager
        self._endpoint_overrides = endpoint_overrides or {}
        self._capability_cache: dict[str, dict[str, Any]] = {}
        self._checkpointers: dict[str, Any] = {}  # thread_id -> checkpointer

    async def _resolve_capability(self, ref: str) -> dict[str, Any] | None:
        if ref in self._capability_cache:
            return self._capability_cache[ref]
        caps = await self._registry.list_capabilities()
        for c in caps:
            key = c.get("name", "")
            self._capability_cache[key] = c
        return self._capability_cache.get(ref)

    # tuple[Any, Any]: (annotation type, default). Wider than tuple[type, Any] so
    # literal defaults ("" / False / []) match under invariant tuple typing.
    _INTERNAL_FIELDS: ClassVar[dict[str, tuple[Any, Any]]] = {
        "_last_node": (str, ""),
        "_error": (str, ""),
        "_result": (Any, None),
        "_summary": (str, ""),
        "_skill_prompt": (str, ""),
        "_awaiting_human": (bool, False),
        "_phase_artifacts": (list, []),
        "_passthrough": (dict, {}),
        "_node_visits": (dict, {}),
        "llm_output": (str, ""),
        "upstream_artifacts": (list, []),
        "workspace_id": (str, ""),
        "phase_type": (str, ""),
        "user_message": (str, ""),
        "preferred_model": (str, ""),
        "agent_type": (str, ""),
    }

    # ------------------------------------------------------------------
    # Unified agent call helper (replaces raw HTTP POST to /api/execute)
    # ------------------------------------------------------------------

    async def _call_agent_stream(
        self,
        endpoint_base: str,
        req_payload: dict[str, Any],
        *,
        timeout: int = 300,
    ) -> dict[str, Any]:
        """Send a ConversationRequest to ``/api/conversation/stream`` and
        aggregate the SSE stream into a result dict.

        Returns ``{"summary": ..., "result": ..., "artifacts": [...], "error": ...}``.
        """
        from .agent_call import collect_agent_result

        return await collect_agent_result(
            endpoint_base, req_payload, timeout=timeout,
        )

    def _build_state_type(self, schema: dict[str, StateFieldDef]) -> type:
        """Build a TypedDict-like class with Annotated reducer fields."""
        annotations: dict[str, Any] = {}
        defaults: dict[str, Any] = {}

        for name, (ftype, fdefault) in self._INTERNAL_FIELDS.items():
            annotations[name] = ftype
            defaults[name] = fdefault

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
        """Create an async function that becomes a LangGraph node.

        Includes cycle control: if ``max_cycles`` is set in the node config
        and this node has already been visited that many times, the node
        short-circuits with a ``_error: max_cycles_exceeded`` result.
        """
        cap_ref = node_def.capability_ref
        node_config = node_def.config
        node_type = node_def.type

        max_retries = node_config.get("retries", 1)
        max_cycles = node_config.get("max_cycles", 0)

        def _check_cycle(state: dict[str, Any]) -> dict[str, Any] | None:
            """Return an error dict if this node has exceeded max_cycles."""
            if max_cycles <= 0:
                return None
            visits: dict[str, int] = dict(state.get("_node_visits", {}))
            count = visits.get(node_def.id, 0)
            if count >= max_cycles:
                logger.warning(
                    "Node %s exceeded max_cycles=%d (visited %d times)",
                    node_def.id, max_cycles, count,
                )
                return {
                    "_last_node": node_def.id,
                    "_error": f"max_cycles ({max_cycles}) exceeded for {node_def.id}",
                }
            return None

        def _track_visit(state: dict[str, Any], output: dict[str, Any]) -> dict[str, Any]:
            """Increment the visit counter for this node in the output."""
            visits = dict(state.get("_node_visits", {}))
            visits[node_def.id] = visits.get(node_def.id, 0) + 1
            output["_node_visits"] = visits
            return output

        async def _capability_node(state: dict[str, Any]) -> dict[str, Any]:
            logger.info(">>> capability_node START: %s (cap_ref=%s)", node_def.id, cap_ref)
            cap = await self._resolve_capability(cap_ref)
            if not cap:
                logger.warning("Capability %s not found, returning empty", cap_ref)
                return {"_last_node": node_def.id, "_error": f"capability {cap_ref} not found"}

            provider = cap.get("provider", "")
            source_type = cap.get("sourceType", "")
            is_mcp = provider == "mcp" or provider.startswith("mcp:") or source_type == "mcp"
            is_skill = source_type == "skill"

            if is_mcp and self._tool_manager:
                full_name = cap.get("name", cap_ref)
                parts = full_name.split(".")
                tool_name = parts[-1] if len(parts) > 1 else full_name
                try:
                    expected = set(cap.get("inputSchema", {}).get("properties", {}).keys())
                    args = {k: v for k, v in state.items() if k in expected} if expected else {}
                    result = await self._tool_manager.execute(tool_name, args)
                    return {
                        "_last_node": node_def.id,
                        "_result": result.output if hasattr(result, "output") else str(result),
                    }
                except Exception as exc:
                    return {"_last_node": node_def.id, "_error": f"MCP tool {tool_name}: {exc}"}

            if is_skill:
                return await _execute_skill(node_def, cap, state, self._tool_manager)

            endpoint = cap.get("endpoint", "")
            if self._endpoint_overrides:
                agent_key = cap.get("provider", "").split(".")[0] if cap.get("provider") else ""
                override_base = self._endpoint_overrides.get(agent_key, "")
                if override_base:
                    endpoint = override_base
            if endpoint and "/api/" in endpoint:
                endpoint = endpoint.rsplit("/api/", 1)[0]
            logger.info(">>> capability_node %s: endpoint=%s provider=%s", node_def.id, endpoint, provider)
            if not endpoint:
                logger.warning("Capability %s has no endpoint", cap_ref)
                return {"_last_node": node_def.id, "_error": f"capability {cap_ref} has no endpoint"}

            conv_payload = _build_conversation_request(node_def, state, node_config)

            upstream_arts = state.get("upstream_artifacts")
            if upstream_arts and isinstance(upstream_arts, list):
                conv_payload.setdefault("context", {})["phase_artifacts"] = upstream_arts

            phase_arts = state.get("_phase_artifacts", [])
            if phase_arts:
                conv_payload.setdefault("context", {})["prior_node_artifacts"] = phase_arts

            import asyncio as _asyncio
            timeout = node_config.get("timeout", 300)
            result = None
            last_err = ""
            for attempt in range(max_retries):
                try:
                    logger.info(">>> capability_node %s: calling %s (attempt=%d/%d)", node_def.id, endpoint, attempt + 1, max_retries)
                    result = await self._call_agent_stream(endpoint, conv_payload, timeout=timeout)
                    if result.get("error"):
                        raise RuntimeError(result["error"])
                    break
                except Exception as exc:
                    last_err = str(exc) or f"{type(exc).__name__}"
                    logger.warning("Capability %s attempt %d failed: %s", cap_ref, attempt + 1, last_err[:200])
                    if attempt < max_retries - 1:
                        await _asyncio.sleep(2 ** attempt)
            if result is None:
                logger.error("Capability %s all %d attempts failed", cap_ref, max_retries)
                return {"_last_node": node_def.id, "_error": last_err}

            output: dict[str, Any] = {"_last_node": node_def.id}
            if result.get("summary"):
                output["_summary"] = result["summary"]
            output["_result"] = result.get("result") or result
            if result.get("artifacts"):
                existing = list(state.get("_phase_artifacts", []))
                output["_phase_artifacts"] = existing + result["artifacts"]
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

            upstream = _get_upstream_context(state)
            if upstream and str(upstream) not in user_msg:
                user_msg = f"{user_msg}\n\nContext from previous step:\n{str(upstream)[:2000]}"

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
            upstream = _get_upstream_context(state)
            return {
                "_last_node": node_def.id,
                "_awaiting_human": True,
                "_summary": upstream[:2000] if upstream else "",
            }

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
                endpoint = cap.get("endpoint", "") if cap else ""
                if endpoint and "/api/" in endpoint:
                    endpoint = endpoint.rsplit("/api/", 1)[0]
                if endpoint:
                    conv_payload = _build_conversation_request(node_def, state, node_config)
                    conv_payload["intent"] = intent_name
                    try:
                        result = await self._call_agent_stream(endpoint, conv_payload)
                        if result.get("error"):
                            return {"_last_node": node_def.id, "_error": result["error"]}
                        return {"_last_node": node_def.id, "_result": result.get("result") or result}
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

        async def _agentic_node(state: dict[str, Any]) -> dict[str, Any]:
            """LLM tool-use loop via the unified agent pipeline.

            Instead of an inline tool loop, delegates to the PM agent's own
            ``/api/conversation/stream`` endpoint with ``mode=execute``.
            """
            from .config import config as _cfg
            import os

            system_prompt = node_config.get("system_prompt", "You are a helpful agent with access to tools.")
            prompt_template = node_config.get("prompt", "")
            tool_filter: list[str] | None = node_config.get("enabled_tools")

            user_msg = prompt_template or state.get("user_message", "")
            if not user_msg:
                user_msg = str(state.get("_summary", "Continue processing."))
            upstream = _get_upstream_context(state)
            if upstream and str(upstream) not in user_msg:
                user_msg = f"{user_msg}\n\nContext from previous step:\n{str(upstream)[:2000]}"

            pm_base = os.getenv("PM_AGENT_URL", f"http://pm-agent:{_cfg.port}")
            conv_payload = {
                "workspace_id": state.get("workspace_id", ""),
                "message": user_msg,
                "mode": "execute",
                "intent": node_config.get("task_title", node_def.id),
                "description": node_config.get("task_description", ""),
                "system_prompt": system_prompt,
                "preferred_model": node_config.get("model") or state.get("preferred_model"),
                "context": {"source": "graph_executor", "node_id": node_def.id},
            }
            if tool_filter:
                conv_payload["enabled_tools"] = tool_filter

            timeout = node_config.get("timeout", 300)
            result = await self._call_agent_stream(pm_base, conv_payload, timeout=timeout)

            if result.get("error"):
                return {"_last_node": node_def.id, "_error": result["error"]}
            return {
                "_last_node": node_def.id,
                "llm_output": result.get("result", ""),
                "_result": result.get("result", ""),
            }

        async def _passthrough_node(state: dict[str, Any]) -> dict[str, Any]:
            return {"_last_node": node_def.id}

        dispatch: dict[str, Any] = {
            "capability": _capability_node,
            "llm_call": _llm_node,
            "human_in_loop": _human_node,
            "intent": _intent_node,
            "subgraph": _subgraph_node,
            "agentic": _agentic_node,
        }
        raw_fn = dispatch.get(node_type, _passthrough_node)

        async def _wrapped(state: dict[str, Any]) -> dict[str, Any]:
            cycle_err = _check_cycle(state)
            if cycle_err:
                return cycle_err
            output = await raw_fn(state)
            return _track_visit(state, output)

        return _wrapped

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

    async def compile(
        self,
        graph_def: dict[str, Any],
        *,
        checkpointer: Any | None = None,
    ) -> Any:
        """Parse graph_def and compile to a LangGraph CompiledGraph.

        When the graph contains ``human_in_loop`` nodes, they are
        registered as ``interrupt_before`` points.  A checkpointer is
        required for interrupt support; if none is supplied and interrupts
        are needed, an in-memory ``MemorySaver`` is created automatically.
        """
        _ensure_langgraph_loaded()
        assert StateGraph is not None and MemorySaver is not None
        parsed = ParsedGraphDef.from_dict(graph_def)
        state_type = self._build_state_type(parsed.state_schema)
        graph = StateGraph(state_type)

        interrupt_nodes: list[str] = []
        for node_def in parsed.nodes:
            fn = self._make_node_fn(node_def)
            graph.add_node(node_def.id, cast(Any, fn))
            if node_def.type == "human_in_loop":
                interrupt_nodes.append(node_def.id)

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

        compile_kwargs: dict[str, Any] = {}
        if interrupt_nodes:
            if checkpointer is None:
                checkpointer = MemorySaver()
            compile_kwargs["checkpointer"] = checkpointer
            compile_kwargs["interrupt_before"] = interrupt_nodes

        recursion_limit = parsed.config.get("recursion_limit", 25)
        compiled = graph.compile(**compile_kwargs)
        setattr(compiled, "recursion_limit", recursion_limit)
        return compiled

    async def execute(
        self,
        graph_def: dict[str, Any],
        input_state: dict[str, Any] | None = None,
        *,
        thread_id: str | None = None,
        checkpointer: Any | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Compile and execute a graph, yielding SSE-compatible event dicts.

        When the graph contains ``human_in_loop`` nodes, execution pauses
        before them and yields a ``graph:node_awaiting_approval`` event.
        Call ``resume()`` with the same ``thread_id`` to continue.
        """
        _ensure_langgraph_loaded()
        assert MemorySaver is not None
        tid = thread_id or uuid.uuid4().hex

        # Reuse or create checkpointer so resume() can find it
        if checkpointer is None:
            checkpointer = self._checkpointers.get(tid)
        if checkpointer is None:
            checkpointer = MemorySaver()
        self._checkpointers[tid] = checkpointer

        compiled = await self.compile(graph_def, checkpointer=checkpointer)
        initial = input_state or {}
        run_config = {"configurable": {"thread_id": tid}}

        parsed = ParsedGraphDef.from_dict(graph_def)
        human_nodes = {n.id for n in parsed.nodes if n.type == "human_in_loop"}
        known_keys = set(self._INTERNAL_FIELDS) | set(parsed.state_schema)
        extra = {k: v for k, v in initial.items() if k not in known_keys}
        if extra:
            initial["_passthrough"] = extra

        yield {"event": "graph:start", "data": {
            "nodes": [n["id"] for n in graph_def.get("nodes", [])],
            "thread_id": tid,
        }}

        try:
            async for event in compiled.astream(initial, run_config, stream_mode="updates"):
                for node_name, node_output in event.items():
                    yield {
                        "event": "graph:node_complete",
                        "data": {"node": node_name, "output": node_output},
                    }
        except Exception as exc:
            logger.error("Graph execution error: %s", exc)
            yield {"event": "graph:error", "data": {"error": str(exc)}}
            return

        # Check if the graph was interrupted at a human_in_loop node
        if human_nodes and hasattr(compiled, "get_state"):
            try:
                snapshot = compiled.get_state(run_config)
                pending = snapshot.next if snapshot else ()
                if pending:
                    paused_node = pending[0] if pending else ""
                    yield {
                        "event": "graph:node_awaiting_approval",
                        "data": {
                            "thread_id": tid,
                            "node": paused_node,
                            "summary": (snapshot.values or {}).get("_summary", ""),
                        },
                    }
                    return  # graph is paused, don't emit complete
            except Exception:
                logger.debug("Could not check interrupt state", exc_info=True)

        # Completed — clean up checkpointer
        self._checkpointers.pop(tid, None)
        yield {"event": "graph:complete", "data": {"thread_id": tid}}

    async def resume(
        self,
        graph_def: dict[str, Any],
        thread_id: str,
        *,
        checkpointer: Any | None = None,
        update_state: dict[str, Any] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Resume a paused graph from its checkpoint.

        Called after a ``human_in_loop`` node has been approved.  Yields
        the same event stream as ``execute()``.
        """
        # Retrieve the checkpointer that was used during execute()
        if checkpointer is None:
            checkpointer = self._checkpointers.get(thread_id)
        if checkpointer is None:
            logger.error("No checkpointer found for thread %s — cannot resume", thread_id)
            yield {"event": "graph:error", "data": {
                "error": f"No checkpoint for thread {thread_id}",
            }}
            return

        compiled = await self.compile(graph_def, checkpointer=checkpointer)
        run_config = {"configurable": {"thread_id": thread_id}}

        parsed = ParsedGraphDef.from_dict(graph_def)
        human_nodes = {n.id for n in parsed.nodes if n.type == "human_in_loop"}

        yield {"event": "graph:resume", "data": {"thread_id": thread_id}}

        try:
            async for event in compiled.astream(
                update_state, run_config, stream_mode="updates",
            ):
                for node_name, node_output in event.items():
                    yield {
                        "event": "graph:node_complete",
                        "data": {"node": node_name, "output": node_output},
                    }
        except Exception as exc:
            logger.error("Graph resume error: %s", exc)
            yield {"event": "graph:error", "data": {"error": str(exc)}}
            return

        if human_nodes and hasattr(compiled, "get_state"):
            try:
                snapshot = compiled.get_state(run_config)
                pending = snapshot.next if snapshot else ()
                if pending:
                    paused_node = pending[0] if pending else ""
                    yield {
                        "event": "graph:node_awaiting_approval",
                        "data": {
                            "thread_id": thread_id,
                            "node": paused_node,
                            "summary": (snapshot.values or {}).get("_summary", ""),
                        },
                    }
                    return
            except Exception:
                logger.debug("Could not check interrupt state after resume", exc_info=True)

        # Completed — clean up checkpointer
        self._checkpointers.pop(thread_id, None)
        yield {"event": "graph:complete", "data": {"thread_id": thread_id}}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _build_conversation_request(
    node_def: GraphNodeDef,
    state: dict[str, Any],
    node_config: dict[str, Any],
) -> dict[str, Any]:
    """Build a ConversationRequest-compatible JSON payload from graph node + state."""
    workspace_id = state.get("workspace_id", "")
    task_title = node_config.get("task_title", node_def.id)
    task_desc = node_config.get("task_description", "")
    user_msg = state.get("user_message", task_desc)

    upstream = _get_upstream_context(state)
    if upstream and str(upstream) not in user_msg:
        user_msg = f"{user_msg}\n\n--- Previous step output ---\n{str(upstream)[:2000]}"

    passthrough = state.get("_passthrough") or {}
    context: dict[str, Any] = {
        "source": "graph_executor",
        "node_id": node_def.id,
        "node_type": node_def.type,
        "task_title": task_title,
        "task_description": task_desc,
        **passthrough,
        **{k: v for k, v in state.items() if not k.startswith("_") and k != "workspace_id"},
    }
    if upstream:
        context["upstream_result"] = upstream

    intent = (
        f"execute_{node_def.capability_ref}" if node_def.capability_ref else node_def.id
    )
    return build_graph_node_execute_payload(
        workspace_id=workspace_id,
        message=user_msg,
        intent=intent,
        description=task_title,
        task_id=f"graph-{node_def.id}-{uuid.uuid4().hex[:8]}",
        context=context,
        preferred_model=node_config.get("model") or state.get("preferred_model"),
        system_prompt=state.get("system_prompt") or None,
        enabled_tools_raw=state.get("enabled_tools"),
    )


def _get_upstream_context(state: dict[str, Any]) -> str:
    """Extract the best available upstream output from graph state."""
    result = state.get("_result")
    summary = state.get("_summary", "")
    llm_out = state.get("llm_output", "")
    skill_prompt = state.get("_skill_prompt", "")
    best = summary or llm_out or skill_prompt or (str(result)[:8000] if result else "")

    upstream_arts = state.get("upstream_artifacts")
    if upstream_arts and isinstance(upstream_arts, list):
        art_lines = []
        for art in upstream_arts[:10]:
            title = art.get("title", "")
            content = art.get("content", "")[:2000]
            if title or content:
                art_lines.append(f"[{art.get('phase','')}] {title}:\n{content}")
        if art_lines:
            best = best + "\n\n## Upstream Artifacts\n" + "\n---\n".join(art_lines)
    return best


async def _execute_skill(
    node_def: GraphNodeDef,
    cap: dict[str, Any],
    state: dict[str, Any],
    tool_manager: Any | None,
) -> dict[str, Any]:
    """Execute a skill capability: inject prompt fragments and optionally run tools."""
    skill_cfg = cap.get("skillConfig") or cap.get("skill_config") or {}
    fragments = skill_cfg.get("prompt_fragments", skill_cfg.get("promptFragments", []))
    tools = skill_cfg.get("tools", [])

    output: dict[str, Any] = {"_last_node": node_def.id}
    combined = "\n\n".join(f for f in fragments if f)
    if combined:
        output["_skill_prompt"] = combined
        output["_result"] = combined

    if tools and tool_manager:
        for tool_name in tools:
            try:
                result = await tool_manager.execute(tool_name, {})
                output["_result"] = result.output if hasattr(result, "output") else str(result)
                break
            except Exception:
                logger.debug("Skill tool %s not executable, skipping", tool_name)
                continue

    return output


def _resolve_type(type_str: str) -> Any:
    """Map graph schema type strings to Python types or ``typing.Any``."""
    mapping: dict[str, Any] = {
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
