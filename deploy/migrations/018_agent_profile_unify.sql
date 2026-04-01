-- 018_agent_profile_unify.sql
-- Merge pipeline config fields into the agents table so that each agent row
-- becomes a complete "Agent Profile" (single source of truth).
-- The workspace_pipeline_configs table is kept for backward compatibility
-- but new code reads from agents exclusively.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS require_approval BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS quality_gate TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS graph_id UUID REFERENCES workspace_graphs(id) ON DELETE SET NULL;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS trust_threshold NUMERIC(5,2) NOT NULL DEFAULT 50.0;

-- Migrate existing pipeline config data into agents
UPDATE agents a
SET enabled = COALESCE(p.enabled, TRUE),
    require_approval = COALESCE(p.require_approval, FALSE),
    quality_gate = p.quality_gate,
    graph_id = p.graph_id
FROM workspace_pipeline_configs p
WHERE a.workspace_id = p.workspace_id AND a.type = p.phase_key;
