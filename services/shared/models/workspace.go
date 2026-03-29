package models

import "time"

func TimeNow() time.Time {
	return time.Now().UTC()
}

type PhaseType string

const (
	PhaseRequirement  PhaseType = "requirement"
	PhaseDesign       PhaseType = "design"
	PhaseArchitecture PhaseType = "architecture"
	PhaseDevelopment  PhaseType = "development"
	PhaseTesting      PhaseType = "testing"
	PhaseDeployment   PhaseType = "deployment"
	PhaseMonitoring   PhaseType = "monitoring"
)

type PhaseStatus string

const (
	StatusPending    PhaseStatus = "pending"
	StatusInProgress PhaseStatus = "in_progress"
	StatusCompleted  PhaseStatus = "completed"
)

type AgentType string

const (
	AgentRequirement  AgentType = "requirement"
	AgentDesign       AgentType = "design"
	AgentArchitecture AgentType = "architecture"
	AgentDevelopment  AgentType = "development"
	AgentTesting      AgentType = "testing"
	AgentCICD         AgentType = "cicd"
	AgentMonitoring   AgentType = "monitoring"
	AgentPM           AgentType = "pm"
)

type AgentStatus string

const (
	AgentIdle    AgentStatus = "idle"
	AgentRunning AgentStatus = "running"
	AgentWaiting AgentStatus = "waiting"
	AgentError   AgentStatus = "error"
)

type TaskPriority string

const (
	PriorityP0 TaskPriority = "p0"
	PriorityP1 TaskPriority = "p1"
	PriorityP2 TaskPriority = "p2"
	PriorityP3 TaskPriority = "p3"
)

type Workspace struct {
	ID             string          `json:"id" db:"id"`
	Name           string          `json:"name" db:"name"`
	Description    string          `json:"description" db:"description"`
	Progress       float64         `json:"progress" db:"progress"`
	CurrentPhaseID *string         `json:"currentPhaseId" db:"current_phase_id"`
	Color          string          `json:"color" db:"color"`
	Status         string          `json:"status" db:"status"`
	Phases         []Phase         `json:"phases"`
	Agents         []Agent         `json:"agents"`
	Activities     []Activity      `json:"activities"`
	Repos          []WorkspaceRepo `json:"repos"`
	CreatedAt      time.Time       `json:"createdAt" db:"created_at"`
	UpdatedAt      time.Time       `json:"updatedAt" db:"updated_at"`
}

type Phase struct {
	ID          string      `json:"id" db:"id"`
	WorkspaceID string      `json:"workspaceId" db:"workspace_id"`
	Type        PhaseType   `json:"type" db:"type"`
	Name        string      `json:"name" db:"name"`
	Status      PhaseStatus `json:"status" db:"status"`
	Progress    float64     `json:"progress" db:"progress"`
	Description string      `json:"description" db:"description"`
	SortOrder   int         `json:"sortOrder" db:"sort_order"`
	Tasks       []Task      `json:"tasks"`
	CreatedAt   time.Time   `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time   `json:"updatedAt" db:"updated_at"`
}

type Task struct {
	ID            string        `json:"id" db:"id"`
	PhaseID       string        `json:"phaseId" db:"phase_id"`
	WorkspaceID   string        `json:"workspaceId" db:"workspace_id"`
	Title         string        `json:"title" db:"title"`
	Description   string        `json:"description" db:"description"`
	Status        PhaseStatus   `json:"status" db:"status"`
	Priority      *TaskPriority `json:"priority,omitempty" db:"priority"`
	Labels        []string      `json:"labels" db:"labels"`
	DueDate       *time.Time    `json:"dueDate,omitempty" db:"due_date"`
	AssignedAgent *AgentType    `json:"assignedAgent,omitempty" db:"assigned_agent"`
	SortOrder     int           `json:"sortOrder" db:"sort_order"`
	CreatedAt     time.Time     `json:"createdAt" db:"created_at"`
	UpdatedAt     time.Time     `json:"updatedAt" db:"updated_at"`
}

type Agent struct {
	ID          string      `json:"id" db:"id"`
	WorkspaceID string      `json:"workspaceId" db:"workspace_id"`
	Type        AgentType   `json:"type" db:"type"`
	Name        string      `json:"name" db:"name"`
	Status      AgentStatus `json:"status" db:"status"`
	CurrentTask *string     `json:"currentTask,omitempty" db:"current_task"`
	Avatar      string      `json:"avatar" db:"avatar"`
	CreatedAt   time.Time   `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time   `json:"updatedAt" db:"updated_at"`
}

type Artifact struct {
	ID          string    `json:"id" db:"id"`
	WorkspaceID string    `json:"workspaceId" db:"workspace_id"`
	PhaseID     *string   `json:"phaseId,omitempty" db:"phase_id"`
	TaskID      *string   `json:"taskId,omitempty" db:"task_id"`
	AgentType   AgentType `json:"agentType" db:"agent_type"`
	Type        string    `json:"type" db:"type"`
	Title       string    `json:"title" db:"title"`
	Content     string    `json:"content" db:"content"`
	Metadata    string    `json:"metadata" db:"metadata"`
	Version     int       `json:"version" db:"version"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time `json:"updatedAt" db:"updated_at"`
}

type Activity struct {
	ID          string     `json:"id" db:"id"`
	WorkspaceID string     `json:"workspaceId" db:"workspace_id"`
	Type        string     `json:"type" db:"type"`
	Description string     `json:"description" db:"description"`
	AgentType   *AgentType `json:"agentType,omitempty" db:"agent_type"`
	CreatedAt   time.Time  `json:"timestamp" db:"created_at"`
}

// ---------------------------------------------------------------------------
// Chat persistence models
// ---------------------------------------------------------------------------

type ChatSession struct {
	ID          string    `json:"id" db:"id"`
	WorkspaceID string    `json:"workspaceId" db:"workspace_id"`
	AgentType   string    `json:"agentType" db:"agent_type"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time `json:"updatedAt" db:"updated_at"`
}

type ChatMessage struct {
	ID          string    `json:"id" db:"id"`
	SessionID   string    `json:"sessionId" db:"session_id"`
	WorkspaceID string    `json:"workspaceId" db:"workspace_id"`
	Role        string    `json:"role" db:"role"`
	Content     string    `json:"content" db:"content"`
	RichBlocks  *string   `json:"richBlocks,omitempty" db:"rich_blocks"`
	AgentType   *string   `json:"agentType,omitempty" db:"agent_type"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
}

type ConversationSummary struct {
	ID              string    `json:"id" db:"id"`
	WorkspaceID     string    `json:"workspaceId" db:"workspace_id"`
	SessionID       *string   `json:"sessionId,omitempty" db:"session_id"`
	AgentType       *string   `json:"agentType,omitempty" db:"agent_type"`
	Summary         string    `json:"summary" db:"summary"`
	KeyDecisions    string    `json:"keyDecisions" db:"key_decisions"`
	TimeRangeFrom   time.Time `json:"timeRangeFrom" db:"time_range_from"`
	TimeRangeTo     time.Time `json:"timeRangeTo" db:"time_range_to"`
	MessageCount    int       `json:"messageCount" db:"message_count"`
	CreatedAt       time.Time `json:"createdAt" db:"created_at"`
}

// ArtifactMeta is a lightweight projection of Artifact without the content field,
// used for listing to avoid transferring large payloads.
type ArtifactMeta struct {
	ID          string    `json:"id" db:"id"`
	WorkspaceID string    `json:"workspaceId" db:"workspace_id"`
	PhaseID     *string   `json:"phaseId,omitempty" db:"phase_id"`
	TaskID      *string   `json:"taskId,omitempty" db:"task_id"`
	AgentType   AgentType `json:"agentType" db:"agent_type"`
	Type        string    `json:"type" db:"type"`
	Title       string    `json:"title" db:"title"`
	ContentSize int       `json:"contentSize" db:"content_size"`
	Metadata    string    `json:"metadata" db:"metadata"`
	Version     int       `json:"version" db:"version"`
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt   time.Time `json:"updatedAt" db:"updated_at"`
}

// ActivitySummary is an AI-generated roll-up of activities for a time window.
type ActivitySummary struct {
	ID            string    `json:"id" db:"id"`
	WorkspaceID   string    `json:"workspaceId" db:"workspace_id"`
	Summary       string    `json:"summary" db:"summary"`
	KeyEvents     string    `json:"keyEvents" db:"key_events"`
	TimeRangeFrom time.Time `json:"timeRangeFrom" db:"time_range_from"`
	TimeRangeTo   time.Time `json:"timeRangeTo" db:"time_range_to"`
	ActivityCount int       `json:"activityCount" db:"activity_count"`
	CreatedAt     time.Time `json:"createdAt" db:"created_at"`
}

// ---------------------------------------------------------------------------
// Feedback & trust models
// ---------------------------------------------------------------------------

type FeedbackSignal struct {
	ID             string    `json:"id" db:"id"`
	WorkspaceID    string    `json:"workspaceId" db:"workspace_id"`
	AgentType      string    `json:"agentType" db:"agent_type"`
	ActionType     string    `json:"actionType" db:"action_type"`
	OriginalOutput string    `json:"originalOutput,omitempty" db:"original_output"`
	ModifiedOutput string    `json:"modifiedOutput,omitempty" db:"modified_output"`
	Context        string    `json:"context,omitempty" db:"context"`
	CreatedAt      time.Time `json:"createdAt" db:"created_at"`
}

type TrustScore struct {
	ID         string    `json:"id" db:"id"`
	Model      string    `json:"model" db:"model"`
	AgentType  string    `json:"agentType" db:"agent_type"`
	TotalCalls int       `json:"totalCalls" db:"total_calls"`
	Approvals  int       `json:"approvals" db:"approvals"`
	Rejections int       `json:"rejections" db:"rejections"`
	Score      float64   `json:"score" db:"score"`
	UpdatedAt  time.Time `json:"updatedAt" db:"updated_at"`
}

// ---------------------------------------------------------------------------
// Auth & membership models
// ---------------------------------------------------------------------------

type User struct {
	ID           string    `json:"id" db:"id"`
	Email        string    `json:"email" db:"email"`
	Name         string    `json:"name" db:"name"`
	PasswordHash string    `json:"-" db:"password_hash"`
	AvatarURL    *string   `json:"avatarUrl,omitempty" db:"avatar_url"`
	Status       string    `json:"status" db:"status"`
	CreatedAt    time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt    time.Time `json:"updatedAt" db:"updated_at"`
}

type WorkspaceMember struct {
	ID          string    `json:"id" db:"id"`
	WorkspaceID string    `json:"workspaceId" db:"workspace_id"`
	UserID      string    `json:"userId" db:"user_id"`
	Role        string    `json:"role" db:"role"` // owner | editor | viewer
	CreatedAt   time.Time `json:"createdAt" db:"created_at"`
	// Populated by join queries
	UserEmail string `json:"userEmail,omitempty" db:"user_email"`
	UserName  string `json:"userName,omitempty" db:"user_name"`
}

// ---------------------------------------------------------------------------
// GitLab integration models
// ---------------------------------------------------------------------------

// GitLabCredential stores an encrypted PAT for a GitLab instance.
// One row per GitLab instance; shared across all workspaces.
type GitLabCredential struct {
	ID        string    `json:"id" db:"id"`
	GitLabURL string    `json:"gitlabUrl" db:"gitlab_url"`
	TokenHint string    `json:"tokenHint" db:"token_hint"` // last 4 chars, safe to expose
	Label     string    `json:"label" db:"label"`
	CreatedBy string    `json:"createdBy" db:"created_by"`
	CreatedAt time.Time `json:"createdAt" db:"created_at"`
	UpdatedAt time.Time `json:"updatedAt" db:"updated_at"`
	// TokenEnc is NOT exported to JSON – only the service layer reads it.
	TokenEnc string `json:"-" db:"token_enc"`
}

// WorkspaceRepo binds one GitLab project to a workspace with role/strategy metadata.
type WorkspaceRepo struct {
	ID             string     `json:"id" db:"id"`
	WorkspaceID    string     `json:"workspaceId" db:"workspace_id"`
	CredentialID   string     `json:"credentialId" db:"credential_id"`
	ProjectID      string     `json:"projectId" db:"project_id"`
	ProjectName    string     `json:"projectName" db:"project_name"`
	ProjectURL     string     `json:"projectUrl" db:"project_url"`
	GitLabURL      string     `json:"gitlabUrl" db:"gitlab_url"`    // denormalized from credential for agent convenience
	Role           string     `json:"role" db:"role"`               // primary | secondary | infra | docs
	IsPrimary      bool       `json:"isPrimary" db:"is_primary"`
	BranchDefault  string     `json:"branchDefault" db:"branch_default"`
	BranchStrategy string     `json:"branchStrategy" db:"branch_strategy"` // feature | direct | gitflow
	PhaseTypes     []string   `json:"phaseTypes" db:"phase_types"`          // nil = all phases
	CreatedAt      time.Time  `json:"createdAt" db:"created_at"`
	UpdatedAt      time.Time  `json:"updatedAt" db:"updated_at"`
}
