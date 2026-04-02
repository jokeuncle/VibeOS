package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/vibeos/shared/models"
)

var ErrNotFound = errors.New("not found")

type Store interface {
	ListWorkspaces(ctx context.Context) ([]models.Workspace, error)
	GetWorkspace(ctx context.Context, id string) (*models.Workspace, error)
	CreateWorkspaceFull(ctx context.Context, ws models.Workspace, phases []models.Phase, agents []models.Agent) error
	UpdateWorkspace(ctx context.Context, id string, req models.UpdateWorkspaceReq) (*models.Workspace, error)
	DeleteWorkspace(ctx context.Context, id string) error
	UpdateWorkspaceProgress(ctx context.Context, id string, progress float64) error
	UpdateWorkspaceCurrentPhase(ctx context.Context, id string, phaseID *string) error

	GetPhase(ctx context.Context, id string) (*models.Phase, error)
	UpdatePhaseStatus(ctx context.Context, id string, status string) (*models.Phase, error)
	UpdatePhaseStatusCAS(ctx context.Context, id, fromStatus, toStatus string) (*models.Phase, error)
	UpdatePhaseProgress(ctx context.Context, id string, progress float64) error
	ListPhasesByWorkspace(ctx context.Context, workspaceID string) ([]models.Phase, error)
	ResetWorkspacePhasePipeline(ctx context.Context, workspaceID string) error

	CreateTask(ctx context.Context, task *models.Task) error
	GetTask(ctx context.Context, id string) (*models.Task, error)
	UpdateTask(ctx context.Context, id string, workspaceID string, req models.UpdateTaskReq) (*models.Task, error)
	ClaimTask(ctx context.Context, id string, workspaceID string, agent string) (*models.Task, error)
	DeleteTask(ctx context.Context, id string, workspaceID string) error
	ReorderTasks(ctx context.Context, phaseID string, taskIDs []string) error
	CountTasksByPhase(ctx context.Context, phaseID string) (total int, completed int, err error)

	ListAgentsByWorkspace(ctx context.Context, workspaceID string) ([]models.Agent, error)
	CreateAgent(ctx context.Context, a models.Agent) (*models.Agent, error)
	UpdateAgent(ctx context.Context, id string, workspaceID string, req models.UpdateAgentReq) (*models.Agent, error)
	DeleteAgent(ctx context.Context, id string, workspaceID string) error
	UpsertManifest(ctx context.Context, workspaceID string, req models.UpsertManifestReq) error

	// Feedback signals
	CreateFeedbackSignal(ctx context.Context, signal *models.FeedbackSignal) error
	ListFeedbackSignals(ctx context.Context, workspaceID string, limit int) ([]models.FeedbackSignal, error)

	CreateActivity(ctx context.Context, activity *models.Activity) error
	ListActivities(ctx context.Context, workspaceID string, page, pageSize int) ([]models.Activity, int64, error)

	CreateArtifact(ctx context.Context, artifact *models.Artifact) error
	ListArtifactsByWorkspace(ctx context.Context, workspaceID, agentType, artifactType string) ([]models.Artifact, error)
	ListArtifactsByExecution(ctx context.Context, workspaceID, executionID string) ([]models.Artifact, error)
	GetArtifact(ctx context.Context, workspaceID, id string) (*models.Artifact, error)

	// GitLab credential store
	CreateGitLabCredential(ctx context.Context, cred *models.GitLabCredential) error
	UpsertGitLabCredentialByURL(ctx context.Context, cred *models.GitLabCredential) error
	ListGitLabCredentials(ctx context.Context) ([]models.GitLabCredential, error)
	GetGitLabCredential(ctx context.Context, id string) (*models.GitLabCredential, error)
	DeleteGitLabCredential(ctx context.Context, id string) error

	// User auth
	CreateUser(ctx context.Context, user *models.User) error
	GetUserByEmail(ctx context.Context, email string) (*models.User, error)
	GetUser(ctx context.Context, id string) (*models.User, error)

	// Workspace membership
	AddMember(ctx context.Context, member *models.WorkspaceMember) error
	ListMembers(ctx context.Context, workspaceID string) ([]models.WorkspaceMember, error)
	RemoveMember(ctx context.Context, id string) error
	GetMemberByUserAndWorkspace(ctx context.Context, userID, workspaceID string) (*models.WorkspaceMember, error)

	// Workspace repo bindings
	CreateWorkspaceRepo(ctx context.Context, repo *models.WorkspaceRepo) error
	ListWorkspaceRepos(ctx context.Context, workspaceID string) ([]models.WorkspaceRepo, error)
	GetWorkspaceRepo(ctx context.Context, id string) (*models.WorkspaceRepo, error)
	UpdateWorkspaceRepo(ctx context.Context, id string, req models.UpdateWorkspaceRepoReq) (*models.WorkspaceRepo, error)
	DeleteWorkspaceRepo(ctx context.Context, id string) error
	ListReposForPhase(ctx context.Context, workspaceID, phaseType string) ([]models.WorkspaceRepo, error)

	// Chat message persistence
	GetOrCreateChatSession(ctx context.Context, workspaceID, agentType string) (*models.ChatSession, error)
	SaveChatMessage(ctx context.Context, msg *models.ChatMessage) error
	ListChatMessages(ctx context.Context, workspaceID string, cursor string, limit int) ([]models.ChatMessage, string, bool, error)
	ListGlobalMessages(ctx context.Context, cursor string, limit int) ([]models.ChatMessage, string, bool, error)
	DeleteWorkspaceMessages(ctx context.Context, workspaceID string) error
	DeleteGlobalMessages(ctx context.Context) error

	// Artifact metadata-only listing
	ListArtifactMetaByWorkspace(ctx context.Context, workspaceID string) ([]models.ArtifactMeta, error)

	// Workspace lifecycle
	ArchiveWorkspace(ctx context.Context, id string) error
	UnarchiveWorkspace(ctx context.Context, id string) error
	ListWorkspacesByStatus(ctx context.Context, status string) ([]models.Workspace, error)

	// Conversation & activity summaries
	SaveConversationSummary(ctx context.Context, s *models.ConversationSummary) error
	ListConversationSummaries(ctx context.Context, workspaceID string) ([]models.ConversationSummary, error)
	SaveActivitySummary(ctx context.Context, s *models.ActivitySummary) error
	ListActivitySummaries(ctx context.Context, workspaceID string) ([]models.ActivitySummary, error)

	// Requirements
	CreateRequirement(ctx context.Context, req *models.Requirement) error
	GetRequirement(ctx context.Context, id, wsID string) (*models.Requirement, error)
	ListRequirements(ctx context.Context, wsID string) ([]models.Requirement, error)
	UpdateRequirement(ctx context.Context, id, wsID string, req models.UpdateRequirementReq) (*models.Requirement, error)
	DeleteRequirement(ctx context.Context, id, wsID string) error

	// Requirement relations
	CreateRequirementRelation(ctx context.Context, rel *models.RequirementRelation) error
	DeleteRequirementRelation(ctx context.Context, id, wsID string) error
	GetRelatedRequirementArtifacts(ctx context.Context, reqID, wsID string) (map[string][]models.Artifact, error)

	// Requirement phase tasks
	ResetRequirementPhaseTasks(ctx context.Context, reqID, phaseID string) error

	// Artifact upsert
	UpsertArtifact(ctx context.Context, art *models.Artifact) error

	// Budget settings
	GetBudgetSettings(ctx context.Context, workspaceID string) (*models.WorkspaceBudgetSettings, error)
	UpsertBudgetSettings(ctx context.Context, workspaceID string, req models.UpdateBudgetSettingsReq) (*models.WorkspaceBudgetSettings, error)

	// Pipeline phase configs
	GetPipelineConfigs(ctx context.Context, workspaceID string) ([]models.PipelinePhaseConfig, error)
	UpsertPipelineConfigs(ctx context.Context, workspaceID string, phases []models.PipelinePhaseConfigReq) ([]models.PipelinePhaseConfig, error)

	// Agent executions
	CreateAgentExecution(ctx context.Context, exec *models.AgentExecution) error
	GetAgentExecution(ctx context.Context, id string) (*models.AgentExecution, error)
	UpdateAgentExecution(ctx context.Context, id string, req models.UpdateAgentExecutionReq) (*models.AgentExecution, error)
	ListAgentExecutions(ctx context.Context, workspaceID string, requirementID *string, cursor string, limit int) ([]models.AgentExecution, string, error)
	LinkExecutionToTasks(ctx context.Context, executionID string, taskIDs []string) error

	// Global registry: intents, task templates, capabilities
	ListIntents(ctx context.Context, enabledOnly bool) ([]models.IntentRegistryEntry, error)
	GetIntent(ctx context.Context, name string) (*models.IntentRegistryEntry, error)
	UpsertIntent(ctx context.Context, req models.CreateIntentReq) (*models.IntentRegistryEntry, error)
	DeleteIntent(ctx context.Context, name string) error

	ListTaskTemplates(ctx context.Context, enabledOnly bool) ([]models.TaskTemplateEntry, error)
	GetTaskTemplate(ctx context.Context, id string) (*models.TaskTemplateEntry, error)
	ResolveTaskTemplate(ctx context.Context, intentName, ctxScope string) (*models.TaskTemplateEntry, error)
	UpsertTaskTemplate(ctx context.Context, req models.CreateTaskTemplateReq) (*models.TaskTemplateEntry, error)
	DeleteTaskTemplate(ctx context.Context, id string) error

	ListCapabilities(ctx context.Context, enabledOnly bool) ([]models.CapabilityEntry, error)
	ListCapabilitiesByProvider(ctx context.Context, provider string) ([]models.CapabilityEntry, error)
	ListCapabilitiesFiltered(ctx context.Context, sourceType, workspaceID string) ([]models.CapabilityEntry, error)
	FindCapabilityProviders(ctx context.Context, capabilityName string) ([]models.CapabilityEntry, error)
	UpsertCapability(ctx context.Context, req models.CreateCapabilityReq) (*models.CapabilityEntry, error)
	UpdateCapabilityHealth(ctx context.Context, name, provider, health string) error
	DeleteCapability(ctx context.Context, name, provider string) error

	// Workspace graphs
	ListWorkspaceGraphs(ctx context.Context, workspaceID string) ([]models.WorkspaceGraph, error)
	GetWorkspaceGraph(ctx context.Context, id string) (*models.WorkspaceGraph, error)
	GetActiveWorkspaceGraph(ctx context.Context, workspaceID string) (*models.WorkspaceGraph, error)
	CreateWorkspaceGraph(ctx context.Context, workspaceID string, req models.CreateWorkspaceGraphReq) (*models.WorkspaceGraph, error)
	UpdateWorkspaceGraph(ctx context.Context, id string, req models.UpdateWorkspaceGraphReq) (*models.WorkspaceGraph, error)
	DeleteWorkspaceGraph(ctx context.Context, id string) error
	ActivateWorkspaceGraph(ctx context.Context, workspaceID, graphID string) error

	// Extensibility: MCP servers, tool configs, skills, user contexts
	ListMCPServers(ctx context.Context, workspaceID *string) ([]models.MCPServer, error)
	CreateMCPServer(ctx context.Context, req models.CreateMCPServerReq) (*models.MCPServer, error)
	GetMCPServer(ctx context.Context, id string) (*models.MCPServer, error)
	UpdateMCPServer(ctx context.Context, id string, req models.UpdateMCPServerReq) (*models.MCPServer, error)
	DeleteMCPServer(ctx context.Context, id string) error

	ListToolConfigs(ctx context.Context, workspaceID *string) ([]models.ToolConfig, error)
	CreateToolConfig(ctx context.Context, req models.CreateToolConfigReq) (*models.ToolConfig, error)
	DeleteToolConfig(ctx context.Context, id string) error

	ListSkills(ctx context.Context, workspaceID *string) ([]models.Skill, error)
	CreateSkill(ctx context.Context, req models.CreateSkillReq) (*models.Skill, error)
	DeleteSkill(ctx context.Context, id string) error

	GetUserContext(ctx context.Context, userID string, workspaceID *string) (*models.UserContext, error)
	UpsertUserContext(ctx context.Context, req models.UpsertUserContextReq) (*models.UserContext, error)
}

type PostgresStore struct {
	pool *pgxpool.Pool
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{pool: pool}
}

type rowScanner interface {
	Scan(dest ...any) error
}
