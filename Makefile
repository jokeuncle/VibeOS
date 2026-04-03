# VibeOS Development Makefile
# Usage: copy .env.example to .env, fill in secrets, then run targets below.

-include .env
export

.DEFAULT_GOAL := help

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------

.PHONY: install
install: install-py install-js install-go ## Install all dependencies

.PHONY: install-py
install-py: ## Install Python workspace (all agents + platform services)
	uv sync --all-packages

.PHONY: install-js
install-js: ## Install frontend dependencies
	pnpm install

.PHONY: install-go
install-go: ## Build Go binaries
	cd services/workspace-svc && go build -o workspace-svc ./cmd
	cd services/ws-gateway && go build -o ws-gateway ./cmd

# ---------------------------------------------------------------------------
# Infrastructure (Postgres, Redis, Qdrant via Docker)
# ---------------------------------------------------------------------------

.PHONY: infra
infra: ## Start infrastructure containers
	cd deploy && docker compose up -d postgres redis qdrant

.PHONY: infra-down
infra-down: ## Stop infrastructure containers
	cd deploy && docker compose down

DOCKER_PSQL := docker compose -f deploy/docker-compose.yml exec -T postgres psql -U vibeos -d vibeos

.PHONY: db-init
db-init: ## Initialize database schema
	cat deploy/init.sql | $(DOCKER_PSQL)

.PHONY: db-migrate
db-migrate: ## Apply all migrations
	@for f in deploy/migrations/*.sql; do \
		echo "== Applying $$f =="; \
		cat "$$f" | $(DOCKER_PSQL); \
	done

# ---------------------------------------------------------------------------
# Core services
# ---------------------------------------------------------------------------

.PHONY: run-workspace-svc
run-workspace-svc: ## Run workspace-svc (Go, :8010); rebuilds binary so make dev picks up Go changes
	cd services/workspace-svc && go build -o workspace-svc ./cmd && \
	PORT=8010 REDIS_URL=redis://localhost:6379/0 ./workspace-svc

.PHONY: run-ws-gateway
run-ws-gateway: ## Run ws-gateway (Go, :8020); rebuilds binary so make dev picks up Go changes
	cd services/ws-gateway && go build -o ws-gateway ./cmd && \
	PORT=8020 REDIS_URL=redis://localhost:6379/0 ./ws-gateway

.PHONY: run-llm-gateway
run-llm-gateway: ## Run llm-gateway (:8030)
	VOLCENGINE_API_KEY=$${VOLCENGINE_API_KEY:-$${ARK_API_KEY:-$${LLM_API_KEY:-}}} \
	REDIS_URL=redis://localhost:6379/1 PORT=8030 \
	uv run --package llm-gateway \
		uvicorn llm_gateway.main:app --host 0.0.0.0 --port 8030 --reload

# ---------------------------------------------------------------------------
# Platform services
# ---------------------------------------------------------------------------

.PHONY: run-memory-service
run-memory-service: ## Run memory-service (:8050)
	QDRANT_URL=http://localhost:6333 \
	LLM_GATEWAY_URL=http://localhost:8030 \
	REDIS_URL=redis://localhost:6379/3 PORT=8050 \
	uv run --package memory-service \
		uvicorn memory_service.main:app --host 0.0.0.0 --port 8050 --reload

.PHONY: run-rag-pipeline
run-rag-pipeline: ## Run rag-pipeline (:8060)
	QDRANT_URL=http://localhost:6333 \
	LLM_GATEWAY_URL=http://localhost:8030 \
	REDIS_URL=redis://localhost:6379/4 PORT=8060 \
	uv run --package rag-pipeline \
		uvicorn rag_pipeline.main:app --host 0.0.0.0 --port 8060 --reload

.PHONY: run-knowledge-service
run-knowledge-service: ## Run knowledge-service (:8070)
	LLM_GATEWAY_URL=http://localhost:8030 \
	WORKSPACE_SVC_URL=http://localhost:8010 \
	REDIS_URL=redis://localhost:6379/5 PORT=8070 \
	uv run --package knowledge-service \
		uvicorn knowledge_service.main:app --host 0.0.0.0 --port 8070 --reload

# ---------------------------------------------------------------------------
# Agents
# ---------------------------------------------------------------------------

AGENT_ENV = \
	WORKSPACE_SVC_URL=http://localhost:8010 \
	LLM_GATEWAY_URL=http://localhost:8030 \
	WS_GATEWAY_URL=http://localhost:8020 \
	MEMORY_SVC_URL=http://localhost:8050 \
	RAG_SVC_URL=http://localhost:8060 \
	KNOWLEDGE_SVC_URL=http://localhost:8070 \
	GITLAB_BASE_URL=$(GITLAB_URL)

.PHONY: run-pm-agent
run-pm-agent: ## Run pm-agent (:8040)
	$(AGENT_ENV) REDIS_URL=redis://localhost:6379/2 PORT=8040 \
	uv run --package pm-agent \
		uvicorn pm_agent.main:app --host 0.0.0.0 --port 8040 --reload

.PHONY: run-architecture-agent
run-architecture-agent: ## Run architecture-agent (:8041)
	$(AGENT_ENV) REDIS_URL=redis://localhost:6379/6 PORT=8041 \
	uv run --package architecture-agent \
		uvicorn architecture_agent.main:app --host 0.0.0.0 --port 8041 --reload

.PHONY: run-requirement-agent
run-requirement-agent: ## Run requirement-agent (:8042)
	$(AGENT_ENV) PORT=8042 \
	uv run --package requirement-agent \
		uvicorn requirement_agent.main:app --host 0.0.0.0 --port 8042 --reload

.PHONY: run-design-agent
run-design-agent: ## Run design-agent (:8043)
	$(AGENT_ENV) PORT=8043 \
	uv run --package design-agent \
		uvicorn design_agent.main:app --host 0.0.0.0 --port 8043 --reload

.PHONY: run-dev-agent
run-dev-agent: ## Run dev-agent (:8044)
	$(AGENT_ENV) PORT=8044 \
	uv run --package dev-agent \
		uvicorn dev_agent.main:app --host 0.0.0.0 --port 8044 --reload

.PHONY: run-test-agent
run-test-agent: ## Run test-agent (:8045)
	$(AGENT_ENV) PORT=8045 \
	uv run --package test-agent \
		uvicorn test_agent.main:app --host 0.0.0.0 --port 8045 --reload

.PHONY: run-cicd-agent
run-cicd-agent: ## Run cicd-agent (:8046)
	$(AGENT_ENV) PORT=8046 \
	uv run --package cicd-agent \
		uvicorn cicd_agent.main:app --host 0.0.0.0 --port 8046 --reload

.PHONY: run-monitoring-agent
run-monitoring-agent: ## Run monitoring-agent (:8047)
	$(AGENT_ENV) PORT=8047 \
	uv run --package monitoring-agent \
		uvicorn monitoring_agent.main:app --host 0.0.0.0 --port 8047 --reload

.PHONY: run-coding-agent
run-coding-agent: ## Run coding-agent (:8048)
	$(AGENT_ENV) PORT=8048 \
	uv run --package coding-agent \
		uvicorn coding_agent.main:app --host 0.0.0.0 --port 8048 --reload

# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

.PHONY: run-web
run-web: ## Run frontend dev server (:3000)
	pnpm dev

# ---------------------------------------------------------------------------
# Convenience
# ---------------------------------------------------------------------------

SERVICE_PORTS := 8010 8020 8030 8040 8041 8044 8048 8050 8060 8070 3000

.PHONY: stop
stop: ## Stop all dev services (by port)
	@for port in $(SERVICE_PORTS); do \
		pids=$$(lsof -ti :$$port 2>/dev/null | tr '\n' ' '); \
		if [ -n "$$pids" ]; then \
			kill $$pids 2>/dev/null; \
			printf "Stopped port %-5s (pid %s)\n" "$$port" "$$pids"; \
		fi; \
	done

.PHONY: dev
dev: stop ## Start all core services (infra + backend + frontend, backgrounded)
	@echo "Starting infrastructure..."
	@$(MAKE) infra
	@echo ""
	@echo "Starting backend services in background..."
	@$(MAKE) run-workspace-svc &
	@$(MAKE) run-ws-gateway &
	@$(MAKE) run-llm-gateway &
	@$(MAKE) run-memory-service &
	@$(MAKE) run-rag-pipeline &
	@$(MAKE) run-knowledge-service &
	@$(MAKE) run-pm-agent &
	@$(MAKE) run-dev-agent &
	@$(MAKE) run-architecture-agent &
	@$(MAKE) run-coding-agent &
	@sleep 3
	@echo ""
	@echo "Starting frontend..."
	@$(MAKE) run-web

.PHONY: health
health: ## Check health of all running services
	@printf "%-22s %s\n" "SERVICE" "STATUS"
	@printf "%-22s %s\n" "---------------------" "------"
	@for svc in \
		"workspace-svc:8010" "ws-gateway:8020" "llm-gateway:8030" \
		"pm-agent:8040" "architecture-agent:8041" "dev-agent:8044" "coding-agent:8048" \
		"memory-service:8050" "rag-pipeline:8060" "knowledge-service:8070"; \
	do \
		name=$${svc%%:*}; port=$${svc##*:}; \
		if curl -sf "http://localhost:$$port/health" > /dev/null 2>&1; then \
			printf "%-22s \033[32mOK\033[0m\n" "$$name"; \
		else \
			printf "%-22s \033[31mDOWN\033[0m\n" "$$name"; \
		fi; \
	done

.PHONY: clean
clean: ## Remove build artifacts and caches
	rm -f services/workspace-svc/workspace-svc
	rm -f services/ws-gateway/ws-gateway
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' Makefile | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'
