# VibeOS — AI-Native SDLC Platform

VibeOS 是一个 AI 原生的软件开发生命周期平台，通过多 Agent 协作完成从需求分析到持续监控的全流程。平台具备跨 workspace 的记忆积累和知识蒸馏能力，使 Agent 在反复执行任务的过程中持续变好。

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (React 19)                    │
│            Vite 8 · TypeScript · Tailwind 4              │
│                     localhost:3000                        │
└────────┬──────────────────┬───────────────┬──────────────┘
         │ /api/*           │ /api/nlp,     │ /ws
         │                  │ /api/workflow, │
         │                  │ /api/agents,   │
         │                  │ /api/feedback  │
         ▼                  ▼                ▼
┌─────────────┐   ┌─────────────┐   ┌──────────────┐
│workspace-svc│   │  pm-agent   │   │ ws-gateway   │
│   (Go/Chi)  │   │  (FastAPI)  │   │  (Go/WS)     │
│   :8010     │   │   :8040     │   │   :8020      │
└──────┬──────┘   └──────┬──────┘   └──────┬───────┘
       │                 │                  │
       │          ┌──────┴──────┐           │
       │          │  Dispatcher │           │
       │          └──────┬──────┘           │
       │     ┌───────────┼───────────┐      │
       │     ▼           ▼           ▼      │
       │  ┌──────┐  ┌──────────┐ ┌──────┐  │
       │  │arch  │  │dev-agent │ │ ...  │  │
       │  │:8041 │  │  :8044   │ │agents│  │
       │  └──────┘  └──────────┘ └──────┘  │
       │                 │                  │
       ▼                 ▼                  ▼
┌──────────┐  ┌───────────────┐  ┌──────────────┐
│PostgreSQL│  │  llm-gateway  │  │    Redis      │
│  :5432   │  │   :8030       │  │    :6379      │
└──────────┘  └───────────────┘  └──────────────┘
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
┌──────────┐  ┌────────────┐  ┌──────────────┐
│ memory-  │  │rag-pipeline│  │ knowledge-   │
│ service  │  │   :8060    │  │  service     │
│  :8050   │  └─────┬──────┘  │   :8070      │
└────┬─────┘        │         └──────┬───────┘
     │              │                │
     ▼              ▼                ▼
┌──────────┐  ┌──────────┐   ┌──────────────┐
│  Qdrant  │  │  Qdrant  │   │  PostgreSQL  │
│  :6333   │  │  :6333   │   │  (AGE graph) │
└──────────┘  └──────────┘   └──────────────┘
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19, Vite 8, TypeScript, Tailwind 4, Zustand, Framer Motion | SPA with real-time WebSocket updates |
| **API Gateway** | Go, Chi router | Workspace/task CRUD, GitLab credentials, auth/membership |
| **WebSocket Relay** | Go, gorilla/websocket, Redis Pub/Sub | Real-time event broadcasting |
| **Agent Orchestrator** | Python, FastAPI, LangGraph | NLP intent parsing, multi-agent workflow dispatch |
| **Domain Agents** | Python, FastAPI | Per-phase AI agents (requirement, design, dev, test...) |
| **LLM Gateway** | Python, LiteLLM | Multi-provider routing, token budget, circuit breaker |
| **Memory Service** | Python, Mem0, Qdrant | Four-layer memory: Working/Project/Org/Preference |
| **RAG Pipeline** | Python, LlamaIndex, Qdrant | Per-workspace document indexing and retrieval |
| **Knowledge Service** | Python, Apache AGE, PostgreSQL | Organization knowledge graph, LLM-based distillation |
| **Database** | PostgreSQL 16 | Workspaces, tasks, credentials, users, knowledge graph |
| **Cache/PubSub** | Redis 7 | Session management, event pub/sub, trust scores |
| **Vector Store** | Qdrant | Memory embeddings, RAG document chunks |

## Service Ports

### Infrastructure

| Service | Port | Notes |
|---------|------|-------|
| PostgreSQL | 5432 | Database for workspace-svc & knowledge-service |
| Redis | 6379 | Shared pub/sub, session, cache (uses DB index 0-6) |
| Qdrant | 6333 (HTTP), 6334 (gRPC) | Vector store for memory-service & rag-pipeline |

### Application Services

| Service | Port | Role |
|---------|------|------|
| **Frontend** (Vite dev) | 3000 | React SPA |
| **workspace-svc** | 8010 | REST API: workspaces, tasks, phases, GitLab, auth |
| **ws-gateway** | 8020 | WebSocket relay for real-time events |
| **llm-gateway** | 8030 | Multi-provider LLM proxy |
| **pm-agent** | 8040 | Orchestrator: NLP, workflow, feedback |
| architecture-agent | 8041 | Architecture phase agent |
| requirement-agent | 8042 | Requirement phase agent |
| design-agent | 8043 | Design phase agent |
| **dev-agent** | 8044 | Development phase agent |
| test-agent | 8045 | Testing phase agent |
| cicd-agent | 8046 | CI/CD phase agent |
| monitoring-agent | 8047 | Monitoring phase agent |
| **memory-service** | 8050 | Mem0-based memory with Qdrant |
| **rag-pipeline** | 8060 | LlamaIndex RAG indexing & retrieval |
| **knowledge-service** | 8070 | Knowledge graph + distillation |

> **Bold** = core services required for basic operation. Others are optional domain agents.

### Vite Proxy Rules

| Path Pattern | Target | Service |
|-------------|--------|---------|
| `/api/nlp`, `/api/workflow`, `/api/agents`, `/api/feedback` | `:8040` | pm-agent |
| `/svc/memory` (rewritten) | `:8050` | memory-service |
| `/svc/rag` (rewritten) | `:8060` | rag-pipeline |
| `/svc/knowledge` (rewritten) | `:8070` | knowledge-service |
| `/api/*` (all other) | `:8010` | workspace-svc |
| `/ws` | `ws://:8020` | ws-gateway |

### Redis DB Index Allocation

| DB | Service |
|----|---------|
| 0 | workspace-svc, ws-gateway |
| 1 | llm-gateway |
| 2 | pm-agent |
| 3 | memory-service |
| 4 | rag-pipeline |
| 5 | knowledge-service |
| 6 | architecture-agent |

## Environment Variables

### Required for Core Operation

```bash
# PostgreSQL
DATABASE_URL="postgres://vibeos:vibeos_dev@localhost:5432/vibeos?sslmode=disable"

# Redis
REDIS_URL="redis://localhost:6379/0"   # per-service DB index differs

# LLM Provider (at least one required)
ARK_API_KEY="your-volcengine-ark-key"
# or OPENAI_API_KEY, ANTHROPIC_API_KEY, DEEPSEEK_API_KEY

# LLM Model
LLM_MODEL="doubao-seed-2-0-code-preview-260215"   # for llm-gateway
LLM_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
```

### Service Discovery (local dev overrides)

```bash
WORKSPACE_SVC_URL="http://localhost:8010"
WS_GATEWAY_URL="http://localhost:8020"
LLM_GATEWAY_URL="http://localhost:8030"
MEMORY_SVC_URL="http://localhost:8050"
RAG_SVC_URL="http://localhost:8060"
KNOWLEDGE_SVC_URL="http://localhost:8070"
```

### Agent Dispatcher URLs

```bash
ARCHITECTURE_AGENT_URL="http://localhost:8041"
REQUIREMENT_AGENT_URL="http://localhost:8042"
DESIGN_AGENT_URL="http://localhost:8043"
DEVELOPMENT_AGENT_URL="http://localhost:8044"
TESTING_AGENT_URL="http://localhost:8045"
CICD_AGENT_URL="http://localhost:8046"
MONITORING_AGENT_URL="http://localhost:8047"
```

### Memory & Embedding

```bash
QDRANT_URL="http://localhost:6333"
VOLCENGINE_API_KEY="$ARK_API_KEY"
VOLCENGINE_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
VOLCENGINE_LLM_MODEL="volcengine/doubao-seed-2-0-code-preview-260215"
EMBEDDING_MODEL="local/all-MiniLM-L6-v2"   # "local/" prefix = local embeddings
EMBEDDING_DIM="384"                         # 384 for MiniLM, 2048 for doubao
VIBEOS_ORG_ID="default"                     # org-level cross-workspace memory scope
HF_ENDPOINT="https://hf-mirror.com"        # HuggingFace mirror (China network)
```

### Security & GitLab

```bash
JWT_SECRET="your-jwt-secret"               # workspace-svc auth
GITLAB_ENCRYPT_KEY="your-32-byte-key"       # credential encryption
PUBLISH_SECRET="vibeos-internal"            # ws-gateway internal auth
# workspace-svc: if both are set, startup upserts one shared GitLab PAT (listed for every workspace; no per-workspace credential UI step)
GITLAB_URL="https://gitlab.example.com"
GITLAB_TOKEN="glpat-xxx"
# Optional aliases: GITLAB_DEFAULT_URL / GITLAB_DEFAULT_TOKEN (same behavior; checked first)
```

## Quick Start (Local Dev)

### Prerequisites

- Go 1.22+
- Python 3.12+ (3.14 works with caveats)
- Node.js 20+ / pnpm
- PostgreSQL 16
- Redis 7
- Qdrant 1.13+ (binary or Docker)

### 1. Start Infrastructure

```bash
# Option A: Docker Compose (if Docker Hub is accessible)
cd deploy && docker compose up -d postgres redis qdrant

# Option B: Local services
# PostgreSQL and Redis via brew/system, Qdrant binary:
curl -LO https://github.com/qdrant/qdrant/releases/download/v1.13.2/qdrant-aarch64-apple-darwin.tar.gz
tar xzf qdrant-aarch64-apple-darwin.tar.gz
./qdrant  # listens on :6333 and :6334
```

### 2. Initialize Database

```bash
psql -U vibeos -d vibeos -f deploy/init.sql
psql -U vibeos -d vibeos -f deploy/migrations/002_auth_and_membership.sql
```

### 3. Build & Start Go Services

```bash
# workspace-svc (from repo: put GITLAB_URL / GITLAB_TOKEN in deploy/.env — auto-loaded from cwd)
cd services/workspace-svc && go build -o workspace-svc ./cmd
DATABASE_URL="postgres://vibeos:vibeos_dev@localhost:5432/vibeos?sslmode=disable" \
REDIS_URL="redis://localhost:6379/0" PORT="8010" ./workspace-svc

# ws-gateway
cd services/ws-gateway && go build -o ws-gateway ./cmd
REDIS_URL="redis://localhost:6379/0" PORT="8020" ./ws-gateway
```

### 4. Install Python Dependencies

```bash
pip install -e agents/shared                    # vibeos-agent SDK
pip install -e agents/pm-agent                  # orchestrator
pip install -e agents/dev-agent                 # dev agent
pip install -e platform/llm-gateway             # LLM proxy
pip install -e platform/memory-service          # memory
pip install sentence-transformers               # local embeddings
```

### 5. Start Python Services

```bash
# llm-gateway
ARK_API_KEY="your-key" LLM_MODEL="doubao-seed-2-0-code-preview-260215" \
REDIS_URL="redis://localhost:6379/1" PORT="8030" \
python -m uvicorn llm_gateway.main:app --host 0.0.0.0 --port 8030 \
  --app-dir platform/llm-gateway

# memory-service
HF_ENDPOINT="https://hf-mirror.com" ARK_API_KEY="your-key" \
VOLCENGINE_LLM_MODEL="volcengine/doubao-seed-2-0-code-preview-260215" \
EMBEDDING_MODEL="local/all-MiniLM-L6-v2" EMBEDDING_DIM="384" \
QDRANT_URL="http://localhost:6333" REDIS_URL="redis://localhost:6379/3" \
PORT="8050" python -m uvicorn memory_service.main:app --host 0.0.0.0 --port 8050 \
  --app-dir platform/memory-service

# pm-agent
WORKSPACE_SVC_URL="http://localhost:8010" LLM_GATEWAY_URL="http://localhost:8030" \
WS_GATEWAY_URL="http://localhost:8020" MEMORY_SVC_URL="http://localhost:8050" \
PORT="8040" python -m uvicorn pm_agent.main:app --host 0.0.0.0 --port 8040 \
  --app-dir agents/pm-agent

# dev-agent
WORKSPACE_SVC_URL="http://localhost:8010" LLM_GATEWAY_URL="http://localhost:8030" \
WS_GATEWAY_URL="http://localhost:8020" GITLAB_URL="https://gitlab.example.com" \
GITLAB_TOKEN="glpat-xxx" PORT="8044" \
python -m uvicorn dev_agent.main:app --host 0.0.0.0 --port 8044 \
  --app-dir agents/dev-agent
```

### 6. Start Frontend

```bash
pnpm install
pnpm dev        # opens http://localhost:3000
```

### Startup Order

```
PostgreSQL → Redis → Qdrant
    ↓          ↓        ↓
workspace-svc  ws-gateway  llm-gateway
    ↓                        ↓
memory-service          rag-pipeline (optional)
    ↓                        ↓
pm-agent ← domain agents (dev, arch, ...)
    ↓
Frontend (Vite)
```

## E2E Verification

### Health Checks

```bash
curl http://localhost:8010/health   # workspace-svc
curl http://localhost:8020/health   # ws-gateway
curl http://localhost:8030/health   # llm-gateway
curl http://localhost:8040/health   # pm-agent
curl http://localhost:8044/health   # dev-agent
curl http://localhost:8050/health   # memory-service
curl http://localhost:6333/healthz  # qdrant
```

### Memory System Verification

```bash
# Add project memory
curl -X POST http://localhost:8050/api/memory/add \
  -H "Content-Type: application/json" \
  -d '{"content":"Project uses React 19 with TypeScript","workspace_id":"test","metadata":{"layer":"project"}}'

# Add org memory (cross-workspace)
curl -X POST http://localhost:8050/api/memory/org/add \
  -H "Content-Type: application/json" \
  -d '{"content":"Company uses chi router for Go services","metadata":{"layer":"org"}}'

# Assemble context (verifies project + org memory retrieval)
curl -X POST http://localhost:8050/api/context/assemble \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"test","user_message":"how to build a component","org_id":"default"}'

# Test feedback loop (PM agent → memory-service)
curl -X POST http://localhost:8040/api/feedback \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"test","action_type":"approve","agent_type":"development","original_output":"good code"}'
```

### Workflow Test

```bash
# NLP dispatch (requires workspace with tasks)
curl -X POST http://localhost:8040/api/nlp \
  -H "Content-Type: application/json" \
  -d '{"workspace_id":"<ws-id>","message":"create a login page"}'
```

## Memory & Knowledge Architecture

VibeOS implements a multi-layered learning system inspired by EvolveR (closed-loop experience lifecycle) and Hindsight (retain/recall/reflect):

```
Agent executes task
    ↓
┌─ add_memory() ─────────→ Mem0 (Project Memory, per workspace)
│
├─ _save_artifact() ──────→ RAG Pipeline (auto-indexed)
│                              ↓
│                          Qdrant (per-workspace collection)
│
├─ workflow:phase_complete → async _trigger_distill()
│                              ↓
│                          Knowledge Service (LLM extracts patterns)
│                              ↓
│                          AGE Graph (cross-workspace knowledge)
│
├─ workflow:task_complete ─→ async _auto_index_to_rag()
│
└─ user feedback (👍/👎) ─→ PM Agent → Memory Service
                              ↓
                          Preference Memory (improves future outputs)
```

### Memory Layers

| Layer | Scope | Storage | Purpose |
|-------|-------|---------|---------|
| L1 Working | Session | Mem0 (session_id) | Short-lived conversation context |
| L2 Project | Workspace | Mem0 (ws:{id}) | Tech stack, patterns, decisions |
| L3 Organization | Global | Mem0 (org:{id}) | Cross-workspace best practices |
| L4 Preference | Workspace | Mem0 (ws:{id}, layer=preference) | User feedback on agent outputs |

## Project Structure

```
any/
├── apps/
│   └── web/                      # React SPA
│       ├── src/
│       │   ├── components/       # UI components
│       │   ├── stores/           # Zustand state
│       │   ├── lib/api.ts        # API client
│       │   ├── i18n/             # en.ts, zh.ts
│       │   └── types/index.ts    # TypeScript types
│       └── vite.config.ts
├── agents/
│   ├── shared/vibeos_agent/      # Agent SDK
│   │   ├── protocol.py           # BaseAgent, clients
│   │   ├── config.py             # Env-backed config
│   │   ├── models.py             # Pydantic models
│   │   ├── session.py            # Redis session manager
│   │   └── tools/                # BaseTool, GitLab/Feishu tools
│   ├── pm-agent/                 # Orchestrator (NLP + workflow)
│   ├── dev-agent/                # Development agent
│   ├── architecture-agent/       # Architecture agent
│   ├── design-agent/             # Design agent
│   ├── requirement-agent/        # Requirement agent
│   ├── test-agent/               # Testing agent
│   ├── cicd-agent/               # CI/CD agent
│   └── monitoring-agent/         # Monitoring agent
├── services/
│   ├── workspace-svc/            # Go REST API
│   │   ├── cmd/main.go
│   │   └── internal/
│   │       ├── handler/          # HTTP handlers
│   │       ├── service/          # Business logic
│   │       ├── store/            # PostgreSQL queries
│   │       └── middleware/       # Auth (JWT)
│   ├── ws-gateway/               # Go WebSocket relay
│   └── shared/models/            # Shared Go DTOs
├── platform/
│   ├── llm-gateway/              # LiteLLM routing
│   ├── memory-service/           # Mem0 + Qdrant
│   ├── rag-pipeline/             # LlamaIndex + Qdrant
│   └── knowledge-service/        # AGE graph + distiller
├── deploy/
│   ├── docker-compose.yml
│   ├── init.sql
│   ├── migrations/
│   └── docker/Dockerfile.*
└── .cursor/rules/                # AI coding conventions
```

## Cursor Rules

The `.cursor/rules/` directory contains AI coding convention files that ensure consistency:

| Rule | Scope | Content |
|------|-------|---------|
| `project-overview.mdc` | Always | Architecture, ports, event types, module refs |
| `go-services.mdc` | `services/**/*.go` | Chi router, handler/service/store layers |
| `python-agents.mdc` | `agents/**/*.py, platform/**/*.py` | BaseAgent, BaseTool, FastAPI patterns |
| `frontend-react.mdc` | `apps/web/src/**/*.{ts,tsx}` | Components, Zustand, Tailwind tokens |
| `frontend-i18n.mdc` | `apps/web/src/**/*.{ts,tsx}` | Dictionary keys, `useT()` usage |
| `design-system.mdc` | `apps/web/src/**/*.{css,tsx}` | Color tokens, utility classes |
| `docker-deploy.mdc` | `deploy/**` | Compose naming, env vars, migrations |
| `rules-maintenance.mdc` | Always | When and how to update rules |
