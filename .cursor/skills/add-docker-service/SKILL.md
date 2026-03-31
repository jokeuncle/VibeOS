---
name: add-docker-service
description: Add a new service to the Docker Compose deployment stack. Use when containerizing a new microservice, agent, or platform component for VibeOS.
---

# Add Docker Compose Service

## Workflow checklist

```
- [ ] Step 1: Create Dockerfile
- [ ] Step 2: Add docker-compose entry
- [ ] Step 3: Allocate Redis DB index (if needed)
- [ ] Step 4: Update docs and rules
```

## Step 1: Dockerfile

File: `deploy/docker/Dockerfile.<service-name>`

**Go service template:**

```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /src
COPY services/shared/ services/shared/
COPY services/<name>/ services/<name>/
WORKDIR /src/services/<name>
RUN go mod download && go build -o /app ./cmd

FROM alpine:3.19
COPY --from=builder /app /app
EXPOSE 80XX
CMD ["/app"]
```

**Python service template:**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY agents/shared/ agents/shared/
COPY agents/<name>-agent/ agents/<name>-agent/
RUN pip install --no-cache-dir agents/shared/ agents/<name>-agent/
EXPOSE 80XX
CMD ["uvicorn", "<pkg>.main:app", "--host", "0.0.0.0", "--port", "80XX"]
```

**Platform Python service template:**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY platform/<name>/ platform/<name>/
RUN pip install --no-cache-dir platform/<name>/
EXPOSE 80XX
CMD ["uvicorn", "<pkg>.main:app", "--host", "0.0.0.0", "--port", "80XX"]
```

Key: Build context is always `../` (repo root), not the service directory.

## Step 2: docker-compose entry

File: `deploy/docker-compose.yml`

```yaml
  <service-name>:
    build:
      context: ../
      dockerfile: deploy/docker/Dockerfile.<service-name>
    ports:
      - "80XX:80XX"
    environment:
      PORT: "80XX"
      # Standard service URLs for agents:
      LLM_GATEWAY_URL: http://llm-gateway:8030
      WORKSPACE_SVC_URL: http://workspace-svc:8010
      WS_GATEWAY_URL: http://ws-gateway:8020
      # Add REDIS_URL with unique DB index:
      REDIS_URL: redis://redis:6379/N
    depends_on:
      - llm-gateway
      - workspace-svc
      - ws-gateway
```

**Service naming:** kebab-case matching directory name (e.g. `dev-agent`, `memory-service`).

**Health checks** (if the service exposes `/health`):

```yaml
    healthcheck:
      test: ["CMD-SHELL", "wget -q --spider http://localhost:80XX/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
```

## Step 3: Redis DB index

Current allocations (check `README.md` for latest):

| DB | Service |
|----|---------|
| 0 | workspace-svc, ws-gateway |
| 1 | llm-gateway |
| 2 | pm-agent |
| 3 | memory-service |
| 4 | rag-pipeline |
| 5 | knowledge-service |

Pick the next unused index and update `README.md` and `.cursor/rules/docker-deploy.mdc`.

## Step 4: Update docs and rules

- `README.md`: add port to ports table, add Redis DB mapping, add env vars
- `.cursor/rules/project-overview.mdc`: add port mapping
- `.cursor/rules/docker-deploy.mdc`: add Redis DB index if applicable
- `apps/web/vite.config.ts`: add Vite proxy rule if frontend calls this service directly

## Verification

```bash
cd deploy
docker compose build <service-name>
docker compose up <service-name>
curl http://localhost:80XX/health
```
