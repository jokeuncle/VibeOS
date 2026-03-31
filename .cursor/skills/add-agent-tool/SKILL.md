---
name: add-agent-tool
description: Add a new callable tool to an AI agent. Use when creating BaseTool subclasses, tool factories, or wiring tools into an agent's tool registry.
---

# Add Agent Tool

## Workflow checklist

```
- [ ] Step 1: Create BaseTool subclass
- [ ] Step 2: Create factory function
- [ ] Step 3: Add TOOLS schema entry in agent
- [ ] Step 4: Register in agent __init__
- [ ] Step 5: Add optional dependencies (if needed)
```

## Step 1: BaseTool subclass

File: `agents/shared/vibeos_agent/tools/<module>.py` (shared) or inside the agent package (agent-only).

```python
from __future__ import annotations
from typing import Any
from vibeos_agent.tools.base import BaseTool

class MyNewTool(BaseTool):
    name = "my_tool_name"
    description = "What this tool does — be specific for LLM function-calling"
    parameters = {
        "type": "object",
        "properties": {
            "param1": {"type": "string", "description": "..."},
            "param2": {"type": "integer", "description": "..."},
        },
        "required": ["param1"],
    }

    async def execute(self, **kwargs: Any) -> str:
        param1 = kwargs["param1"]
        result = {"status": "ok", "data": param1}
        return self._json_result(result)
```

Key rules:
- `execute` must return a **string** — use `self._json_result(dict_or_list)` for structured data
- `name` must be a valid Python identifier (lowercase, underscores)
- `parameters` must be valid JSON Schema

## Step 2: Factory function

In the same module, expose a factory:

```python
def create_my_tools(dep_client=None) -> list[BaseTool]:
    """Create tool instances, optionally injecting dependencies."""
    tools = [MyNewTool()]
    if dep_client:
        tools[0]._client = dep_client  # or pass via __init__
    return tools
```

If tools need constructor dependencies (e.g. an HTTP client), accept them as factory params.

Existing factory examples: `create_gitlab_tools()`, `create_dev_tools(llm_client)`, `create_workspace_tools(ws_client, agent_type)`.

## Step 3: TOOLS schema in agent

File: `agents/<name>-agent/<pkg>/agent.py` — add to the module-level `TOOLS` list:

```python
TOOLS: list[dict[str, Any]] = [
    # ... existing tools ...
    {
        "type": "function",
        "function": {
            "name": "my_tool_name",       # MUST match BaseTool.name exactly
            "description": "...",
            "parameters": { ... },         # MUST match BaseTool.parameters
        },
    },
]
```

**CRITICAL:** The `name` in TOOLS and `BaseTool.name` must be identical. Mismatches cause silent tool-call failures.

## Step 4: Register in agent

In the agent's `__init__`:

```python
def __init__(self) -> None:
    super().__init__()
    from vibeos_agent.tools.my_module import create_my_tools
    self.tool_registry.register_many(create_my_tools())
```

## Step 5: Optional dependencies

If the tool uses a new third-party package, add it to the appropriate `pyproject.toml`:

- Shared tools: `agents/shared/pyproject.toml` under `[project.optional-dependencies]`
- Agent-only tools: the agent's own `pyproject.toml` under `dependencies`

## Verification

```bash
python -c "from vibeos_agent.tools.my_module import create_my_tools; print([t.name for t in create_my_tools()])"
```

Confirm tool names print correctly and match the `TOOLS` schema list.
