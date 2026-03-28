package models

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
	PhaseID   *string `json:"phaseId,omitempty"`
	TaskID    *string `json:"taskId,omitempty"`
	AgentType string  `json:"agentType"`
	Type      string  `json:"type"`
	Title     string  `json:"title"`
	Content   string  `json:"content"`
	Metadata  string  `json:"metadata,omitempty"`
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
	Role       string `json:"role"`       // user | agent | system
	Content    string `json:"content"`
	AgentType  string `json:"agentType,omitempty"`
	SessionID  string `json:"sessionId,omitempty"`
	RichBlocks string `json:"richBlocks,omitempty"` // JSON string
}

// Archive workspace
type ArchiveWorkspaceReq struct {
	Status string `json:"status"` // active | archived
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

const (
	WSEventAgentStatus  = "agent:status"
	WSEventAgentMessage = "agent:message"
	WSEventAgentLog     = "agent:log"
	WSEventActivity     = "activity"
	WSEventChatMessage  = "chat_message"
	WSEventTaskUpdate   = "task_update"
	WSEventPhaseUpdate  = "phase_update"
	WSEventNotification = "notification"
)
