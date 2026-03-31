-- Migration 006: structural cleanup — execution-centric model
-- Drop legacy execution_logs (replaced by AgentExecution.steps)
DROP TABLE IF EXISTS execution_logs;

-- Agent executions: persistent, first-class execution records
CREATE TABLE IF NOT EXISTS agent_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL,
    task_ids UUID[] NOT NULL DEFAULT '{}',
    intent_type VARCHAR(128) NOT NULL,
    intent_summary TEXT NOT NULL DEFAULT '',
    triggered_by VARCHAR(32) NOT NULL DEFAULT 'nlp',
    user_message TEXT NOT NULL DEFAULT '',
    chat_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    agent_type VARCHAR(32) NOT NULL,
    steps JSONB NOT NULL DEFAULT '[]',
    result_type VARCHAR(64) NOT NULL DEFAULT 'general',
    result_payload JSONB,
    error_message TEXT NOT NULL DEFAULT '',
    parent_execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_executions_workspace ON agent_executions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agent_executions_requirement ON agent_executions(requirement_id) WHERE requirement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_executions_parent ON agent_executions(parent_execution_id) WHERE parent_execution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_executions_status ON agent_executions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_executions_chat_msg ON agent_executions(chat_message_id) WHERE chat_message_id IS NOT NULL;

-- Add execution tracking columns to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_execution_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS execution_count INT NOT NULL DEFAULT 0;

-- Artifact provenance: replace phase_id/task_id/requirement_id with execution_id
ALTER TABLE artifacts DROP COLUMN IF EXISTS phase_id;
ALTER TABLE artifacts DROP COLUMN IF EXISTS task_id;
ALTER TABLE artifacts DROP COLUMN IF EXISTS requirement_id;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_execution ON artifacts(execution_id) WHERE execution_id IS NOT NULL;
DROP INDEX IF EXISTS idx_artifacts_phase;
DROP INDEX IF EXISTS idx_artifacts_task;
DROP INDEX IF EXISTS idx_artifacts_requirement;
DROP INDEX IF EXISTS idx_artifacts_upsert;

-- Activity scoping: add requirement_id
ALTER TABLE activities ADD COLUMN IF NOT EXISTS requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_activities_requirement ON activities(requirement_id) WHERE requirement_id IS NOT NULL;

-- Agent: remove current_task (derived from latest AgentExecution)
ALTER TABLE agents DROP COLUMN IF EXISTS current_task;
