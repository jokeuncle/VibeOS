---
name: add-python-agent
description: Create a new domain AI agent for the VibeOS platform. Use when adding a new agent type like security-agent, docs-agent, or any new domain-specific AI service.
---

# Create New Domain Agent

## Workflow checklist

```
- [ ] Step 1: Create agent package directory + pyproject.toml
- [ ] Step 2: Implement agent class (agent.py)
- [ ] Step 3: Create FastAPI app (main.py)
- [ ] Step 4: Register AgentType enum
- [ ] Step 5: Wire dispatch in pm-agent
- [ ] Step 6: Map phase (if applicable)
- [ ] Step 7: Add Dockerfile + docker-compose entry
- [ ] Step 8: Update docs and rules
```

## Step 1: Package structure

Create `agents/<name>-agent/<pkg>/` where `<pkg>` is the Python import name (e.g. `sec_agent`).

**`agents/<name>-agent/pyproject.toml`:**

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "<name>-agent"
version = "0.1.0"
description = "VibeOS <Name> Agent – <brief role>"
requires-python = ">=3.12"
dependencies = [
    "vibeos-agent",
    "fastapi",
    "uvicorn[standard]",
]

[tool.hatch.build.targets.wheel]
packages = ["<pkg>"]
```

## Step 2: Agent class

**`agents/<name>-agent/<pkg>/agent.py`:**

```python
from __future__ import annotations
from collections.abc import AsyncIterator
from typing import Any
from vibeos_agent import (
    AgentEvent, AgentStatus, AgentTask, AgentType, BaseAgent,
    CapabilityContract, Message, RichBlock,
)

SYSTEM_PROMPT = """\
You are an expert <domain> engineer...
"""

TOOLS: list[dict[str, Any]] = [
    # OpenAI function-calling schemas — names must match BaseTool.name
]

class MyAgent(BaseAgent):
    agent_type = AgentType.MY_DOMAIN
    system_prompt = SYSTEM_PROMPT
    tools = TOOLS

    def __init__(self) -> None:
        super().__init__()
        # self.tool_registry.register_many(create_my_tools())

    async def execute(self, task: AgentTask) -> AsyncIterator[AgentEvent]:
        yield self._make_event("status", task.workspace_id, {"status": AgentStatus.RUNNING})
        # ... implement execution logic ...
        yield self._make_event("result", task.workspace_id, {"summary": "done"})

    async def chat(self, message: str, *, workspace_id: str, **kw) -> AsyncIterator[Message]:
        reply = await self._call_llm(message, workspace_id=workspace_id)
        yield self._make_message(workspace_id, reply)
```

Key: `BaseAgent.__init__` auto-wires `self.workspace_svc`, `self.llm`, `self.ws`, `self.session`, `self.memory`, `self.rag`, `self.knowledge`.

## Step 3: FastAPI app

**`agents/<name>-agent/<pkg>/main.py`:** — Clone from `agents/dev-agent/dev_agent/main.py`. The boilerplate is identical across all domain agents:

- `@asynccontextmanager lifespan`: construct agent → `app.state.agent = agent` → yield → `agent.close()`
- `FastAPI(...)` + `CORSMiddleware(allow_origins=["*"])`
- Routes: `/api/execute`, `/api/execute/stream`, `/api/chat`, `/api/chat/stream`, `/health`
- Request models: `AgentTask` for execute, `ChatRequest(workspace_id, message)` for chat

## Step 4: Register AgentType

File: `agents/shared/vibeos_agent/models.py`

```python
class AgentType(StrEnum):
    # ... existing ...
    MY_DOMAIN = "my_domain"
```

## Step 5: Wire dispatch

File: `agents/pm-agent/pm_agent/dispatch.py`

Add to `_build_agent_endpoints()`:

```python
"my_domain": ("MY_DOMAIN_AGENT_URL", "http://localhost:80XX"),
```

Add to `AGENT_NAME_CN`:

```python
"my_domain": "中文名称",
```

## Step 6: Phase mapping (if applicable)

If this agent owns a phase in the SDLC pipeline:

- `agents/shared/vibeos_agent/base_agent.py`: add to `AGENT_PHASE_MAP` and `PHASE_CONTEXT`
- `agents/pm-agent/pm_agent/workflow.py`: add to `PHASE_ORDER` and `_agent_for_phase`

## Step 7: Dockerfile + Compose

**`deploy/docker/Dockerfile.<name>`:**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY agents/shared/ agents/shared/
COPY agents/<name>-agent/ agents/<name>-agent/
RUN pip install --no-cache-dir agents/shared/ agents/<name>-agent/
EXPOSE 80XX
CMD ["uvicorn", "<pkg>.main:app", "--host", "0.0.0.0", "--port", "80XX"]
```

**`deploy/docker-compose.yml`:** add service entry following existing agent pattern (context `../`, dockerfile, ports, env vars for `LLM_GATEWAY_URL`, `WORKSPACE_SVC_URL`, `WS_GATEWAY_URL`).

## Step 8: Update docs and rules

- `README.md`: add port to the ports table, add env var if new
- `.cursor/rules/project-overview.mdc`: add port mapping and Vite proxy rule if frontend calls this agent directly

## Run locally

```bash
cd agents/<name>-agent
pip install -e ../shared -e .
uvicorn <pkg>.main:app --port 80XX --reload
```
