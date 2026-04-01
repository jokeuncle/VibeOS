-- 011_extensibility.sql
-- MCP servers, dynamic tools, skill bundles, and user context tables.

-- MCP server configurations (workspace-scoped or global)
CREATE TABLE IF NOT EXISTS mcp_servers (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id  UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    transport     TEXT NOT NULL CHECK (transport IN ('stdio', 'sse', 'streamable-http')),
    config        JSONB NOT NULL DEFAULT '{}',
    enabled       BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_workspace ON mcp_servers(workspace_id);

-- Dynamic tool definitions
CREATE TABLE IF NOT EXISTS tool_configs (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id   UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    parameters     JSONB NOT NULL DEFAULT '{}',
    implementation JSONB NOT NULL DEFAULT '{}',
    enabled        BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tool_configs_workspace ON tool_configs(workspace_id);

-- Skill bundles
CREATE TABLE IF NOT EXISTS skills (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    config       JSONB NOT NULL DEFAULT '{}',
    version      TEXT NOT NULL DEFAULT '1.0',
    enabled      BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_skills_workspace ON skills(workspace_id);

-- User context preferences (unique per user + workspace)
CREATE TABLE IF NOT EXISTS user_contexts (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             TEXT NOT NULL,
    workspace_id        UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    custom_instructions TEXT NOT NULL DEFAULT '',
    preferences         JSONB NOT NULL DEFAULT '{}',
    active_skills       TEXT[] NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, workspace_id)
);
CREATE INDEX IF NOT EXISTS idx_user_contexts_user ON user_contexts(user_id);
