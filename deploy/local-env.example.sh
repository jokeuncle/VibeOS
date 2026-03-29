#!/usr/bin/env bash
# Copy to deploy/.env (or source this file after editing). Do not commit real secrets.
# From repo root:  set -a && source deploy/.env && set +a

export DATABASE_URL="${DATABASE_URL:-postgres://vibeos:vibeos_dev@localhost:5432/vibeos?sslmode=disable}"

# Volcengine Ark（二选一写入密钥）
export ARK_API_KEY="${ARK_API_KEY:-}"
export LLM_BASE_URL="${LLM_BASE_URL:-https://ark.cn-beijing.volces.com/api/v3}"
export LLM_MODEL="${LLM_MODEL:-doubao-seed-2-0-pro-260215}"

# GitLab（dev-agent / 部分工具）
export GITLAB_URL="${GITLAB_URL:-https://gitlab.example.com}"
export GITLAB_BASE_URL="${GITLAB_BASE_URL:-$GITLAB_URL}"
export GITLAB_TOKEN="${GITLAB_TOKEN:-}"

# 可选：记忆服务走豆包 LLM / 向量时使用
export VOLCENGINE_LLM_MODEL="${VOLCENGINE_LLM_MODEL:-volcengine/doubao-seed-2-0-pro-260215}"
export HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"
