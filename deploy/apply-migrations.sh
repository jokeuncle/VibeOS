#!/usr/bin/env bash
# Apply all pending migrations in order (001 → 014).
# Safe to re-run: all DDL uses IF NOT EXISTS / ALTER ... ADD COLUMN IF NOT EXISTS.
set -euo pipefail

DEPLOY="$(cd "$(dirname "$0")" && pwd)"
MIG_DIR="$DEPLOY/migrations"

MIGRATIONS=(
  "001_gitlab_integration.sql"
  "002_auth_and_membership.sql"
  "003_data_lifecycle.sql"
  "004_requirements.sql"
  "005_budget_pipeline_logs.sql"
  "006_agent_executions.sql"
  "007_global_gitlab_credential.sql"
  "008_global_conversation.sql"
  "009_registry.sql"
  "010_workspace_graphs.sql"
  "011_extensibility.sql"
  "014_pipeline_graph_id.sql"
)

run_psql() {
  local file="$1"
  if [[ -n "${DATABASE_URL:-}" ]]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
  elif command -v docker >/dev/null 2>&1 && \
       [[ -n "$(docker compose -f "$DEPLOY/docker-compose.yml" ps -q postgres 2>/dev/null)" ]]; then
    (cd "$DEPLOY" && docker compose exec -T postgres psql -U vibeos -d vibeos -v ON_ERROR_STOP=1 < "$file")
  else
    echo 'Neither DATABASE_URL is set nor compose postgres is up.' >&2
    echo '  export DATABASE_URL=postgres://vibeos:vibeos@localhost:5432/vibeos?sslmode=disable' >&2
    echo '  or: cd deploy && docker compose up -d postgres && ./apply-migrations.sh' >&2
    exit 1
  fi
}

for mig in "${MIGRATIONS[@]}"; do
  path="$MIG_DIR/$mig"
  if [[ ! -f "$path" ]]; then
    echo "WARNING: $path not found, skipping." >&2
    continue
  fi
  echo "==> Applying $mig ..."
  run_psql "$path"
  echo "    Done."
done

echo ""
echo "All migrations applied successfully."
