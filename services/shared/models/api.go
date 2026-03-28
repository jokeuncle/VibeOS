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

type UpdatePhaseStatusReq struct {
	Status string `json:"status"`
}

type ReorderTasksReq struct {
	TaskIDs []string `json:"taskIds"`
}

type APIResponse[T any] struct {
	Data  T      `json:"data,omitempty"`
	Error string `json:"error,omitempty"`
}

type PaginatedResponse[T any] struct {
	Data       []T   `json:"data"`
	Total      int64 `json:"total"`
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
}

// WebSocket event types
type WSEvent struct {
	Type        string      `json:"type"`
	WorkspaceID string      `json:"workspaceId,omitempty"`
	Payload     interface{} `json:"payload"`
}

const (
	WSEventAgentStatus  = "agent_status"
	WSEventActivity     = "activity"
	WSEventChatMessage  = "chat_message"
	WSEventTaskUpdate   = "task_update"
	WSEventPhaseUpdate  = "phase_update"
	WSEventNotification = "notification"
)
