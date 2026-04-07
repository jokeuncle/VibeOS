-- 022_agent_context_config.sql
-- Add context_config JSONB column to agents table.
-- Allows per-agent configuration of upstream context routing:
-- which upstream phases to include, artifact type filters, token budgets,
-- and which intelligence sources (memory/RAG/knowledge) to enable.

ALTER TABLE agents ADD COLUMN IF NOT EXISTS context_config JSONB NOT NULL DEFAULT '{}';
