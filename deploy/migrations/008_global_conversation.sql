-- Migration 008: Global conversation history
-- Makes chat_messages work across all contexts (home, workspace, requirement, agent DM).
-- Breaking change: workspace_id becomes nullable, new scope columns added.

BEGIN;

-- 1. Make workspace_id nullable (home messages have no workspace)
ALTER TABLE chat_messages ALTER COLUMN workspace_id DROP NOT NULL;

-- 2. Make session_id nullable (global messages may skip sessions)
ALTER TABLE chat_messages ALTER COLUMN session_id DROP NOT NULL;

-- 3. Add context_type to distinguish message scopes
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS context_type VARCHAR(16) NOT NULL DEFAULT 'workspace';

-- 4. Add requirement_id for requirement-scoped conversations
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS requirement_id UUID
    REFERENCES requirements(id) ON DELETE SET NULL;

-- 5. Add execution_id for task result traceability
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS execution_id UUID
    REFERENCES agent_executions(id) ON DELETE SET NULL;

-- 6. Indexes for new query patterns
CREATE INDEX IF NOT EXISTS idx_chat_messages_context
    ON chat_messages(context_type, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_home
    ON chat_messages(created_at DESC, id DESC)
    WHERE context_type = 'home';

CREATE INDEX IF NOT EXISTS idx_chat_messages_req
    ON chat_messages(requirement_id, created_at DESC)
    WHERE requirement_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_exec
    ON chat_messages(execution_id)
    WHERE execution_id IS NOT NULL;

COMMIT;
