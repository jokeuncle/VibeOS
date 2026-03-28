-- Migration: GitLab integration tables
-- Run once on existing databases that were initialized before this migration.

CREATE TABLE IF NOT EXISTS gitlab_credentials (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gitlab_url  VARCHAR(512) NOT NULL UNIQUE,
    token_enc   TEXT NOT NULL,
    token_hint  VARCHAR(8),
    label       VARCHAR(128),
    created_by  VARCHAR(128),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_repos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    credential_id   UUID NOT NULL REFERENCES gitlab_credentials(id),
    project_id      VARCHAR(255) NOT NULL,
    project_name    VARCHAR(255) NOT NULL,
    project_url     VARCHAR(512),
    role            VARCHAR(32)  NOT NULL DEFAULT 'primary',
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    branch_default  VARCHAR(128) NOT NULL DEFAULT 'main',
    branch_strategy VARCHAR(32)  NOT NULL DEFAULT 'feature',
    phase_types     TEXT[],
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_repos_workspace ON workspace_repos(workspace_id);
