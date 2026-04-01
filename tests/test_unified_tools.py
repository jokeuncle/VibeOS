#!/usr/bin/env python3
"""End-to-end integration test for the Unified Tool Architecture.

Tests all three tool provider types (Static / MCP / Skill) through a single
ToolManager, then runs a graph with an agentic node that autonomously calls
tools.

Prerequisites:
  - `make dev` running (llm-gateway on :8030)
  - hello-mcp server available at tools/hello-mcp/server.py

Usage:
  .venv/bin/python tests/test_unified_tools.py
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from typing import Any

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "agents", "shared"))

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger("test_unified_tools")

DIVIDER = "─" * 60

# ---------------------------------------------------------------------------
# 1. Simple static tools
# ---------------------------------------------------------------------------

from vibeos_agent.tools.base import BaseTool, ToolResult
from vibeos_agent.tools.provider import StaticToolProvider, ToolManager
from vibeos_agent.tools.mcp_provider import MCPServerConfig, MCPToolProvider
from vibeos_agent.skills import Skill, SkillRegistry, SkillToolProvider


class EchoTool(BaseTool):
    name = "echo"
    description = "Echoes back the input message with a prefix"
    parameters = {
        "type": "object",
        "properties": {
            "message": {"type": "string", "description": "Message to echo"},
        },
        "required": ["message"],
    }

    async def execute(self, message: str = "", **_kw: Any) -> str:
        return f"[ECHO] {message}"


class AddTool(BaseTool):
    name = "add_numbers"
    description = "Adds two numbers and returns the sum"
    parameters = {
        "type": "object",
        "properties": {
            "a": {"type": "number", "description": "First number"},
            "b": {"type": "number", "description": "Second number"},
        },
        "required": ["a", "b"],
    }

    async def execute(self, a: float = 0, b: float = 0, **_kw: Any) -> str:
        return json.dumps({"sum": a + b})


class TimestampTool(BaseTool):
    """A skill-bound tool that returns the current UTC timestamp."""
    name = "current_timestamp"
    description = "Returns the current UTC date-time string"
    parameters = {"type": "object", "properties": {}}

    async def execute(self, **_kw: Any) -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# 2. Build unified ToolManager
# ---------------------------------------------------------------------------

async def build_tool_manager() -> ToolManager:
    tm = ToolManager()

    # --- Static provider ---
    static = StaticToolProvider()
    static.register(EchoTool())
    static.register(AddTool())
    tm.register_provider(static)

    # --- MCP provider (hello-mcp stdio) ---
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    python_bin = os.path.join(project_root, ".venv", "bin", "python")
    mcp_script = os.path.join(project_root, "tools", "hello-mcp", "server.py")
    mcp_cfg = MCPServerConfig(
        name="hello-mcp",
        transport="stdio",
        command=python_bin,
        args=[mcp_script],
    )
    mcp_provider = MCPToolProvider(mcp_cfg)
    tm.register_provider(mcp_provider)

    # --- Skill provider ---
    skill_reg = SkillRegistry()
    skill_reg.register(Skill(
        id="time-skill",
        name="time-helper",
        description="Provides current timestamp utility",
        prompt_fragments=["You can use the `current_timestamp` tool to get the current time."],
        tools=["current_timestamp"],
        applicable_agents=["pm"],
        enabled=True,
    ))
    skill_prov = SkillToolProvider(skill_reg)
    skill_prov.register_tool(TimestampTool())
    skill_prov.provider_key = "skill:test"
    tm.register_provider(skill_prov)

    return tm


# ---------------------------------------------------------------------------
# 3. Test: list all tools
# ---------------------------------------------------------------------------

async def test_list_tools(tm: ToolManager) -> None:
    print(f"\n{DIVIDER}")
    print("TEST 1: List all tools from unified ToolManager")
    print(DIVIDER)
    schemas = await tm.get_schemas()
    for s in schemas:
        fn = s["function"]
        print(f"  [{fn['name']}]  {fn['description'][:60]}")
    assert len(schemas) >= 4, f"Expected ≥4 tools, got {len(schemas)}"
    names = {s["function"]["name"] for s in schemas}
    assert "echo" in names, "Missing static tool: echo"
    assert "add_numbers" in names, "Missing static tool: add_numbers"
    assert "generate_greeting_page" in names, "Missing MCP tool: generate_greeting_page"
    assert "current_timestamp" in names, "Missing skill tool: current_timestamp"
    print(f"  ✓  {len(schemas)} tools discovered across 3 provider types")


# ---------------------------------------------------------------------------
# 4. Test: execute each tool type
# ---------------------------------------------------------------------------

async def test_execute_tools(tm: ToolManager) -> None:
    print(f"\n{DIVIDER}")
    print("TEST 2: Execute each tool type through ToolManager")
    print(DIVIDER)

    # static: echo
    r1 = await tm.execute("echo", {"message": "hello unified tools"})
    print(f"  [static/echo]  ok={r1.ok}  output={r1.output[:80]}")
    assert r1.ok and "hello unified tools" in r1.output

    # static: add_numbers
    r2 = await tm.execute("add_numbers", {"a": 17, "b": 25})
    print(f"  [static/add]   ok={r2.ok}  output={r2.output[:80]}")
    assert r2.ok
    data = json.loads(r2.output)
    assert data["sum"] == 42

    # MCP: generate_greeting_page
    r3 = await tm.execute("generate_greeting_page", {"name": "VibeOS"})
    print(f"  [mcp/greeting] ok={r3.ok}  output={r3.output[:80]}...")
    assert r3.ok and "Hello" in r3.output

    # skill: current_timestamp
    r4 = await tm.execute("current_timestamp", {})
    print(f"  [skill/time]   ok={r4.ok}  output={r4.output[:40]}")
    assert r4.ok

    print("  ✓  All 4 tool executions succeeded")


# ---------------------------------------------------------------------------
# 5. Test: agentic node via GraphExecutor
# ---------------------------------------------------------------------------

async def test_agentic_node(tm: ToolManager) -> None:
    print(f"\n{DIVIDER}")
    print("TEST 3: Agentic node in GraphExecutor (LLM tool-use loop)")
    print(DIVIDER)

    from vibeos_agent.graph_executor import GraphExecutor, HAS_LANGGRAPH
    if not HAS_LANGGRAPH:
        print("  ⚠  langgraph not installed, skipping agentic node test")
        return

    from vibeos_agent.clients.llm import LLMGatewayClient
    from vibeos_agent.registry import RegistryClient

    llm = LLMGatewayClient(base_url="http://localhost:8030")
    registry = RegistryClient()

    executor = GraphExecutor(registry, llm=llm, tool_manager=tm)

    graph_def = {
        "nodes": [
            {
                "id": "agent_node",
                "type": "agentic",
                "config": {
                    "system_prompt": (
                        "You are an assistant with tools. "
                        "Use the tools to answer the user's question. "
                        "Call `echo` with the final answer when done."
                    ),
                    "prompt": "What is 17 + 25? Use add_numbers to calculate, then echo the result.",
                    "model": "doubao-seed-2-0-lite-260215",
                    "max_iterations": 5,
                },
            },
        ],
        "edges": [
            {"source": "__start__", "target": "agent_node"},
            {"source": "agent_node", "target": "__end__"},
        ],
        "stateSchema": {
            "user_message": {"type": "string"},
        },
    }

    print("  Running graph with agentic node...")
    events: list[dict[str, Any]] = []
    async for evt in executor.execute(graph_def, {"user_message": "test"}):
        events.append(evt)
        event_type = evt.get("event", "")
        if event_type == "graph:node_complete":
            node = evt["data"]["node"]
            output = evt["data"]["output"]
            llm_out = output.get("llm_output", "")[:120]
            print(f"  [{node}] llm_output: {llm_out}...")
        elif event_type == "graph:error":
            print(f"  ERROR: {evt['data']}")
        else:
            print(f"  {event_type}")

    final = [e for e in events if e.get("event") == "graph:node_complete"]
    assert final, "No node_complete events"
    output = final[-1]["data"]["output"]
    assert output.get("llm_output") or output.get("_result"), "Agentic node produced no output"
    print("  ✓  Agentic node completed with tool-use loop")


# ---------------------------------------------------------------------------
# 6. Test: mixed graph (llm_call -> agentic -> llm_call)
# ---------------------------------------------------------------------------

async def test_mixed_graph(tm: ToolManager) -> None:
    print(f"\n{DIVIDER}")
    print("TEST 4: Mixed graph (llm_call → agentic → llm_call)")
    print(DIVIDER)

    from vibeos_agent.graph_executor import GraphExecutor, HAS_LANGGRAPH
    if not HAS_LANGGRAPH:
        print("  ⚠  langgraph not installed, skipping")
        return

    from vibeos_agent.clients.llm import LLMGatewayClient
    from vibeos_agent.registry import RegistryClient

    llm = LLMGatewayClient(base_url="http://localhost:8030")
    registry = RegistryClient()
    executor = GraphExecutor(registry, llm=llm, tool_manager=tm)

    graph_def = {
        "nodes": [
            {
                "id": "plan",
                "type": "llm_call",
                "config": {
                    "system_prompt": "You are a planning assistant.",
                    "prompt": "Create a short 2-sentence greeting plan for a person named Alice.",
                    "model": "doubao-seed-2-0-lite-260215",
                },
            },
            {
                "id": "execute",
                "type": "agentic",
                "config": {
                    "system_prompt": (
                        "You are an execution assistant with tools. "
                        "Use `generate_greeting_page` to create an HTML greeting page based on the plan."
                    ),
                    "model": "doubao-seed-2-0-lite-260215",
                    "max_iterations": 3,
                },
            },
            {
                "id": "summarize",
                "type": "llm_call",
                "config": {
                    "system_prompt": "You summarize results concisely.",
                    "prompt": "Summarize what was accomplished in one sentence.",
                    "model": "doubao-seed-2-0-lite-260215",
                },
            },
        ],
        "edges": [
            {"source": "__start__", "target": "plan"},
            {"source": "plan", "target": "execute"},
            {"source": "execute", "target": "summarize"},
            {"source": "summarize", "target": "__end__"},
        ],
        "stateSchema": {
            "user_message": {"type": "string"},
        },
    }

    print("  Running 3-node mixed graph...")
    completed_nodes: list[str] = []
    async for evt in executor.execute(graph_def, {"user_message": "Create greeting for Alice"}):
        event_type = evt.get("event", "")
        if event_type == "graph:node_complete":
            node = evt["data"]["node"]
            output = evt["data"]["output"]
            completed_nodes.append(node)
            preview = (output.get("llm_output") or output.get("_result") or "")
            if isinstance(preview, str):
                preview = preview[:100]
            else:
                preview = str(preview)[:100]
            print(f"  ✓ [{node}] {preview}...")
        elif event_type == "graph:error":
            print(f"  ✗ ERROR: {evt['data']}")
        elif event_type in ("graph:start", "graph:complete"):
            print(f"  {event_type}")

    assert set(completed_nodes) == {"plan", "execute", "summarize"}, (
        f"Expected all 3 nodes, got {completed_nodes}"
    )
    print("  ✓  Mixed graph completed: plan → agentic(tools) → summarize")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> None:
    print("\n" + "═" * 60)
    print("  Unified Tool Architecture – E2E Integration Test")
    print("═" * 60)

    tm = await build_tool_manager()

    try:
        await test_list_tools(tm)
        await test_execute_tools(tm)
        await test_agentic_node(tm)
        await test_mixed_graph(tm)
    finally:
        for p in tm._providers:
            if hasattr(p, "close"):
                try:
                    await p.close()
                except Exception:
                    pass

    print(f"\n{'═' * 60}")
    print("  ALL TESTS PASSED ✓")
    print(f"{'═' * 60}\n")


if __name__ == "__main__":
    asyncio.run(main())
