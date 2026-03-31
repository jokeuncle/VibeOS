-- 009_registry.sql
-- Global Intent-Task-Capability Registry tables.

-- ===================================================================
-- Intent Registry: recognizable user intents (data-driven NLU)
-- ===================================================================

CREATE TABLE IF NOT EXISTS intent_registry (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(64)  NOT NULL UNIQUE,
    label_zh    VARCHAR(128) NOT NULL DEFAULT '',
    label_en    VARCHAR(128) NOT NULL DEFAULT '',
    hint        TEXT         NOT NULL DEFAULT '',
    slots_schema JSONB       NOT NULL DEFAULT '{}',
    context_scopes TEXT[]    NOT NULL DEFAULT '{}',
    priority    INT          NOT NULL DEFAULT 0,
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    source      VARCHAR(128) NOT NULL DEFAULT 'system',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intent_registry_enabled ON intent_registry(enabled);

-- ===================================================================
-- Task Template Registry: intent → task resolution rules
-- ===================================================================

CREATE TABLE IF NOT EXISTS task_template_registry (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    intent_pattern VARCHAR(128) NOT NULL,
    context     VARCHAR(32)  NOT NULL DEFAULT '*',
    task_type   VARCHAR(32)  NOT NULL DEFAULT 'atomic',
    required_capabilities TEXT[] NOT NULL DEFAULT '{}',
    params_mapping JSONB    NOT NULL DEFAULT '{}',
    handler_type VARCHAR(32) NOT NULL DEFAULT 'capability',
    handler_ref  VARCHAR(256) NOT NULL DEFAULT '',
    priority    INT          NOT NULL DEFAULT 0,
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    source      VARCHAR(128) NOT NULL DEFAULT 'system',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_template_intent ON task_template_registry(intent_pattern);
CREATE INDEX IF NOT EXISTS idx_task_template_enabled ON task_template_registry(enabled);

-- ===================================================================
-- Capability Registry: agent-provided capabilities
-- ===================================================================

CREATE TABLE IF NOT EXISTS capability_registry (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(128) NOT NULL,
    description TEXT         NOT NULL DEFAULT '',
    provider    VARCHAR(64)  NOT NULL,
    endpoint    VARCHAR(512) NOT NULL DEFAULT '',
    input_schema  JSONB      NOT NULL DEFAULT '{}',
    output_schema JSONB      NOT NULL DEFAULT '{}',
    constraints   JSONB      NOT NULL DEFAULT '{}',
    version     VARCHAR(32)  NOT NULL DEFAULT '1.0.0',
    health      VARCHAR(32)  NOT NULL DEFAULT 'healthy',
    last_heartbeat TIMESTAMPTZ,
    enabled     BOOLEAN      NOT NULL DEFAULT TRUE,
    source      VARCHAR(128) NOT NULL DEFAULT 'system',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(name, provider)
);

CREATE INDEX IF NOT EXISTS idx_capability_provider ON capability_registry(provider);
CREATE INDEX IF NOT EXISTS idx_capability_enabled  ON capability_registry(enabled);
CREATE INDEX IF NOT EXISTS idx_capability_health   ON capability_registry(health);
