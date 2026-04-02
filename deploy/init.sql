CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Workspaces
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    progress REAL NOT NULL DEFAULT 0,
    current_phase_id UUID,
    color VARCHAR(32) NOT NULL DEFAULT 'indigo',
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phases
CREATE TABLE phases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    progress REAL NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_phases_workspace ON phases(workspace_id);

-- Requirements: primary work units that flow through phase pipelines
CREATE TABLE requirements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(512) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    current_phase VARCHAR(32) NOT NULL DEFAULT 'requirement',
    priority VARCHAR(8),
    iteration VARCHAR(64) NOT NULL DEFAULT '',
    progress REAL NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_requirements_workspace ON requirements(workspace_id);

-- Requirement relationships (dependency graph)
CREATE TABLE requirement_relations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    relation_type VARCHAR(32) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_id, target_id, relation_type)
);

CREATE INDEX idx_req_relations_source ON requirement_relations(source_id);
CREATE INDEX idx_req_relations_target ON requirement_relations(target_id);

-- Tasks
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phase_id UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL,
    title VARCHAR(512) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    priority VARCHAR(8),
    labels TEXT[] DEFAULT '{}',
    due_date DATE,
    assigned_agent VARCHAR(32),
    last_execution_id UUID,
    execution_count INT NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_phase ON tasks(phase_id);
CREATE INDEX idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX idx_tasks_requirement ON tasks(requirement_id);

-- Activities (Event Sourcing)
CREATE TABLE activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL,
    type VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    agent_type VARCHAR(32),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_workspace ON activities(workspace_id);
CREATE INDEX idx_activities_created ON activities(created_at DESC);
CREATE INDEX idx_activities_requirement ON activities(requirement_id) WHERE requirement_id IS NOT NULL;

-- Agents (per-workspace agent instances)
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    type VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'idle',
    preferred_model TEXT,
    avatar VARCHAR(16) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, type)
);

CREATE INDEX idx_agents_workspace ON agents(workspace_id);

-- Chat sessions
CREATE TABLE chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_type VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, agent_type)
);

-- Chat messages (global: workspace_id + session_id nullable for home context)
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    context_type VARCHAR(16) NOT NULL DEFAULT 'workspace',
    role VARCHAR(16) NOT NULL,
    content TEXT NOT NULL,
    rich_blocks JSONB,
    segments JSONB,
    agent_type VARCHAR(32),
    requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX idx_chat_messages_ws_cursor ON chat_messages(workspace_id, created_at DESC, id DESC);
CREATE INDEX idx_chat_messages_context ON chat_messages(context_type, created_at DESC, id DESC);
CREATE INDEX idx_chat_messages_home ON chat_messages(created_at DESC, id DESC) WHERE context_type = 'home';
CREATE INDEX idx_chat_messages_req ON chat_messages(requirement_id, created_at DESC) WHERE requirement_id IS NOT NULL;

-- Agent executions: persistent, first-class execution records
CREATE TABLE agent_executions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL,
    task_ids UUID[] NOT NULL DEFAULT '{}',
    intent_type VARCHAR(128) NOT NULL,
    intent_summary TEXT NOT NULL DEFAULT '',
    triggered_by VARCHAR(32) NOT NULL DEFAULT 'nlp',
    user_message TEXT NOT NULL DEFAULT '',
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    agent_type VARCHAR(32) NOT NULL,
    steps JSONB NOT NULL DEFAULT '[]',
    result_type VARCHAR(64) NOT NULL DEFAULT 'general',
    result_payload JSONB,
    chat_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    error_message TEXT NOT NULL DEFAULT '',
    parent_execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_executions_workspace ON agent_executions(workspace_id);
CREATE INDEX idx_agent_executions_requirement ON agent_executions(requirement_id) WHERE requirement_id IS NOT NULL;
CREATE INDEX idx_agent_executions_parent ON agent_executions(parent_execution_id) WHERE parent_execution_id IS NOT NULL;
CREATE INDEX idx_agent_executions_status ON agent_executions(workspace_id, status);
CREATE INDEX idx_agent_executions_chat_msg ON agent_executions(chat_message_id) WHERE chat_message_id IS NOT NULL;

-- Back-reference: chat_messages → agent_executions (added after both tables exist)
ALTER TABLE chat_messages ADD COLUMN execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL;
CREATE INDEX idx_chat_messages_exec ON chat_messages(execution_id) WHERE execution_id IS NOT NULL;

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    user_id UUID,
    title VARCHAR(512) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

-- Artifacts produced by agents (schemas, APIs, ADRs, code, docs, etc.)
CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    execution_id UUID REFERENCES agent_executions(id) ON DELETE SET NULL,
    agent_type VARCHAR(32) NOT NULL,
    type VARCHAR(64) NOT NULL,
    title VARCHAR(512) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    metadata JSONB DEFAULT '{}',
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artifacts_workspace ON artifacts(workspace_id);
CREATE INDEX idx_artifacts_execution ON artifacts(execution_id) WHERE execution_id IS NOT NULL;

-- ===================================================================
-- GitLab Integration
-- ===================================================================

-- Per-instance GitLab credentials (shared across workspaces in the same org)
CREATE TABLE gitlab_credentials (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    gitlab_url  VARCHAR(512) NOT NULL UNIQUE,  -- e.g. https://gitlab.example.com
    token_enc   TEXT NOT NULL,                 -- AES-256-GCM encrypted PAT, base64(nonce||ciphertext)
    token_hint  VARCHAR(8),                    -- last 4 chars for UI display only
    label       VARCHAR(128),                  -- friendly name, e.g. "Company GitLab"
    created_by  VARCHAR(128),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workspace ↔ GitLab project bindings (many-to-many)
CREATE TABLE workspace_repos (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    credential_id   UUID NOT NULL REFERENCES gitlab_credentials(id),
    project_id      VARCHAR(255) NOT NULL,   -- numeric "590" or path "fe/vibe-os-first-project"
    project_name    VARCHAR(255) NOT NULL,   -- display name
    project_url     VARCHAR(512),            -- web URL for UI links
    role            VARCHAR(32)  NOT NULL DEFAULT 'primary',
                                             -- primary | secondary | infra | docs
    is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
    branch_default  VARCHAR(128) NOT NULL DEFAULT 'main',
    branch_strategy VARCHAR(32)  NOT NULL DEFAULT 'feature',
                                             -- feature | direct | gitflow
    phase_types     TEXT[],                  -- NULL = all phases; ['development'] = only that phase
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, project_id)
);

CREATE INDEX idx_workspace_repos_workspace ON workspace_repos(workspace_id);

-- ===================================================================
-- Phase 2: Trust Score tracking
-- ===================================================================

CREATE TABLE trust_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model VARCHAR(128) NOT NULL,
    agent_type VARCHAR(32) NOT NULL,
    total_calls INT NOT NULL DEFAULT 0,
    approvals INT NOT NULL DEFAULT 0,
    rejections INT NOT NULL DEFAULT 0,
    score REAL NOT NULL DEFAULT 50.0,
    autonomy VARCHAR(32) NOT NULL DEFAULT 'supervised',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(model, agent_type)
);

-- ===================================================================
-- Phase 2: Feedback signals for preference learning
-- ===================================================================

CREATE TABLE feedback_signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_type VARCHAR(32) NOT NULL,
    action_type VARCHAR(32) NOT NULL,
    context JSONB DEFAULT '{}',
    original_output TEXT,
    modified_output TEXT,
    extracted_preference TEXT,
    preference_category VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_workspace ON feedback_signals(workspace_id, agent_type);
CREATE INDEX idx_feedback_category ON feedback_signals(preference_category);

-- ===================================================================
-- Phase 2: Knowledge distillation audit trail
-- ===================================================================

CREATE TABLE distillation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    target_access_level VARCHAR(32) NOT NULL DEFAULT 'team',
    extracted_count INT DEFAULT 0,
    approved_count INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_distillation_workspace ON distillation_jobs(workspace_id);

-- ===================================================================
-- Phase 2: Apache AGE graph extension (if available)
-- AGE creates its own schema; this just ensures the extension loads.
-- If AGE is not installed, these commands will be skipped gracefully.
-- ===================================================================

DO $$
BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS age';
    EXECUTE 'LOAD ''age''';
    EXECUTE 'SET search_path = ag_catalog, ''$user'', public';
    PERFORM create_graph('vibeos_knowledge');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Apache AGE not available - knowledge graph will be initialized at runtime';
END $$;
