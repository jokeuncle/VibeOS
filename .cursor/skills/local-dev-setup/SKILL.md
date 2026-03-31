---
name: local-dev-setup
description: Set up and verify the local development environment for VibeOS. Use when onboarding new developers, rebuilding the environment, or troubleshooting startup issues.
---

# Local Development Setup

## Prerequisites

- Docker & Docker Compose
- Go 1.23+
- Python 3.12+
- Node.js 20+ with pnpm

## Startup checklist

```
- [ ] Step 1: Start infrastructure (Postgres, Redis, Qdrant)
- [ ] Step 2: Initialize / migrate database
- [ ] Step 3: Start Go services
- [ ] Step 4: Start Python agents
- [ ] Step 5: Start frontend
- [ ] Step 6: Verify health
```

## Step 1: Infrastructure

```bash
cd deploy
docker compose up -d postgres redis qdrant
```

Wait for health checks:

```bash
docker compose ps  # all three should show "healthy"
```

## Step 2: Database

**First time** (empty volume): Postgres auto-runs `init.sql` via the Docker entrypoint mount.

**Existing database** (after pulling new migrations):

```bash
cd deploy
./apply-migrations.sh
```

## Step 3: Go services

Terminal 1 — workspace-svc:

```bash
cd services/workspace-svc
export DATABASE_URL=postgres://vibeos:vibeos_dev@localhost:5432/vibeos?sslmode=disable
export REDIS_URL=redis://localhost:6379/0
go run ./cmd
```

Terminal 2 — ws-gateway:

```bash
cd services/ws-gateway
export REDIS_URL=redis://localhost:6379/0
go run ./cmd
```

Optional env vars for workspace-svc: `GITLAB_URL`, `GITLAB_TOKEN` (auto-upserts a global credential on startup).

## Step 4: Python agents

Install shared SDK (once):

```bash
cd agents/shared && pip install -e ".[tools,gitlab,feishu]"
```

Terminal 3 — pm-agent (orchestrator, required):

```bash
cd agents/pm-agent && pip install -e .
export LLM_GATEWAY_URL=http://localhost:8030
export WORKSPACE_SVC_URL=http://localhost:8010
export WS_GATEWAY_URL=http://localhost:8020
uvicorn pm_agent.main:app --port 8040 --reload
```

Terminal 4+ — domain agents (start as needed):

```bash
cd agents/dev-agent && pip install -e .
uvicorn dev_agent.main:app --port 8044 --reload
```

Platform services (start as needed):

```bash
cd platform/llm-gateway && pip install -e .
uvicorn llm_gateway.main:app --port 8030 --reload

cd platform/memory-service && pip install -e .
uvicorn memory_service.main:app --port 8050 --reload
```

## Step 5: Frontend

```bash
cd apps/web
pnpm install
pnpm dev
```

Opens at http://localhost:3000. Vite proxies API calls to backend services automatically.

## Step 6: Health verification

```bash
curl http://localhost:8010/health   # workspace-svc
curl http://localhost:8020/health   # ws-gateway
curl http://localhost:8030/health   # llm-gateway
curl http://localhost:8040/health   # pm-agent
curl http://localhost:8044/health   # dev-agent
curl http://localhost:8050/health   # memory-service
```

All should return `{"status":"ok", ...}`.

## Port reference

| Service | Port | Required |
|---------|------|----------|
| Postgres | 5432 | Yes |
| Redis | 6379 | Yes |
| Qdrant | 6333 | Yes (for memory/RAG) |
| workspace-svc | 8010 | Yes |
| ws-gateway | 8020 | Yes |
| llm-gateway | 8030 | Yes (for agent LLM calls) |
| pm-agent | 8040 | Yes |
| architecture-agent | 8041 | Optional |
| requirement-agent | 8042 | Optional |
| design-agent | 8043 | Optional |
| dev-agent | 8044 | Optional |
| test-agent | 8045 | Optional |
| cicd-agent | 8046 | Optional |
| monitoring-agent | 8047 | Optional |
| memory-service | 8050 | Optional |
| rag-pipeline | 8060 | Optional |
| knowledge-service | 8070 | Optional |

## Troubleshooting

- **"failed to connect to database"**: Check Postgres is healthy and `DATABASE_URL` is correct
- **"redis not available"**: Redis may still be starting; workspace-svc continues without it (events disabled)
- **Agent "服务未启动"**: The domain agent's uvicorn process is not running; start it or check the port
- **Frontend 502/proxy errors**: The target backend service is not running on the expected port
- **Qdrant connection errors**: Memory/RAG services need Qdrant at localhost:6333
