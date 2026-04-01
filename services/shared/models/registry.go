package models

import (
	"encoding/json"
	"time"
)

// ---------------------------------------------------------------------------
// Intent Registry
// ---------------------------------------------------------------------------

type IntentRegistryEntry struct {
	ID            string          `json:"id" db:"id"`
	Name          string          `json:"name" db:"name"`
	LabelZh       string          `json:"labelZh" db:"label_zh"`
	LabelEn       string          `json:"labelEn" db:"label_en"`
	Hint          string          `json:"hint" db:"hint"`
	SlotsSchema   json.RawMessage `json:"slotsSchema" db:"slots_schema"`
	ContextScopes []string        `json:"contextScopes" db:"context_scopes"`
	Priority      int             `json:"priority" db:"priority"`
	Enabled       bool            `json:"enabled" db:"enabled"`
	Source        string          `json:"source" db:"source"`
	CreatedAt     time.Time       `json:"createdAt" db:"created_at"`
	UpdatedAt     time.Time       `json:"updatedAt" db:"updated_at"`
}

type CreateIntentReq struct {
	Name          string          `json:"name"`
	LabelZh       string          `json:"labelZh"`
	LabelEn       string          `json:"labelEn"`
	Hint          string          `json:"hint"`
	SlotsSchema   json.RawMessage `json:"slotsSchema,omitempty"`
	ContextScopes []string        `json:"contextScopes,omitempty"`
	Priority      *int            `json:"priority,omitempty"`
	Enabled       *bool           `json:"enabled,omitempty"`
	Source        string          `json:"source,omitempty"`
}

type UpdateIntentReq struct {
	LabelZh       *string          `json:"labelZh,omitempty"`
	LabelEn       *string          `json:"labelEn,omitempty"`
	Hint          *string          `json:"hint,omitempty"`
	SlotsSchema   *json.RawMessage `json:"slotsSchema,omitempty"`
	ContextScopes *[]string        `json:"contextScopes,omitempty"`
	Priority      *int             `json:"priority,omitempty"`
	Enabled       *bool            `json:"enabled,omitempty"`
	Source        *string          `json:"source,omitempty"`
}

// ---------------------------------------------------------------------------
// Task Template Registry
// ---------------------------------------------------------------------------

type TaskTemplateEntry struct {
	ID                   string          `json:"id" db:"id"`
	IntentPattern        string          `json:"intentPattern" db:"intent_pattern"`
	Context              string          `json:"context" db:"context"`
	TaskType             string          `json:"taskType" db:"task_type"`
	RequiredCapabilities []string        `json:"requiredCapabilities" db:"required_capabilities"`
	ParamsMapping        json.RawMessage `json:"paramsMapping" db:"params_mapping"`
	HandlerType          string          `json:"handlerType" db:"handler_type"`
	HandlerRef           string          `json:"handlerRef" db:"handler_ref"`
	GraphDef             json.RawMessage `json:"graphDef" db:"graph_def"`
	StateSchema          json.RawMessage `json:"stateSchema" db:"state_schema"`
	Priority             int             `json:"priority" db:"priority"`
	Enabled              bool            `json:"enabled" db:"enabled"`
	Source               string          `json:"source" db:"source"`
	CreatedAt            time.Time       `json:"createdAt" db:"created_at"`
	UpdatedAt            time.Time       `json:"updatedAt" db:"updated_at"`
}

type CreateTaskTemplateReq struct {
	IntentPattern        string          `json:"intentPattern"`
	Context              string          `json:"context,omitempty"`
	TaskType             string          `json:"taskType,omitempty"`
	RequiredCapabilities []string        `json:"requiredCapabilities,omitempty"`
	ParamsMapping        json.RawMessage `json:"paramsMapping,omitempty"`
	HandlerType          string          `json:"handlerType,omitempty"`
	HandlerRef           string          `json:"handlerRef,omitempty"`
	GraphDef             json.RawMessage `json:"graphDef,omitempty"`
	StateSchema          json.RawMessage `json:"stateSchema,omitempty"`
	Priority             *int            `json:"priority,omitempty"`
	Enabled              *bool           `json:"enabled,omitempty"`
	Source               string          `json:"source,omitempty"`
}

type UpdateTaskTemplateReq struct {
	IntentPattern        *string          `json:"intentPattern,omitempty"`
	Context              *string          `json:"context,omitempty"`
	TaskType             *string          `json:"taskType,omitempty"`
	RequiredCapabilities *[]string        `json:"requiredCapabilities,omitempty"`
	ParamsMapping        *json.RawMessage `json:"paramsMapping,omitempty"`
	HandlerType          *string          `json:"handlerType,omitempty"`
	HandlerRef           *string          `json:"handlerRef,omitempty"`
	GraphDef             *json.RawMessage `json:"graphDef,omitempty"`
	StateSchema          *json.RawMessage `json:"stateSchema,omitempty"`
	Priority             *int             `json:"priority,omitempty"`
	Enabled              *bool            `json:"enabled,omitempty"`
	Source               *string          `json:"source,omitempty"`
}

// ---------------------------------------------------------------------------
// Capability Registry
// ---------------------------------------------------------------------------

type CapabilityEntry struct {
	ID               string          `json:"id" db:"id"`
	Name             string          `json:"name" db:"name"`
	Description      string          `json:"description" db:"description"`
	Provider         string          `json:"provider" db:"provider"`
	Endpoint         string          `json:"endpoint" db:"endpoint"`
	InputSchema      json.RawMessage `json:"inputSchema" db:"input_schema"`
	OutputSchema     json.RawMessage `json:"outputSchema" db:"output_schema"`
	Constraints      json.RawMessage `json:"constraints" db:"constraints"`
	Version          string          `json:"version" db:"version"`
	Health           string          `json:"health" db:"health"`
	LastHeartbeat    *time.Time      `json:"lastHeartbeat,omitempty" db:"last_heartbeat"`
	NodeConfigSchema json.RawMessage `json:"nodeConfigSchema" db:"node_config_schema"`
	SupportsStreaming bool           `json:"supportsStreaming" db:"supports_streaming"`
	Enabled          bool            `json:"enabled" db:"enabled"`
	Source           string          `json:"source" db:"source"`
	SourceType       string          `json:"sourceType" db:"source_type"`
	Transport        string          `json:"transport" db:"transport"`
	WorkspaceID      *string         `json:"workspaceId,omitempty" db:"workspace_id"`
	MCPConfig        json.RawMessage `json:"mcpConfig" db:"mcp_config"`
	SkillConfig      json.RawMessage `json:"skillConfig" db:"skill_config"`
	Tags             []string        `json:"tags" db:"tags"`
	CreatedAt        time.Time       `json:"createdAt" db:"created_at"`
	UpdatedAt        time.Time       `json:"updatedAt" db:"updated_at"`
}

type CreateCapabilityReq struct {
	Name             string          `json:"name"`
	Description      string          `json:"description,omitempty"`
	Provider         string          `json:"provider"`
	Endpoint         string          `json:"endpoint,omitempty"`
	InputSchema      json.RawMessage `json:"inputSchema,omitempty"`
	OutputSchema     json.RawMessage `json:"outputSchema,omitempty"`
	Constraints      json.RawMessage `json:"constraints,omitempty"`
	Version          string          `json:"version,omitempty"`
	NodeConfigSchema json.RawMessage `json:"nodeConfigSchema,omitempty"`
	SupportsStreaming *bool          `json:"supportsStreaming,omitempty"`
	Enabled          *bool           `json:"enabled,omitempty"`
	Source           string          `json:"source,omitempty"`
	SourceType       string          `json:"sourceType,omitempty"`
	Transport        string          `json:"transport,omitempty"`
	WorkspaceID      *string         `json:"workspaceId,omitempty"`
	MCPConfig        json.RawMessage `json:"mcpConfig,omitempty"`
	SkillConfig      json.RawMessage `json:"skillConfig,omitempty"`
	Tags             []string        `json:"tags,omitempty"`
}

type UpdateCapabilityReq struct {
	Description      *string          `json:"description,omitempty"`
	Endpoint         *string          `json:"endpoint,omitempty"`
	InputSchema      *json.RawMessage `json:"inputSchema,omitempty"`
	OutputSchema     *json.RawMessage `json:"outputSchema,omitempty"`
	Constraints      *json.RawMessage `json:"constraints,omitempty"`
	Version          *string          `json:"version,omitempty"`
	Health           *string          `json:"health,omitempty"`
	NodeConfigSchema *json.RawMessage `json:"nodeConfigSchema,omitempty"`
	SupportsStreaming *bool           `json:"supportsStreaming,omitempty"`
	Enabled          *bool            `json:"enabled,omitempty"`
	Source           *string          `json:"source,omitempty"`
	SourceType       *string          `json:"sourceType,omitempty"`
	Transport        *string          `json:"transport,omitempty"`
	WorkspaceID      *string          `json:"workspaceId,omitempty"`
	MCPConfig        *json.RawMessage `json:"mcpConfig,omitempty"`
	SkillConfig      *json.RawMessage `json:"skillConfig,omitempty"`
	Tags             *[]string        `json:"tags,omitempty"`
}

// ---------------------------------------------------------------------------
// Workspace Graph (per-workspace custom workflow graphs)
// ---------------------------------------------------------------------------

type WorkspaceGraph struct {
	ID               string          `json:"id" db:"id"`
	WorkspaceID      string          `json:"workspaceId" db:"workspace_id"`
	Name             string          `json:"name" db:"name"`
	Description      string          `json:"description" db:"description"`
	SourceTemplateID *string         `json:"sourceTemplateId,omitempty" db:"source_template_id"`
	GraphDef         json.RawMessage `json:"graphDef" db:"graph_def"`
	StateSchema      json.RawMessage `json:"stateSchema" db:"state_schema"`
	Config           json.RawMessage `json:"config" db:"config"`
	IsActive         bool            `json:"isActive" db:"is_active"`
	CreatedAt        time.Time       `json:"createdAt" db:"created_at"`
	UpdatedAt        time.Time       `json:"updatedAt" db:"updated_at"`
}

type CreateWorkspaceGraphReq struct {
	Name             string          `json:"name"`
	Description      string          `json:"description,omitempty"`
	SourceTemplateID string          `json:"sourceTemplateId,omitempty"`
	GraphDef         json.RawMessage `json:"graphDef,omitempty"`
	StateSchema      json.RawMessage `json:"stateSchema,omitempty"`
	Config           json.RawMessage `json:"config,omitempty"`
	IsActive         *bool           `json:"isActive,omitempty"`
}

type UpdateWorkspaceGraphReq struct {
	Name        *string          `json:"name,omitempty"`
	Description *string          `json:"description,omitempty"`
	GraphDef    *json.RawMessage `json:"graphDef,omitempty"`
	StateSchema *json.RawMessage `json:"stateSchema,omitempty"`
	Config      *json.RawMessage `json:"config,omitempty"`
	IsActive    *bool            `json:"isActive,omitempty"`
}

// ---------------------------------------------------------------------------
// Bulk registration (Agent Manifest pattern)
// ---------------------------------------------------------------------------

type AgentManifestReq struct {
	AgentType    string                `json:"agentType"`
	Version      string                `json:"version,omitempty"`
	Source       string                `json:"source,omitempty"`
	Intents      []CreateIntentReq     `json:"intents,omitempty"`
	Templates    []CreateTaskTemplateReq `json:"templates,omitempty"`
	Capabilities []CreateCapabilityReq `json:"capabilities,omitempty"`
}
