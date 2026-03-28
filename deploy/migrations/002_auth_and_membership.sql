-- 002_auth_and_membership.sql
-- Users, workspace membership, and multi-user GitLab credentials

-- ===================================================================
-- Users
-- ===================================================================
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       VARCHAR(255) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    avatar_url  VARCHAR(512),
    status      VARCHAR(32) NOT NULL DEFAULT 'active',  -- active | disabled
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ===================================================================
-- Workspace members (many-to-many: users <-> workspaces)
-- ===================================================================
CREATE TABLE IF NOT EXISTS workspace_members (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         VARCHAR(32) NOT NULL DEFAULT 'editor',  -- owner | editor | viewer
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace ON workspace_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON workspace_members(user_id);

-- ===================================================================
-- GitLab credentials: support multi-user
-- Drop the UNIQUE on gitlab_url so multiple users can register
-- credentials for the same GitLab instance.
-- ===================================================================
ALTER TABLE gitlab_credentials DROP CONSTRAINT IF EXISTS gitlab_credentials_gitlab_url_key;

ALTER TABLE gitlab_credentials ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- New uniqueness: one credential per user per GitLab URL
CREATE UNIQUE INDEX IF NOT EXISTS idx_gitlab_creds_user_url
    ON gitlab_credentials(gitlab_url, user_id)
    WHERE user_id IS NOT NULL;
