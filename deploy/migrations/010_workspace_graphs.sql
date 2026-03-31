-- ===================================================================
-- Workspace-scoped graph definitions
-- Allows each workspace to have custom workflow graphs cloned from
-- global templates or created from scratch in the ControlCenter.
-- ===================================================================

CREATE TABLE IF NOT EXISTS workspace_graphs (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id       UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name               VARCHAR(128) NOT NULL DEFAULT '',
    description        TEXT         NOT NULL DEFAULT '',
    source_template_id UUID,
    graph_def          JSONB        NOT NULL DEFAULT '{}',
    state_schema       JSONB        NOT NULL DEFAULT '{}',
    config             JSONB        NOT NULL DEFAULT '{"checkpointer":"memory","recursion_limit":25}',
    is_active          BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_workspace_graphs_ws ON workspace_graphs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_graphs_active ON workspace_graphs(workspace_id, is_active) WHERE is_active = true;
