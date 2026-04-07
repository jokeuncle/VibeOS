package models

import "encoding/json"

// API request/response types

type CreateWorkspaceReq struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Color       string `json:"color"`
}

type UpdateWorkspaceReq struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
}

type CreateTaskReq struct {
	Title         string  `json:"title"`
	Description   string  `json:"description,omitempty"`
	Priority      *string `json:"priority,omitempty"`
	AssignedAgent *string `json:"assignedAgent,omitempty"`
}

type UpdateTaskReq struct {
	Title         *string  `json:"title,omitempty"`
	Description   *string  `json:"description,omitempty"`
	Status        *string  `json:"status,omitempty"`
	Priority      *string  `json:"priority,omitempty"`
	Labels        []string `json:"labels,omitempty"`
	DueDate       *string  `json:"dueDate,omitempty"`
	AssignedAgent *string  `json:"assignedAgent,omitempty"`
}

type CreateArtifactReq struct {
	ExecutionID *string `json:"executionId,omitempty"`
	AgentType   string  `json:"agentType"`
	Type          string  `json:"type"`
	Title         string  `json:"title"`
	Content       string  `json:"content"`
	Metadata      string  `json:"metadata,omitempty"`
}

type CreateRequirementReq struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	Priority    *string `json:"priority,omitempty"`
	Iteration   string  `json:"iteration,omitempty"`
}

type UpdateRequirementReq struct {
	Title        *string  `json:"title,omitempty"`
	Description  *string  `json:"description,omitempty"`
	Status       *string  `json:"status,omitempty"`
	CurrentPhase *string  `json:"currentPhase,omitempty"`
	Priority     *string  `json:"priority,omitempty"`
	Iteration    *string  `json:"iteration,omitempty"`
	Progress     *float64 `json:"progress,omitempty"`
	SortOrder    *int     `json:"sortOrder,omitempty"`
}

type CreateRequirementRelationReq struct {
	TargetID     string `json:"targetId"`
	RelationType string `json:"relationType"`
	Description  string `json:"description,omitempty"`
}

type UpdatePhaseStatusReq struct {
	Status string `json:"status"`
}

type ReorderTasksReq struct {
	TaskIDs []string `json:"taskIds"`
}

// GitLab credential DTOs
type CreateGitLabCredentialReq struct {
	GitLabURL string `json:"gitlabUrl"`
	Token     string `json:"token"`     // plaintext PAT; encrypted before storage
	Label     string `json:"label"`
	CreatedBy string `json:"createdBy"`
}

// WorkspaceRepo DTOs
type CreateWorkspaceRepoReq struct {
	CredentialID   string   `json:"credentialId"`
	ProjectID      string   `json:"projectId"`
	ProjectName    string   `json:"projectName"`
	ProjectURL     string   `json:"projectUrl"`
	Role           string   `json:"role"`           // primary | secondary | infra | docs
	IsPrimary      bool     `json:"isPrimary"`
	BranchDefault  string   `json:"branchDefault"`
	BranchStrategy string   `json:"branchStrategy"` // feature | direct | gitflow
	PhaseTypes     []string `json:"phaseTypes"`     // nil = all phases
}

type UpdateWorkspaceRepoReq struct {
	ProjectName    *string  `json:"projectName,omitempty"`
	ProjectURL     *string  `json:"projectUrl,omitempty"`
	Role           *string  `json:"role,omitempty"`
	IsPrimary      *bool    `json:"isPrimary,omitempty"`
	BranchDefault  *string  `json:"branchDefault,omitempty"`
	BranchStrategy *string  `json:"branchStrategy,omitempty"`
	PhaseTypes     []string `json:"phaseTypes,omitempty"`
}

// TestRepoConnectionResp is returned by the /test endpoint.
type TestRepoConnectionResp struct {
	OK          bool   `json:"ok"`
	ProjectName string `json:"projectName,omitempty"`
	Message     string `json:"message,omitempty"`
}

// GitLabProjectResult is one item in a project search response.
type GitLabProjectResult struct {
	ID                string `json:"id"`
	Name              string `json:"name"`
	PathWithNamespace string `json:"pathWithNamespace"`
	WebURL            string `json:"webUrl"`
}

// Auth DTOs
type RegisterReq struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

type LoginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

type AddMemberReq struct {
	Email string `json:"email"`
	Role  string `json:"role"` // editor | viewer
}

// Chat message persistence
type SendMessageReq struct {
	Role          string `json:"role"`       // user | agent | system
	Content       string `json:"content"`
	AgentType     string `json:"agentType,omitempty"`
	SessionID     string `json:"sessionId,omitempty"`
	RichBlocks    string `json:"richBlocks,omitempty"` // JSON string
	Segments      string `json:"segments,omitempty"`   // JSON string (ContentSegment[])
	ContextType   string `json:"contextType,omitempty"`
	RequirementID string `json:"requirementId,omitempty"`
	ExecutionID   string `json:"executionId,omitempty"`
}

// Archive workspace
type ArchiveWorkspaceReq struct {
	Status string `json:"status"` // active | archived
}

// CreateAgentReq adds a workspace agent row for the given type (upserts if already present).
type CreateAgentReq struct {
	Type string `json:"type"`
}

// Agent config update (control plane fields)
type UpdateAgentReq struct {
	Status               *string          `json:"status,omitempty"`
	PreferredModel       *string          `json:"preferredModel,omitempty"`
	SystemPromptTemplate *string          `json:"systemPromptTemplate,omitempty"`
	ToolManifest         *json.RawMessage `json:"toolManifest,omitempty"`
	Capabilities         *json.RawMessage `json:"capabilities,omitempty"`
	Enabled              *bool            `json:"enabled,omitempty"`
	RequireApproval      *bool            `json:"requireApproval,omitempty"`
	QualityGate          *string          `json:"qualityGate,omitempty"`
	GraphID              *string          `json:"graphId,omitempty"`
	TrustThreshold       *float64         `json:"trustThreshold,omitempty"`
	ContextConfig        *json.RawMessage `json:"contextConfig,omitempty"`
}

// UpsertManifestReq is sent by agents at boot to register code-level defaults.
type UpsertManifestReq struct {
	AgentType    string          `json:"agentType"`
	Version      string          `json:"version,omitempty"`
	SystemPrompt string          `json:"systemPrompt"`
	Tools        json.RawMessage `json:"tools"`
	Capabilities json.RawMessage `json:"capabilities"`
}

// Budget settings update
type UpdateBudgetSettingsReq struct {
	DailySpendLimitUSD *float64 `json:"dailySpendLimitUsd,omitempty"`
	AlertThresholdPct  *int     `json:"alertThresholdPct,omitempty"`
}

// Pipeline phase config (per-phase item in update request)
type PipelinePhaseConfigReq struct {
	PhaseKey        string  `json:"phaseKey"`
	Enabled         bool    `json:"enabled"`
	RequireApproval bool    `json:"requireApproval"`
	QualityGate     *string `json:"qualityGate,omitempty"`
	GraphID         *string `json:"graphId,omitempty"`
}

// Batch pipeline update
type UpdatePipelineReq struct {
	Phases []PipelinePhaseConfigReq `json:"phases"`
}

// Agent execution DTOs
type CreateAgentExecutionReq struct {
	ID                string   `json:"id,omitempty"`
	RequirementID     *string  `json:"requirementId,omitempty"`
	TaskIDs           []string `json:"taskIds,omitempty"`
	IntentType        string   `json:"intentType"`
	IntentSummary     string   `json:"intentSummary"`
	TriggeredBy       string   `json:"triggeredBy"`
	UserMessage       string   `json:"userMessage,omitempty"`
	ChatMessageID     *string  `json:"chatMessageId,omitempty"`
	AgentType         string   `json:"agentType"`
	ResultType        string   `json:"resultType,omitempty"`
	ParentExecutionID *string  `json:"parentExecutionId,omitempty"`
}

type UpdateAgentExecutionReq struct {
	Status        *string  `json:"status,omitempty"`
	Steps         *string  `json:"steps,omitempty"`
	ResultPayload *string  `json:"resultPayload,omitempty"`
	ErrorMessage  *string  `json:"errorMessage,omitempty"`
	TaskIDs       []string `json:"taskIds,omitempty"`
	ChatMessageID *string  `json:"chatMessageId,omitempty"`
}

// Feedback signal (stored for preference learning)
type CreateFeedbackSignalReq struct {
	AgentType      string `json:"agentType"`
	ActionType     string `json:"actionType"` // approve | reject | edit
	OriginalOutput string `json:"originalOutput,omitempty"`
	ModifiedOutput string `json:"modifiedOutput,omitempty"`
	Context        string `json:"context,omitempty"` // JSON string
}

// Summary creation
type CreateConversationSummaryReq struct {
	Summary      string `json:"summary"`
	KeyDecisions string `json:"keyDecisions"`
	SessionID    string `json:"sessionId,omitempty"`
	AgentType    string `json:"agentType,omitempty"`
	MessageCount int    `json:"messageCount"`
}

type CreateActivitySummaryReq struct {
	Summary       string `json:"summary"`
	KeyEvents     string `json:"keyEvents"`
	ActivityCount int    `json:"activityCount"`
}

type APIResponse[T any] struct {
	Data  T      `json:"data"`
	Error string `json:"error,omitempty"`
}

type PaginatedResponse[T any] struct {
	Data       []T   `json:"data"`
	Total      int64 `json:"total"`
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
}

// Cursor-based pagination for time-series data (messages, activities).
// More stable than offset pagination when new items are inserted at head.
type CursorResponse[T any] struct {
	Data    []T    `json:"data"`
	Cursor  string `json:"cursor,omitempty"`  // opaque cursor for next page
	HasMore bool   `json:"hasMore"`
}

// WSEvent is a minimal envelope for extracting the workspaceId to route
// broadcasts.  The full raw JSON is preserved and forwarded as-is so that
// no extra fields published by Python agents are dropped.
type WSEvent struct {
	Type        string `json:"type"`
	WorkspaceID string `json:"workspaceId,omitempty"`
}

// Unified WS event types — all follow the category:action naming convention.
const (
	WSEventAgentStatus  = "agent:status"
	WSEventAgentMessage = "agent:message"
	WSEventAgentLog     = "agent:log"

	WSEventChatMessage  = "chat:message"
	WSEventActivity     = "activity:new"
	WSEventNotification = "notification:new"

	WSEventTaskUpdated        = "task:updated"
	WSEventPhaseUpdated       = "phase:updated"
	WSEventRequirementUpdated = "requirement:updated"

	WSEventExecutionStart    = "execution:start"
	WSEventExecutionUpdate   = "execution:update"
	WSEventExecutionComplete = "execution:complete"

	WSEventGraphStart               = "graph:start"
	WSEventGraphNodeStart           = "graph:node_start"
	WSEventGraphNodeComplete        = "graph:node_complete"
	WSEventGraphNodeAwaitApproval   = "graph:node_awaiting_approval"
	WSEventGraphResume              = "graph:resume"
	WSEventGraphComplete            = "graph:complete"
	WSEventGraphError               = "graph:error"

	WSEventPhaseAwaitApproval = "phase:awaiting_approval"

	WSEventToolConfirmation = "tool:confirmation"

	WSEventTrustDegraded = "trust:degraded"
)
