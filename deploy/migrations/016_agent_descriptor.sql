-- 016_agent_descriptor.sql
-- Extend agents table with descriptor fields for the unified control plane.
-- system_prompt_template: workspace-overridable prompt (empty = use code default)
-- tool_manifest: JSON array of tool schemas registered by the agent at boot
-- capabilities: JSON object describing what the agent can do (for LLM routing)

ALTER TABLE agents ADD COLUMN IF NOT EXISTS system_prompt_template TEXT NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS tool_manifest JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS capabilities JSONB NOT NULL DEFAULT '{}'::jsonb;
