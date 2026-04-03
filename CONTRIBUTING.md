# Contributing to VibeOS

Thanks for your interest in contributing to VibeOS! This guide will help you get started.

## Development Setup

See [README.md](README.md#quick-start) for prerequisites and setup instructions. The TL;DR:

```bash
cp .env.example .env     # Configure LLM API key
make install             # Install all dependencies
make infra               # Start infrastructure containers
make db-init             # Initialize database (first time)
make db-migrate          # Apply migrations
make dev                 # Start all services
```

## How to Contribute

### Reporting Issues

- Search existing issues before opening a new one
- Include steps to reproduce, expected vs actual behavior
- Include relevant logs and your environment (OS, Python/Go/Node versions)

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch from `main`: `git checkout -b feat/your-feature`
3. Make your changes
4. Test locally with `make dev` and `make health`
5. Commit with a descriptive message
6. Push to your fork and open a PR against `main`

### Branch Naming

| Prefix | Purpose |
|--------|---------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `refactor/` | Code restructuring |
| `docs/` | Documentation |
| `chore/` | Build/tooling changes |

### Commit Messages

Write clear, concise commit messages. Use imperative mood:

- "Add memory layer for org-level knowledge"
- "Fix WebSocket reconnection on token expiry"
- "Update llm-gateway to support Anthropic streaming"

## Code Style

### Python (agents, platform services)

- Python 3.12+, type hints everywhere
- Use `uv` for package management
- Follow existing patterns in `agents/shared/vibeos_agent/`
- Tools extend `BaseTool`, agents extend `SDLCAgent` or `BaseAgent`
- FastAPI for HTTP endpoints

### Go (workspace-svc, ws-gateway)

- Go 1.25+
- Chi router, handler/service/store layering
- Shared DTOs in `services/shared/models/`

### TypeScript (frontend)

- React 19, functional components
- Zustand for state management
- Tailwind 4 with design tokens from `@theme` in `index.css`
- pnpm (not npm)

## Project Layout

| Directory | Language | What lives here |
|-----------|----------|----------------|
| `apps/web/` | TypeScript | React SPA |
| `agents/*/` | Python | AI domain agents |
| `agents/shared/` | Python | Shared agent SDK |
| `services/*/` | Go | Backend services |
| `platform/*/` | Python | Platform services (LLM, memory, RAG, knowledge) |
| `deploy/` | SQL/YAML | Docker, migrations, init scripts |

## Adding a New Agent

1. Create `agents/your-agent/your_agent/` with `__init__.py`, `agent.py`, `main.py`
2. Add `pyproject.toml` with `vibeos-agent` as a workspace dependency
3. Register the agent type in `agents/shared/vibeos_agent/models.py`
4. Add a Makefile target and Docker Compose service entry
5. Add port allocation to the README

## Questions?

Open a GitHub issue with the `question` label, or start a discussion.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
