package models

import "time"

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
	ID             string      `json:"id" db:"id"`
	Name           string      `json:"name" db:"name"`
	Description    string      `json:"description" db:"description"`
	Progress       float64     `json:"progress" db:"progress"`
	CurrentPhaseID *string     `json:"currentPhaseId" db:"current_phase_id"`
	Color          string      `json:"color" db:"color"`
	Status         string      `json:"status" db:"status"`
	Phases         []Phase     `json:"phases"`
	Agents         []Agent     `json:"agents"`
	Activities     []Activity  `json:"activities"`
	CreatedAt      time.Time   `json:"createdAt" db:"created_at"`
	UpdatedAt      time.Time   `json:"updatedAt" db:"updated_at"`
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

type Activity struct {
	ID          string     `json:"id" db:"id"`
	WorkspaceID string     `json:"workspaceId" db:"workspace_id"`
	Type        string     `json:"type" db:"type"`
	Description string     `json:"description" db:"description"`
	AgentType   *AgentType `json:"agentType,omitempty" db:"agent_type"`
	CreatedAt   time.Time  `json:"timestamp" db:"created_at"`
}
