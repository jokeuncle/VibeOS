-- 004_requirements.sql
-- Introduce Requirement as a first-class entity with inter-requirement relationships.

BEGIN;

-- Requirements: primary work units that flow through phase pipelines
CREATE TABLE IF NOT EXISTS requirements (
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

CREATE INDEX IF NOT EXISTS idx_requirements_workspace ON requirements(workspace_id);

-- Requirement relationships (dependency graph)
CREATE TABLE IF NOT EXISTS requirement_relations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    source_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES requirements(id) ON DELETE CASCADE,
    relation_type VARCHAR(32) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_id, target_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_req_relations_source ON requirement_relations(source_id);
CREATE INDEX IF NOT EXISTS idx_req_relations_target ON requirement_relations(target_id);

-- Link tasks and artifacts to requirements
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_requirement ON tasks(requirement_id);

ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_artifacts_requirement ON artifacts(requirement_id);

-- Partial unique index for artifact upsert by (workspace_id, task_id, type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_upsert
    ON artifacts(workspace_id, task_id, type) WHERE task_id IS NOT NULL;

COMMIT;
