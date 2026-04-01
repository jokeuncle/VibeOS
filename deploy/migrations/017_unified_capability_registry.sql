-- 017_unified_capability_registry.sql
-- Extend capability_registry to serve as the unified capability store,
-- absorbing MCP servers and skills alongside agent-registered capabilities.

-- New columns on capability_registry
ALTER TABLE capability_registry
  ADD COLUMN IF NOT EXISTS source_type  VARCHAR(32) NOT NULL DEFAULT 'agent',
  ADD COLUMN IF NOT EXISTS transport    VARCHAR(32) NOT NULL DEFAULT 'http',
  ADD COLUMN IF NOT EXISTS workspace_id UUID        REFERENCES workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mcp_config   JSONB       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skill_config JSONB       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tags         TEXT[]       NOT NULL DEFAULT '{}';

-- Indexes for the new query patterns
CREATE INDEX IF NOT EXISTS idx_capability_source_type  ON capability_registry(source_type);
CREATE INDEX IF NOT EXISTS idx_capability_workspace_id ON capability_registry(workspace_id);
CREATE INDEX IF NOT EXISTS idx_capability_tags         ON capability_registry USING GIN(tags);

-- Migrate MCP server rows into capability_registry.
-- Provider includes workspace_id to avoid cross-workspace collisions.
INSERT INTO capability_registry
  (name, description, provider, source_type, transport, workspace_id, mcp_config, enabled, source)
SELECT
  'mcp.' || ms.name,
  'MCP server: ' || ms.name,
  'mcp:' || ms.name || ':' || COALESCE(ms.workspace_id::TEXT, 'global'),
  'mcp',
  ms.transport,
  ms.workspace_id,
  ms.config,
  ms.enabled,
  'mcp'
FROM mcp_servers ms
ON CONFLICT (name, provider) DO NOTHING;

-- Migrate skills rows into capability_registry.
INSERT INTO capability_registry
  (name, description, provider, source_type, workspace_id, skill_config, enabled, source, version)
SELECT
  'skill.' || s.name,
  s.description,
  'skill:' || COALESCE(s.workspace_id::TEXT, 'global'),
  'skill',
  s.workspace_id,
  s.config,
  s.enabled,
  'skill',
  s.version
FROM skills s
ON CONFLICT (name, provider) DO NOTHING;
