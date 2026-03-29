#!/usr/bin/env bash
# Start infrastructure + app stack from deploy/docker-compose.yml
# Usage: ./start-all.sh   OR   ARK_API_KEY=... GITLAB_TOKEN=... ./start-all.sh
set -euo pipefail
cd "$(dirname "$0")"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Align with README: Ark key can be ARK_API_KEY or LLM_API_KEY
export ARK_API_KEY="${ARK_API_KEY:-${LLM_API_KEY:-}}"
export LLM_BASE_URL="${LLM_BASE_URL:-https://ark.cn-beijing.volces.com/api/v3}"

exec docker compose up -d --build "$@"
