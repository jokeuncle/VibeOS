#!/usr/bin/env bash
# Apply migration 005 (agents.preferred_model, budget, pipeline, execution_logs).
# Needed for existing DBs: init.sql only runs when the Postgres data volume is first created.
set -euo pipefail
DEPLOY="$(cd "$(dirname "$0")" && pwd)"
MIG="$DEPLOY/migrations/005_budget_pipeline_logs.sql"

if [[ -n "${DATABASE_URL:-}" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$MIG"
elif command -v docker >/dev/null 2>&1 && [[ -n "$(docker compose -f "$DEPLOY/docker-compose.yml" ps -q postgres 2>/dev/null)" ]]; then
  (cd "$DEPLOY" && docker compose exec -T postgres psql -U vibeos -d vibeos -v ON_ERROR_STOP=1 < "$MIG")
else
  echo 'Neither DATABASE_URL is set nor compose postgres is up.' >&2
  echo '  export DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=disable' >&2
  echo '  or: cd deploy && docker compose up -d postgres && ./apply-migration-005.sh' >&2
  exit 1
fi
echo "Migration 005 applied."
