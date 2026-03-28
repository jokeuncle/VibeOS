-- Migration 003: Data lifecycle management
-- Adds workspace archiving, conversation summaries, cursor pagination support,
-- and the foundation for tiered data display (hot / warm / cold).

BEGIN;

-- =========================================================================
-- 1. Workspace lifecycle: active → archived → deleted (soft)
-- =========================================================================
-- The `status` column already exists (DEFAULT 'active').
-- Add archived_at for lifecycle tracking.
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);

-- =========================================================================
-- 2. Conversation summaries — the "warm tier" for old conversations.
-- When a conversation exceeds a threshold (e.g. 100 messages), the
-- knowledge-service distills it into a summary. The original messages
-- remain in chat_messages but are not eagerly loaded; the summary is
-- shown instead with a "view original" affordance.
-- =========================================================================
CREATE TABLE IF NOT EXISTS conversation_summaries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    session_id      UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    agent_type      VARCHAR(32),
    summary         TEXT NOT NULL,
    key_decisions   JSONB DEFAULT '[]',    -- [{decision, rationale, timestamp}]
    time_range_from TIMESTAMPTZ NOT NULL,
    time_range_to   TIMESTAMPTZ NOT NULL,
    message_count   INT NOT NULL DEFAULT 0,
    distillation_job_id UUID REFERENCES distillation_jobs(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_summaries_workspace
    ON conversation_summaries(workspace_id, time_range_to DESC);
CREATE INDEX IF NOT EXISTS idx_conv_summaries_session
    ON conversation_summaries(session_id);

-- =========================================================================
-- 3. Chat messages: add workspace_id for direct querying without session join,
--    and a cursor-friendly composite index.
-- =========================================================================
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS workspace_id UUID
    REFERENCES workspaces(id) ON DELETE CASCADE;

-- Backfill workspace_id from session if any existing rows
UPDATE chat_messages cm
    SET workspace_id = cs.workspace_id
    FROM chat_sessions cs
    WHERE cm.session_id = cs.id AND cm.workspace_id IS NULL;

-- Cursor pagination index: (workspace_id, created_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS idx_chat_messages_ws_cursor
    ON chat_messages(workspace_id, created_at DESC, id DESC);

-- =========================================================================
-- 4. Activities: cursor pagination index + is_summarized flag
-- =========================================================================
ALTER TABLE activities ADD COLUMN IF NOT EXISTS is_summarized BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_activities_ws_cursor
    ON activities(workspace_id, created_at DESC, id DESC);

-- =========================================================================
-- 5. Artifacts: separate content_size for metadata-only listing
-- =========================================================================
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS content_size INT NOT NULL DEFAULT 0;

-- Backfill content_size for existing rows
UPDATE artifacts SET content_size = octet_length(content) WHERE content_size = 0;

-- =========================================================================
-- 6. Activity summaries — periodic roll-ups for the "warm tier"
-- =========================================================================
CREATE TABLE IF NOT EXISTS activity_summaries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    summary         TEXT NOT NULL,
    key_events      JSONB DEFAULT '[]',    -- [{type, description, timestamp}]
    time_range_from TIMESTAMPTZ NOT NULL,
    time_range_to   TIMESTAMPTZ NOT NULL,
    activity_count  INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_summaries_ws
    ON activity_summaries(workspace_id, time_range_to DESC);

COMMIT;
