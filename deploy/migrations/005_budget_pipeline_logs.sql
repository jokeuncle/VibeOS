-- Migration 005: budget settings, pipeline phase configs, execution logs, agent preferred_model

-- Agent preferred model
ALTER TABLE agents ADD COLUMN IF NOT EXISTS preferred_model TEXT;

-- Workspace budget settings (one row per workspace)
CREATE TABLE IF NOT EXISTS workspace_budget_settings (
    workspace_id           UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    daily_spend_limit_usd  NUMERIC(10,4) NOT NULL DEFAULT 10.0,
    alert_threshold_pct    INTEGER       NOT NULL DEFAULT 80,
    updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Pipeline phase configurations (one row per workspace × phase_key)
CREATE TABLE IF NOT EXISTS workspace_pipeline_configs (
    workspace_id     UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    phase_key        TEXT        NOT NULL,
    enabled          BOOLEAN     NOT NULL DEFAULT TRUE,
    require_approval BOOLEAN     NOT NULL DEFAULT FALSE,
    quality_gate     TEXT,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (workspace_id, phase_key)
);

-- Execution logs (agent log entries, append-only)
CREATE TABLE IF NOT EXISTS execution_logs (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    agent_type   TEXT        NOT NULL,
    level        TEXT        NOT NULL DEFAULT 'info',  -- info | warn | error | success
    message      TEXT        NOT NULL,
    task_id      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_logs_workspace_created
    ON execution_logs (workspace_id, created_at DESC);
