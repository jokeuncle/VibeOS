package models

import (
	"encoding/json"
	"time"
)

// ---------------------------------------------------------------------------
// MCP Server Configuration
// ---------------------------------------------------------------------------

type MCPServer struct {
	ID          string          `json:"id" db:"id"`
	WorkspaceID *string         `json:"workspaceId,omitempty" db:"workspace_id"`
	Name        string          `json:"name" db:"name"`
	Transport   string          `json:"transport" db:"transport"`
	Config      json.RawMessage `json:"config" db:"config"`
	Enabled     bool            `json:"enabled" db:"enabled"`
	CreatedAt   time.Time       `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time       `json:"updatedAt" db:"updated_at"`
}

type CreateMCPServerReq struct {
	WorkspaceID *string         `json:"workspaceId,omitempty"`
	Name        string          `json:"name"`
	Transport   string          `json:"transport"`
	Config      json.RawMessage `json:"config,omitempty"`
	Enabled     *bool           `json:"enabled,omitempty"`
}

type UpdateMCPServerReq struct {
	Name      *string          `json:"name,omitempty"`
	Transport *string          `json:"transport,omitempty"`
	Config    *json.RawMessage `json:"config,omitempty"`
	Enabled   *bool            `json:"enabled,omitempty"`
}

// ---------------------------------------------------------------------------
// Dynamic Tool Configuration
// ---------------------------------------------------------------------------

type ToolConfig struct {
	ID             string          `json:"id" db:"id"`
	WorkspaceID    *string         `json:"workspaceId,omitempty" db:"workspace_id"`
	Name           string          `json:"name" db:"name"`
	Description    string          `json:"description" db:"description"`
	Parameters     json.RawMessage `json:"parameters" db:"parameters"`
	Implementation json.RawMessage `json:"implementation" db:"implementation"`
	Enabled        bool            `json:"enabled" db:"enabled"`
	CreatedAt      time.Time       `json:"createdAt" db:"created_at"`
	UpdatedAt      time.Time       `json:"updatedAt" db:"updated_at"`
}

type CreateToolConfigReq struct {
	WorkspaceID    *string         `json:"workspaceId,omitempty"`
	Name           string          `json:"name"`
	Description    string          `json:"description,omitempty"`
	Parameters     json.RawMessage `json:"parameters,omitempty"`
	Implementation json.RawMessage `json:"implementation"`
	Enabled        *bool           `json:"enabled,omitempty"`
}

type UpdateToolConfigReq struct {
	Name           *string          `json:"name,omitempty"`
	Description    *string          `json:"description,omitempty"`
	Parameters     *json.RawMessage `json:"parameters,omitempty"`
	Implementation *json.RawMessage `json:"implementation,omitempty"`
	Enabled        *bool            `json:"enabled,omitempty"`
}

// ---------------------------------------------------------------------------
// Skill Bundle
// ---------------------------------------------------------------------------

type Skill struct {
	ID          string          `json:"id" db:"id"`
	WorkspaceID *string         `json:"workspaceId,omitempty" db:"workspace_id"`
	Name        string          `json:"name" db:"name"`
	Description string          `json:"description" db:"description"`
	Config      json.RawMessage `json:"config" db:"config"`
	Version     string          `json:"version" db:"version"`
	Enabled     bool            `json:"enabled" db:"enabled"`
	CreatedAt   time.Time       `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time       `json:"updatedAt" db:"updated_at"`
}

type CreateSkillReq struct {
	WorkspaceID *string         `json:"workspaceId,omitempty"`
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	Config      json.RawMessage `json:"config"`
	Version     string          `json:"version,omitempty"`
	Enabled     *bool           `json:"enabled,omitempty"`
}

type UpdateSkillReq struct {
	Name        *string          `json:"name,omitempty"`
	Description *string          `json:"description,omitempty"`
	Config      *json.RawMessage `json:"config,omitempty"`
	Version     *string          `json:"version,omitempty"`
	Enabled     *bool            `json:"enabled,omitempty"`
}

// ---------------------------------------------------------------------------
// User Context Preferences
// ---------------------------------------------------------------------------

type UserContext struct {
	ID                 string          `json:"id" db:"id"`
	UserID             string          `json:"userId" db:"user_id"`
	WorkspaceID        *string         `json:"workspaceId,omitempty" db:"workspace_id"`
	CustomInstructions string          `json:"customInstructions" db:"custom_instructions"`
	Preferences        json.RawMessage `json:"preferences" db:"preferences"`
	ActiveSkills       []string        `json:"activeSkills" db:"active_skills"`
	CreatedAt          time.Time       `json:"createdAt" db:"created_at"`
	UpdatedAt          time.Time       `json:"updatedAt" db:"updated_at"`
}

type UpsertUserContextReq struct {
	UserID             string          `json:"userId"`
	WorkspaceID        *string         `json:"workspaceId,omitempty"`
	CustomInstructions *string         `json:"customInstructions,omitempty"`
	Preferences        *json.RawMessage `json:"preferences,omitempty"`
	ActiveSkills       *[]string       `json:"activeSkills,omitempty"`
}
