package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
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
	UpdateAgent(ctx context.Context, id string, workspaceID string, req models.UpdateAgentReq) (*models.Agent, error)

	// Feedback signals & trust scores
	CreateFeedbackSignal(ctx context.Context, signal *models.FeedbackSignal) error
	ListFeedbackSignals(ctx context.Context, workspaceID string, limit int) ([]models.FeedbackSignal, error)
	UpsertTrustScore(ctx context.Context, agentType, actionType string) error
	GetTrustScores(ctx context.Context, agentType string) ([]models.TrustScore, error)

	CreateActivity(ctx context.Context, activity *models.Activity) error
	ListActivities(ctx context.Context, workspaceID string, page, pageSize int) ([]models.Activity, int64, error)

	CreateArtifact(ctx context.Context, artifact *models.Artifact) error
	ListArtifactsByWorkspace(ctx context.Context, workspaceID string) ([]models.Artifact, error)
	ListArtifactsByExecution(ctx context.Context, workspaceID, executionID string) ([]models.Artifact, error)
	GetArtifact(ctx context.Context, workspaceID, id string) (*models.Artifact, error)

	// GitLab credential store
	CreateGitLabCredential(ctx context.Context, cred *models.GitLabCredential) error
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
}

type PostgresStore struct {
	pool *pgxpool.Pool
}

func NewPostgresStore(pool *pgxpool.Pool) *PostgresStore {
	return &PostgresStore{pool: pool}
}

// ---------------------------------------------------------------------------
// Row scanning helpers
// ---------------------------------------------------------------------------

type rowScanner interface {
	Scan(dest ...any) error
}

const workspaceCols = `id, name, description, progress, current_phase_id, color, status, created_at, updated_at`

func scanWorkspace(s rowScanner) (*models.Workspace, error) {
	var ws models.Workspace
	err := s.Scan(&ws.ID, &ws.Name, &ws.Description, &ws.Progress,
		&ws.CurrentPhaseID, &ws.Color, &ws.Status, &ws.CreatedAt, &ws.UpdatedAt)
	if err != nil {
		return nil, err
	}
	ws.Phases = []models.Phase{}
	ws.Agents = []models.Agent{}
	ws.Activities = []models.Activity{}
	ws.Repos = []models.WorkspaceRepo{}
	ws.Requirements = []models.Requirement{}
	return &ws, nil
}

const phaseCols = `id, workspace_id, type, name, status, progress, description, sort_order, created_at, updated_at`

func scanPhase(s rowScanner) (*models.Phase, error) {
	var p models.Phase
	var pType, status string
	err := s.Scan(&p.ID, &p.WorkspaceID, &pType, &p.Name, &status,
		&p.Progress, &p.Description, &p.SortOrder, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		return nil, err
	}
	p.Type = models.PhaseType(pType)
	p.Status = models.PhaseStatus(status)
	p.Tasks = []models.Task{}
	return &p, nil
}

const taskCols = `id, phase_id, workspace_id, requirement_id, title, description, status, priority, labels, due_date, assigned_agent, last_execution_id, execution_count, sort_order, created_at, updated_at`

func scanTask(s rowScanner) (*models.Task, error) {
	var t models.Task
	var status string
	var priority, assignedAgent *string
	err := s.Scan(&t.ID, &t.PhaseID, &t.WorkspaceID, &t.RequirementID, &t.Title, &t.Description,
		&status, &priority, &t.Labels, &t.DueDate, &assignedAgent,
		&t.LastExecutionID, &t.ExecutionCount,
		&t.SortOrder, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	t.Status = models.PhaseStatus(status)
	if priority != nil {
		p := models.TaskPriority(*priority)
		t.Priority = &p
	}
	if assignedAgent != nil {
		a := models.AgentType(*assignedAgent)
		t.AssignedAgent = &a
	}
	if t.Labels == nil {
		t.Labels = []string{}
	}
	return &t, nil
}

func scanAgent(s rowScanner) (*models.Agent, error) {
	var a models.Agent
	var agentType, status string
	err := s.Scan(&a.ID, &a.WorkspaceID, &agentType, &a.Name, &status,
		&a.PreferredModel, &a.Avatar, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	a.Type = models.AgentType(agentType)
	a.Status = models.AgentStatus(status)
	return &a, nil
}

func scanActivity(s rowScanner) (*models.Activity, error) {
	var a models.Activity
	var agentType *string
	err := s.Scan(&a.ID, &a.WorkspaceID, &a.RequirementID, &a.Type, &a.Description, &agentType, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	if agentType != nil {
		at := models.AgentType(*agentType)
		a.AgentType = &at
	}
	return &a, nil
}

// ---------------------------------------------------------------------------
// Workspace operations
// ---------------------------------------------------------------------------

func (s *PostgresStore) ListWorkspaces(ctx context.Context) ([]models.Workspace, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+workspaceCols+` FROM workspaces ORDER BY created_at DESC`)
	if err != nil {
		return nil, fmt.Errorf("query workspaces: %w", err)
	}
	defer rows.Close()

	var workspaces []models.Workspace
	for rows.Next() {
		ws, err := scanWorkspace(rows)
		if err != nil {
			return nil, fmt.Errorf("scan workspace: %w", err)
		}
		workspaces = append(workspaces, *ws)
	}
	if len(workspaces) == 0 {
		return []models.Workspace{}, nil
	}

	wsIDs := make([]string, len(workspaces))
	wsMap := make(map[string]int)
	for i := range workspaces {
		wsIDs[i] = workspaces[i].ID
		wsMap[workspaces[i].ID] = i
	}

	if phases, err := s.queryPhases(ctx, wsIDs); err != nil {
		return nil, err
	} else {
		for _, p := range phases {
			if idx, ok := wsMap[p.WorkspaceID]; ok {
				workspaces[idx].Phases = append(workspaces[idx].Phases, p)
			}
		}
	}

	if agents, err := s.queryAgents(ctx, wsIDs); err != nil {
		return nil, err
	} else {
		for _, a := range agents {
			if idx, ok := wsMap[a.WorkspaceID]; ok {
				workspaces[idx].Agents = append(workspaces[idx].Agents, a)
			}
		}
	}

	if activities, err := s.queryRecentActivities(ctx, wsIDs, 5); err != nil {
		return nil, err
	} else {
		for _, a := range activities {
			if idx, ok := wsMap[a.WorkspaceID]; ok {
				workspaces[idx].Activities = append(workspaces[idx].Activities, a)
			}
		}
	}

	return workspaces, nil
}

func (s *PostgresStore) GetWorkspace(ctx context.Context, id string) (*models.Workspace, error) {
	ws, err := scanWorkspace(s.pool.QueryRow(ctx, `SELECT `+workspaceCols+` FROM workspaces WHERE id = $1`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query workspace: %w", err)
	}

	phases, err := s.queryPhases(ctx, []string{id})
	if err != nil {
		return nil, err
	}

	if len(phases) > 0 {
		phaseIDs := make([]string, len(phases))
		phaseMap := make(map[string]int)
		for i := range phases {
			phaseIDs[i] = phases[i].ID
			phaseMap[phases[i].ID] = i
		}

		taskRows, err := s.pool.Query(ctx,
			`SELECT `+taskCols+` FROM tasks WHERE phase_id = ANY($1) ORDER BY sort_order`, phaseIDs)
		if err != nil {
			return nil, fmt.Errorf("query tasks: %w", err)
		}
		defer taskRows.Close()

		for taskRows.Next() {
			t, err := scanTask(taskRows)
			if err != nil {
				return nil, fmt.Errorf("scan task: %w", err)
			}
			if idx, ok := phaseMap[t.PhaseID]; ok {
				phases[idx].Tasks = append(phases[idx].Tasks, *t)
			}
		}
	}
	ws.Phases = phases

	agents, err := s.queryAgents(ctx, []string{id})
	if err != nil {
		return nil, err
	}
	ws.Agents = agents

	activities, err := s.queryRecentActivities(ctx, []string{id}, 10)
	if err != nil {
		return nil, err
	}
	ws.Activities = activities

	repos, err := s.ListWorkspaceRepos(ctx, id)
	if err != nil {
		return nil, err
	}
	ws.Repos = repos

	requirements, err := s.ListRequirements(ctx, id)
	if err != nil {
		return nil, err
	}
	ws.Requirements = requirements

	return ws, nil
}

func (s *PostgresStore) CreateWorkspaceFull(ctx context.Context, ws models.Workspace, phases []models.Phase, agents []models.Agent) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO workspaces (id, name, description, color) VALUES ($1, $2, $3, $4)`,
		ws.ID, ws.Name, ws.Description, ws.Color)
	if err != nil {
		return fmt.Errorf("insert workspace: %w", err)
	}

	for _, p := range phases {
		_, err = tx.Exec(ctx,
			`INSERT INTO phases (id, workspace_id, type, name, description, sort_order) VALUES ($1, $2, $3, $4, $5, $6)`,
			p.ID, p.WorkspaceID, string(p.Type), p.Name, p.Description, p.SortOrder)
		if err != nil {
			return fmt.Errorf("insert phase: %w", err)
		}
	}

	if len(phases) > 0 {
		_, err = tx.Exec(ctx,
			`UPDATE workspaces SET current_phase_id = $1 WHERE id = $2`, phases[0].ID, ws.ID)
		if err != nil {
			return fmt.Errorf("set current phase: %w", err)
		}
	}

	for _, a := range agents {
		_, err = tx.Exec(ctx,
			`INSERT INTO agents (id, workspace_id, type, name, avatar) VALUES ($1, $2, $3, $4, $5)`,
			a.ID, a.WorkspaceID, string(a.Type), a.Name, a.Avatar)
		if err != nil {
			return fmt.Errorf("insert agent: %w", err)
		}
	}

	return tx.Commit(ctx)
}

func (s *PostgresStore) UpdateWorkspace(ctx context.Context, id string, req models.UpdateWorkspaceReq) (*models.Workspace, error) {
	sets := make([]string, 0, 3)
	args := make([]any, 0, 3)
	idx := 1

	if req.Name != nil {
		sets = append(sets, fmt.Sprintf("name = $%d", idx))
		args = append(args, *req.Name)
		idx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", idx))
		args = append(args, *req.Description)
		idx++
	}

	if len(sets) == 0 {
		ws, err := scanWorkspace(s.pool.QueryRow(ctx, `SELECT `+workspaceCols+` FROM workspaces WHERE id = $1`, id))
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return nil, ErrNotFound
			}
			return nil, err
		}
		return ws, nil
	}

	sets = append(sets, "updated_at = NOW()")
	args = append(args, id)
	query := fmt.Sprintf("UPDATE workspaces SET %s WHERE id = $%d RETURNING %s",
		strings.Join(sets, ", "), idx, workspaceCols)

	ws, err := scanWorkspace(s.pool.QueryRow(ctx, query, args...))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update workspace: %w", err)
	}
	return ws, nil
}

func (s *PostgresStore) DeleteWorkspace(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete workspace: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) UpdateWorkspaceProgress(ctx context.Context, id string, progress float64) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE workspaces SET progress = $1, updated_at = NOW() WHERE id = $2`, progress, id)
	return err
}

func (s *PostgresStore) UpdateWorkspaceCurrentPhase(ctx context.Context, id string, phaseID *string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE workspaces SET current_phase_id = $1, updated_at = NOW() WHERE id = $2`, phaseID, id)
	return err
}

// ---------------------------------------------------------------------------
// Phase operations
// ---------------------------------------------------------------------------

func (s *PostgresStore) GetPhase(ctx context.Context, id string) (*models.Phase, error) {
	p, err := scanPhase(s.pool.QueryRow(ctx, `SELECT `+phaseCols+` FROM phases WHERE id = $1`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query phase: %w", err)
	}
	return p, nil
}

func (s *PostgresStore) UpdatePhaseStatus(ctx context.Context, id string, status string) (*models.Phase, error) {
	p, err := scanPhase(s.pool.QueryRow(ctx,
		`UPDATE phases SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING `+phaseCols, status, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update phase status: %w", err)
	}
	return p, nil
}

func (s *PostgresStore) UpdatePhaseStatusCAS(ctx context.Context, id, fromStatus, toStatus string) (*models.Phase, error) {
	p, err := scanPhase(s.pool.QueryRow(ctx,
		`UPDATE phases SET status = $1, updated_at = NOW() WHERE id = $2 AND status = $3 RETURNING `+phaseCols,
		toStatus, id, fromStatus))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("cas update phase status: %w", err)
	}
	return p, nil
}

func (s *PostgresStore) UpdatePhaseProgress(ctx context.Context, id string, progress float64) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE phases SET progress = $1, updated_at = NOW() WHERE id = $2`, progress, id)
	return err
}

func (s *PostgresStore) ListPhasesByWorkspace(ctx context.Context, workspaceID string) ([]models.Phase, error) {
	return s.queryPhases(ctx, []string{workspaceID})
}

// ResetWorkspacePhasePipeline sets every phase to pending, all tasks in the workspace to pending,
// clears workspace current phase pointer, and restarts requirements at the requirement phase.
func (s *PostgresStore) ResetWorkspacePhasePipeline(ctx context.Context, workspaceID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback(ctx)
		}
	}()

	if _, err := tx.Exec(ctx, `
		UPDATE tasks SET status = 'pending', assigned_agent = NULL, updated_at = NOW()
		WHERE workspace_id = $1`, workspaceID); err != nil {
		return fmt.Errorf("reset tasks: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE phases SET status = 'pending', progress = 0, updated_at = NOW()
		WHERE workspace_id = $1`, workspaceID); err != nil {
		return fmt.Errorf("reset phases: %w", err)
	}
	if _, err := tx.Exec(ctx, `
		UPDATE workspaces SET current_phase_id = NULL, progress = 0, updated_at = NOW()
		WHERE id = $1`, workspaceID); err != nil {
		return fmt.Errorf("reset workspace: %w", err)
	}

	reqStatus := string(models.RequirementInProgress)
	reqPhase := string(models.PhaseRequirement)
	if _, err := tx.Exec(ctx, `
		UPDATE requirements SET status = $1, current_phase = $2, progress = 0, updated_at = NOW()
		WHERE workspace_id = $3`, reqStatus, reqPhase, workspaceID); err != nil {
		return fmt.Errorf("reset requirements: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	committed = true
	return nil
}

// ---------------------------------------------------------------------------
// Task operations
// ---------------------------------------------------------------------------

func (s *PostgresStore) CreateTask(ctx context.Context, task *models.Task) error {
	var priority, assignedAgent *string
	if task.Priority != nil {
		v := string(*task.Priority)
		priority = &v
	}
	if task.AssignedAgent != nil {
		v := string(*task.AssignedAgent)
		assignedAgent = &v
	}
	return s.pool.QueryRow(ctx, `
		INSERT INTO tasks (id, phase_id, workspace_id, requirement_id, title, description, status, priority, labels, due_date, assigned_agent, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
			COALESCE((SELECT MAX(sort_order) FROM tasks WHERE phase_id = $2), -1) + 1)
		RETURNING sort_order, created_at, updated_at`,
		task.ID, task.PhaseID, task.WorkspaceID, task.RequirementID, task.Title, task.Description,
		string(task.Status), priority, task.Labels, task.DueDate, assignedAgent,
	).Scan(&task.SortOrder, &task.CreatedAt, &task.UpdatedAt)
}

func (s *PostgresStore) GetTask(ctx context.Context, id string) (*models.Task, error) {
	t, err := scanTask(s.pool.QueryRow(ctx, `SELECT `+taskCols+` FROM tasks WHERE id = $1`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query task: %w", err)
	}
	return t, nil
}

func (s *PostgresStore) UpdateTask(ctx context.Context, id string, workspaceID string, req models.UpdateTaskReq) (*models.Task, error) {
	sets := make([]string, 0, 8)
	args := make([]any, 0, 8)
	idx := 1

	if req.Title != nil {
		sets = append(sets, fmt.Sprintf("title = $%d", idx))
		args = append(args, *req.Title)
		idx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", idx))
		args = append(args, *req.Description)
		idx++
	}
	if req.Status != nil {
		sets = append(sets, fmt.Sprintf("status = $%d", idx))
		args = append(args, *req.Status)
		idx++
	}
	if req.Priority != nil {
		sets = append(sets, fmt.Sprintf("priority = $%d", idx))
		args = append(args, *req.Priority)
		idx++
	}
	if req.Labels != nil {
		sets = append(sets, fmt.Sprintf("labels = $%d", idx))
		args = append(args, req.Labels)
		idx++
	}
	if req.DueDate != nil {
		if *req.DueDate == "" {
			sets = append(sets, "due_date = NULL")
		} else {
			parsed, err := time.Parse("2006-01-02", *req.DueDate)
			if err != nil {
				return nil, fmt.Errorf("invalid due date: %w", err)
			}
			sets = append(sets, fmt.Sprintf("due_date = $%d", idx))
			args = append(args, parsed)
			idx++
		}
	}
	if req.AssignedAgent != nil {
		if *req.AssignedAgent == "" {
			sets = append(sets, "assigned_agent = NULL")
		} else {
			sets = append(sets, fmt.Sprintf("assigned_agent = $%d", idx))
			args = append(args, *req.AssignedAgent)
			idx++
		}
	}

	if len(sets) == 0 {
		return s.GetTask(ctx, id)
	}

	sets = append(sets, "updated_at = NOW()")
	args = append(args, id)
	idIdx := idx
	idx++
	args = append(args, workspaceID)
	wsIdx := idx
	query := fmt.Sprintf("UPDATE tasks SET %s WHERE id = $%d AND workspace_id = $%d RETURNING %s",
		strings.Join(sets, ", "), idIdx, wsIdx, taskCols)

	t, err := scanTask(s.pool.QueryRow(ctx, query, args...))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update task: %w", err)
	}
	return t, nil
}

func (s *PostgresStore) ClaimTask(ctx context.Context, id string, workspaceID string, agent string) (*models.Task, error) {
	query := fmt.Sprintf(
		`UPDATE tasks SET status = 'in_progress', assigned_agent = $3, updated_at = NOW()
		 WHERE id = $1 AND workspace_id = $2 AND status = 'pending'
		 RETURNING %s`, taskCols)
	t, err := scanTask(s.pool.QueryRow(ctx, query, id, workspaceID, agent))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("claim task: %w", err)
	}
	return t, nil
}

func (s *PostgresStore) DeleteTask(ctx context.Context, id string, workspaceID string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM tasks WHERE id = $1 AND workspace_id = $2`, id, workspaceID)
	if err != nil {
		return fmt.Errorf("delete task: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) ReorderTasks(ctx context.Context, phaseID string, taskIDs []string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	for i, taskID := range taskIDs {
		_, err := tx.Exec(ctx,
			`UPDATE tasks SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND phase_id = $3`,
			i, taskID, phaseID)
		if err != nil {
			return fmt.Errorf("reorder task: %w", err)
		}
	}

	return tx.Commit(ctx)
}

func (s *PostgresStore) CountTasksByPhase(ctx context.Context, phaseID string) (int, int, error) {
	var total, completed int
	err := s.pool.QueryRow(ctx, `
		SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'completed')
		FROM tasks WHERE phase_id = $1`, phaseID).Scan(&total, &completed)
	if err != nil {
		return 0, 0, fmt.Errorf("count tasks: %w", err)
	}
	return total, completed, nil
}

// ---------------------------------------------------------------------------
// Agent operations
// ---------------------------------------------------------------------------

func (s *PostgresStore) ListAgentsByWorkspace(ctx context.Context, workspaceID string) ([]models.Agent, error) {
	return s.queryAgents(ctx, []string{workspaceID})
}

// ---------------------------------------------------------------------------
// Activity operations
// ---------------------------------------------------------------------------

func (s *PostgresStore) CreateActivity(ctx context.Context, activity *models.Activity) error {
	var agentType *string
	if activity.AgentType != nil {
		v := string(*activity.AgentType)
		agentType = &v
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO activities (id, workspace_id, type, description, agent_type) VALUES ($1, $2, $3, $4, $5)`,
		activity.ID, activity.WorkspaceID, activity.Type, activity.Description, agentType)
	if err != nil {
		return fmt.Errorf("insert activity: %w", err)
	}
	return nil
}

func (s *PostgresStore) ListActivities(ctx context.Context, workspaceID string, page, pageSize int) ([]models.Activity, int64, error) {
	var total int64
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM activities WHERE workspace_id = $1`, workspaceID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count activities: %w", err)
	}

	offset := (page - 1) * pageSize
	rows, err := s.pool.Query(ctx, `
		SELECT id, workspace_id, requirement_id, type, description, agent_type, created_at
		FROM activities WHERE workspace_id = $1
		ORDER BY created_at DESC LIMIT $2 OFFSET $3`, workspaceID, pageSize, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("query activities: %w", err)
	}
	defer rows.Close()

	var activities []models.Activity
	for rows.Next() {
		a, err := scanActivity(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("scan activity: %w", err)
		}
		activities = append(activities, *a)
	}
	if activities == nil {
		activities = []models.Activity{}
	}
	return activities, total, nil
}

// ---------------------------------------------------------------------------
// Batch query helpers (used by List/Get workspace)
// ---------------------------------------------------------------------------

func (s *PostgresStore) queryPhases(ctx context.Context, wsIDs []string) ([]models.Phase, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+phaseCols+` FROM phases WHERE workspace_id = ANY($1) ORDER BY sort_order`, wsIDs)
	if err != nil {
		return nil, fmt.Errorf("query phases: %w", err)
	}
	defer rows.Close()

	var phases []models.Phase
	for rows.Next() {
		p, err := scanPhase(rows)
		if err != nil {
			return nil, fmt.Errorf("scan phase: %w", err)
		}
		phases = append(phases, *p)
	}
	if phases == nil {
		phases = []models.Phase{}
	}
	return phases, nil
}

func (s *PostgresStore) queryAgents(ctx context.Context, wsIDs []string) ([]models.Agent, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, type, name, status, preferred_model, avatar, created_at, updated_at
		 FROM agents WHERE workspace_id = ANY($1) ORDER BY type`, wsIDs)
	if err != nil {
		return nil, fmt.Errorf("query agents: %w", err)
	}
	defer rows.Close()

	var agents []models.Agent
	for rows.Next() {
		a, err := scanAgent(rows)
		if err != nil {
			return nil, fmt.Errorf("scan agent: %w", err)
		}
		agents = append(agents, *a)
	}
	if agents == nil {
		agents = []models.Agent{}
	}
	return agents, nil
}

func (s *PostgresStore) queryRecentActivities(ctx context.Context, wsIDs []string, limit int) ([]models.Activity, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, workspace_id, requirement_id, type, description, agent_type, created_at FROM (
			SELECT *, ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY created_at DESC) AS rn
			FROM activities WHERE workspace_id = ANY($1)
		) sub WHERE rn <= $2 ORDER BY created_at DESC`, wsIDs, limit)
	if err != nil {
		return nil, fmt.Errorf("query recent activities: %w", err)
	}
	defer rows.Close()

	var activities []models.Activity
	for rows.Next() {
		a, err := scanActivity(rows)
		if err != nil {
			return nil, fmt.Errorf("scan activity: %w", err)
		}
		activities = append(activities, *a)
	}
	if activities == nil {
		activities = []models.Activity{}
	}
	return activities, nil
}

// ---------------------------------------------------------------------------
// Artifact operations
// ---------------------------------------------------------------------------

const artifactCols = `id, workspace_id, execution_id, agent_type, type, title, content, metadata, version, created_at, updated_at`

func scanArtifact(s rowScanner) (*models.Artifact, error) {
	var a models.Artifact
	err := s.Scan(&a.ID, &a.WorkspaceID, &a.ExecutionID,
		&a.AgentType, &a.Type, &a.Title, &a.Content, &a.Metadata,
		&a.Version, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *PostgresStore) CreateArtifact(ctx context.Context, artifact *models.Artifact) error {
	return s.pool.QueryRow(ctx, `
		INSERT INTO artifacts (id, workspace_id, execution_id, agent_type, type, title, content, metadata, version)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		RETURNING created_at, updated_at`,
		artifact.ID, artifact.WorkspaceID, artifact.ExecutionID,
		string(artifact.AgentType), artifact.Type, artifact.Title, artifact.Content,
		artifact.Metadata, artifact.Version,
	).Scan(&artifact.CreatedAt, &artifact.UpdatedAt)
}

func (s *PostgresStore) ListArtifactsByWorkspace(ctx context.Context, workspaceID string) ([]models.Artifact, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+artifactCols+` FROM artifacts WHERE workspace_id = $1 ORDER BY created_at DESC`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("query artifacts: %w", err)
	}
	defer rows.Close()

	var artifacts []models.Artifact
	for rows.Next() {
		a, err := scanArtifact(rows)
		if err != nil {
			return nil, fmt.Errorf("scan artifact: %w", err)
		}
		artifacts = append(artifacts, *a)
	}
	if artifacts == nil {
		artifacts = []models.Artifact{}
	}
	return artifacts, nil
}

func (s *PostgresStore) ListArtifactsByExecution(ctx context.Context, workspaceID, executionID string) ([]models.Artifact, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+artifactCols+` FROM artifacts WHERE workspace_id = $1 AND execution_id = $2 ORDER BY created_at DESC`,
		workspaceID, executionID)
	if err != nil {
		return nil, fmt.Errorf("query artifacts by execution: %w", err)
	}
	defer rows.Close()

	var artifacts []models.Artifact
	for rows.Next() {
		a, err := scanArtifact(rows)
		if err != nil {
			return nil, fmt.Errorf("scan artifact: %w", err)
		}
		artifacts = append(artifacts, *a)
	}
	if artifacts == nil {
		artifacts = []models.Artifact{}
	}
	return artifacts, nil
}

func (s *PostgresStore) GetArtifact(ctx context.Context, workspaceID, id string) (*models.Artifact, error) {
	a, err := scanArtifact(s.pool.QueryRow(ctx, `SELECT `+artifactCols+` FROM artifacts WHERE id = $1 AND workspace_id = $2`, id, workspaceID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query artifact: %w", err)
	}
	return a, nil
}

// ---------------------------------------------------------------------------
// GitLab credentials
// ---------------------------------------------------------------------------

const credCols = `id, gitlab_url, token_enc, COALESCE(token_hint,''), COALESCE(label,''), COALESCE(created_by,''), created_at, updated_at`

func scanCredential(s rowScanner) (*models.GitLabCredential, error) {
	var c models.GitLabCredential
	err := s.Scan(&c.ID, &c.GitLabURL, &c.TokenEnc, &c.TokenHint, &c.Label, &c.CreatedBy, &c.CreatedAt, &c.UpdatedAt)
	return &c, err
}

func (s *PostgresStore) CreateGitLabCredential(ctx context.Context, cred *models.GitLabCredential) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO gitlab_credentials (id, gitlab_url, token_enc, token_hint, label, created_by)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		cred.ID, cred.GitLabURL, cred.TokenEnc, cred.TokenHint, cred.Label, cred.CreatedBy)
	return err
}

func (s *PostgresStore) ListGitLabCredentials(ctx context.Context) ([]models.GitLabCredential, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+credCols+` FROM gitlab_credentials ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.GitLabCredential
	for rows.Next() {
		c, err := scanCredential(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	if out == nil {
		out = []models.GitLabCredential{}
	}
	return out, nil
}

func (s *PostgresStore) GetGitLabCredential(ctx context.Context, id string) (*models.GitLabCredential, error) {
	c, err := scanCredential(s.pool.QueryRow(ctx, `SELECT `+credCols+` FROM gitlab_credentials WHERE id = $1`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return c, nil
}

func (s *PostgresStore) DeleteGitLabCredential(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM gitlab_credentials WHERE id = $1`, id)
	return err
}

// ---------------------------------------------------------------------------
// Workspace repos
// ---------------------------------------------------------------------------

const repoCols = `wr.id, wr.workspace_id, wr.credential_id, wr.project_id, wr.project_name,
	COALESCE(wr.project_url,''), gc.gitlab_url,
	wr.role, wr.is_primary, wr.branch_default, wr.branch_strategy,
	COALESCE(wr.phase_types, '{}'), wr.created_at, wr.updated_at`

func scanRepo(s rowScanner) (*models.WorkspaceRepo, error) {
	var r models.WorkspaceRepo
	err := s.Scan(
		&r.ID, &r.WorkspaceID, &r.CredentialID, &r.ProjectID, &r.ProjectName,
		&r.ProjectURL, &r.GitLabURL,
		&r.Role, &r.IsPrimary, &r.BranchDefault, &r.BranchStrategy,
		&r.PhaseTypes, &r.CreatedAt, &r.UpdatedAt,
	)
	if r.PhaseTypes == nil {
		r.PhaseTypes = []string{}
	}
	return &r, err
}

const repoJoin = `FROM workspace_repos wr
	JOIN gitlab_credentials gc ON gc.id = wr.credential_id`

func (s *PostgresStore) CreateWorkspaceRepo(ctx context.Context, repo *models.WorkspaceRepo) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO workspace_repos
		 (id, workspace_id, credential_id, project_id, project_name, project_url,
		  role, is_primary, branch_default, branch_strategy, phase_types)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
		repo.ID, repo.WorkspaceID, repo.CredentialID, repo.ProjectID, repo.ProjectName,
		repo.ProjectURL, repo.Role, repo.IsPrimary, repo.BranchDefault, repo.BranchStrategy,
		repo.PhaseTypes)
	return err
}

func (s *PostgresStore) ListWorkspaceRepos(ctx context.Context, workspaceID string) ([]models.WorkspaceRepo, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+repoCols+` `+repoJoin+` WHERE wr.workspace_id = $1 ORDER BY wr.is_primary DESC, wr.created_at`,
		workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.WorkspaceRepo
	for rows.Next() {
		r, err := scanRepo(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	if out == nil {
		out = []models.WorkspaceRepo{}
	}
	return out, nil
}

func (s *PostgresStore) GetWorkspaceRepo(ctx context.Context, id string) (*models.WorkspaceRepo, error) {
	r, err := scanRepo(s.pool.QueryRow(ctx,
		`SELECT `+repoCols+` `+repoJoin+` WHERE wr.id = $1`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return r, nil
}

func (s *PostgresStore) UpdateWorkspaceRepo(ctx context.Context, id string, req models.UpdateWorkspaceRepoReq) (*models.WorkspaceRepo, error) {
	sets := []string{"updated_at = NOW()"}
	args := []any{id}
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	if req.ProjectName != nil {
		add("project_name", *req.ProjectName)
	}
	if req.ProjectURL != nil {
		add("project_url", *req.ProjectURL)
	}
	if req.Role != nil {
		add("role", *req.Role)
	}
	if req.IsPrimary != nil {
		add("is_primary", *req.IsPrimary)
	}
	if req.BranchDefault != nil {
		add("branch_default", *req.BranchDefault)
	}
	if req.BranchStrategy != nil {
		add("branch_strategy", *req.BranchStrategy)
	}
	if req.PhaseTypes != nil {
		add("phase_types", req.PhaseTypes)
	}

	q := fmt.Sprintf(`UPDATE workspace_repos SET %s WHERE id = $1`, strings.Join(sets, ", "))
	if _, err := s.pool.Exec(ctx, q, args...); err != nil {
		return nil, err
	}
	return s.GetWorkspaceRepo(ctx, id)
}

func (s *PostgresStore) DeleteWorkspaceRepo(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM workspace_repos WHERE id = $1`, id)
	return err
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

func (s *PostgresStore) CreateUser(ctx context.Context, user *models.User) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO users (id, email, name, password_hash, status) VALUES ($1, $2, $3, $4, $5)`,
		user.ID, user.Email, user.Name, user.PasswordHash, user.Status)
	return err
}

func (s *PostgresStore) GetUserByEmail(ctx context.Context, email string) (*models.User, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT id, email, name, password_hash, avatar_url, status, created_at, updated_at FROM users WHERE email = $1`,
		email)
	var u models.User
	if err := row.Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.AvatarURL, &u.Status, &u.CreatedAt, &u.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func (s *PostgresStore) GetUser(ctx context.Context, id string) (*models.User, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT id, email, name, password_hash, avatar_url, status, created_at, updated_at FROM users WHERE id = $1`,
		id)
	var u models.User
	if err := row.Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.AvatarURL, &u.Status, &u.CreatedAt, &u.UpdatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

// ---------------------------------------------------------------------------
// Workspace members
// ---------------------------------------------------------------------------

func (s *PostgresStore) AddMember(ctx context.Context, member *models.WorkspaceMember) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO workspace_members (id, workspace_id, user_id, role) VALUES ($1, $2, $3, $4)`,
		member.ID, member.WorkspaceID, member.UserID, member.Role)
	return err
}

func (s *PostgresStore) ListMembers(ctx context.Context, workspaceID string) ([]models.WorkspaceMember, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT wm.id, wm.workspace_id, wm.user_id, wm.role, wm.created_at,
		        u.email AS user_email, u.name AS user_name
		 FROM workspace_members wm
		 JOIN users u ON u.id = wm.user_id
		 WHERE wm.workspace_id = $1
		 ORDER BY wm.created_at`,
		workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.WorkspaceMember
	for rows.Next() {
		var m models.WorkspaceMember
		if err := rows.Scan(&m.ID, &m.WorkspaceID, &m.UserID, &m.Role, &m.CreatedAt, &m.UserEmail, &m.UserName); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	if out == nil {
		out = []models.WorkspaceMember{}
	}
	return out, nil
}

func (s *PostgresStore) RemoveMember(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM workspace_members WHERE id = $1`, id)
	return err
}

func (s *PostgresStore) GetMemberByUserAndWorkspace(ctx context.Context, userID, workspaceID string) (*models.WorkspaceMember, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, user_id, role, created_at FROM workspace_members
		 WHERE user_id = $1 AND workspace_id = $2`,
		userID, workspaceID)
	var m models.WorkspaceMember
	if err := row.Scan(&m.ID, &m.WorkspaceID, &m.UserID, &m.Role, &m.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &m, nil
}

// ---------------------------------------------------------------------------
// Requirement operations
// ---------------------------------------------------------------------------

const requirementCols = `id, workspace_id, title, description, status, current_phase, priority, iteration, progress, sort_order, created_at, updated_at`

func scanRequirement(sc rowScanner) (*models.Requirement, error) {
	var r models.Requirement
	var status string
	var priority *string
	err := sc.Scan(&r.ID, &r.WorkspaceID, &r.Title, &r.Description,
		&status, &r.CurrentPhase, &priority, &r.Iteration, &r.Progress,
		&r.SortOrder, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	r.Status = models.RequirementStatus(status)
	if priority != nil {
		p := models.TaskPriority(*priority)
		r.Priority = &p
	}
	r.Tasks = []models.Task{}
	r.Artifacts = []models.Artifact{}
	r.Relations = []models.RequirementRelation{}
	return &r, nil
}

func (s *PostgresStore) CreateRequirement(ctx context.Context, req *models.Requirement) error {
	var priority *string
	if req.Priority != nil {
		v := string(*req.Priority)
		priority = &v
	}
	return s.pool.QueryRow(ctx, `
		INSERT INTO requirements (id, workspace_id, title, description, status, current_phase, priority, iteration, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
			COALESCE((SELECT MAX(sort_order) FROM requirements WHERE workspace_id = $2), -1) + 1)
		RETURNING sort_order, created_at, updated_at`,
		req.ID, req.WorkspaceID, req.Title, req.Description,
		string(req.Status), req.CurrentPhase, priority, req.Iteration,
	).Scan(&req.SortOrder, &req.CreatedAt, &req.UpdatedAt)
}

func (s *PostgresStore) GetRequirement(ctx context.Context, id, wsID string) (*models.Requirement, error) {
	r, err := scanRequirement(s.pool.QueryRow(ctx,
		`SELECT `+requirementCols+` FROM requirements WHERE id = $1 AND workspace_id = $2`, id, wsID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query requirement: %w", err)
	}

	taskRows, err := s.pool.Query(ctx,
		`SELECT `+taskCols+` FROM tasks WHERE requirement_id = $1 ORDER BY sort_order`, id)
	if err != nil {
		return nil, fmt.Errorf("query requirement tasks: %w", err)
	}
	defer taskRows.Close()
	for taskRows.Next() {
		t, err := scanTask(taskRows)
		if err != nil {
			return nil, fmt.Errorf("scan requirement task: %w", err)
		}
		r.Tasks = append(r.Tasks, *t)
	}

	relRows, err := s.pool.Query(ctx, `
		SELECT rr.id, rr.workspace_id, rr.source_id, rr.target_id, rr.relation_type,
		       rr.description, r2.title AS target_title, rr.created_at
		FROM requirement_relations rr
		JOIN requirements r2 ON (CASE WHEN rr.source_id = $1 THEN rr.target_id ELSE rr.source_id END) = r2.id
		WHERE rr.source_id = $1 OR rr.target_id = $1`, id)
	if err != nil {
		return nil, fmt.Errorf("query requirement relations: %w", err)
	}
	defer relRows.Close()
	for relRows.Next() {
		var rel models.RequirementRelation
		var relType string
		if err := relRows.Scan(&rel.ID, &rel.WorkspaceID, &rel.SourceID, &rel.TargetID,
			&relType, &rel.Description, &rel.TargetTitle, &rel.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan requirement relation: %w", err)
		}
		rel.RelationType = models.RelationType(relType)
		r.Relations = append(r.Relations, rel)
	}

	r.TaskCount = len(r.Tasks)
	for _, t := range r.Tasks {
		if t.Status == models.StatusCompleted {
			r.DoneCount++
		}
	}

	return r, nil
}

func (s *PostgresStore) ListRequirements(ctx context.Context, wsID string) ([]models.Requirement, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT r.id, r.workspace_id, r.title, r.description, r.status, r.current_phase,
		       r.priority, r.iteration, r.progress, r.sort_order, r.created_at, r.updated_at,
		       (SELECT COUNT(*) FROM tasks WHERE requirement_id = r.id) AS task_count,
		       (SELECT COUNT(*) FROM tasks WHERE requirement_id = r.id AND status = 'completed') AS done_count
		FROM requirements r WHERE r.workspace_id = $1 ORDER BY r.sort_order`, wsID)
	if err != nil {
		return nil, fmt.Errorf("query requirements: %w", err)
	}
	defer rows.Close()

	var reqs []models.Requirement
	for rows.Next() {
		var r models.Requirement
		var status string
		var priority *string
		if err := rows.Scan(&r.ID, &r.WorkspaceID, &r.Title, &r.Description,
			&status, &r.CurrentPhase, &priority, &r.Iteration, &r.Progress,
			&r.SortOrder, &r.CreatedAt, &r.UpdatedAt, &r.TaskCount, &r.DoneCount); err != nil {
			return nil, fmt.Errorf("scan requirement: %w", err)
		}
		r.Status = models.RequirementStatus(status)
		if priority != nil {
			p := models.TaskPriority(*priority)
			r.Priority = &p
		}
		reqs = append(reqs, r)
	}
	if reqs == nil {
		reqs = []models.Requirement{}
	}
	if len(reqs) == 0 {
		return reqs, nil
	}

	byID := make(map[string]*models.Requirement, len(reqs))
	for i := range reqs {
		byID[reqs[i].ID] = &reqs[i]
	}

	relRows, err := s.pool.Query(ctx, `
		SELECT rr.id, rr.workspace_id, rr.source_id, rr.target_id, rr.relation_type,
		       rr.description, rr.created_at,
		       st.title, tt.title
		FROM requirement_relations rr
		INNER JOIN requirements st ON st.id = rr.source_id AND st.workspace_id = rr.workspace_id
		INNER JOIN requirements tt ON tt.id = rr.target_id AND tt.workspace_id = rr.workspace_id
		WHERE rr.workspace_id = $1`, wsID)
	if err != nil {
		return nil, fmt.Errorf("query requirement relations for workspace: %w", err)
	}
	defer relRows.Close()

	for relRows.Next() {
		var id, wid, srcID, tgtID, relType, desc string
		var createdAt time.Time
		var srcTitle, tgtTitle string
		if err := relRows.Scan(&id, &wid, &srcID, &tgtID, &relType, &desc, &createdAt, &srcTitle, &tgtTitle); err != nil {
			return nil, fmt.Errorf("scan workspace requirement relation: %w", err)
		}
		rt := models.RelationType(relType)

		if src := byID[srcID]; src != nil {
			src.Relations = append(src.Relations, models.RequirementRelation{
				ID: id, WorkspaceID: wid, SourceID: srcID, TargetID: tgtID,
				RelationType: rt, Description: desc, TargetTitle: tgtTitle, CreatedAt: createdAt,
			})
		}
		if tgt := byID[tgtID]; tgt != nil {
			tgt.Relations = append(tgt.Relations, models.RequirementRelation{
				ID: id, WorkspaceID: wid, SourceID: srcID, TargetID: tgtID,
				RelationType: rt, Description: desc, TargetTitle: srcTitle, CreatedAt: createdAt,
			})
		}
	}
	if err := relRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate workspace requirement relations: %w", err)
	}

	return reqs, nil
}

func (s *PostgresStore) UpdateRequirement(ctx context.Context, id, wsID string, req models.UpdateRequirementReq) (*models.Requirement, error) {
	sets := make([]string, 0, 8)
	args := make([]any, 0, 8)
	idx := 1

	if req.Title != nil {
		sets = append(sets, fmt.Sprintf("title = $%d", idx))
		args = append(args, *req.Title)
		idx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", idx))
		args = append(args, *req.Description)
		idx++
	}
	if req.Status != nil {
		sets = append(sets, fmt.Sprintf("status = $%d", idx))
		args = append(args, *req.Status)
		idx++
	}
	if req.CurrentPhase != nil {
		sets = append(sets, fmt.Sprintf("current_phase = $%d", idx))
		args = append(args, *req.CurrentPhase)
		idx++
	}
	if req.Priority != nil {
		sets = append(sets, fmt.Sprintf("priority = $%d", idx))
		args = append(args, *req.Priority)
		idx++
	}
	if req.Iteration != nil {
		sets = append(sets, fmt.Sprintf("iteration = $%d", idx))
		args = append(args, *req.Iteration)
		idx++
	}
	if req.Progress != nil {
		sets = append(sets, fmt.Sprintf("progress = $%d", idx))
		args = append(args, *req.Progress)
		idx++
	}
	if req.SortOrder != nil {
		sets = append(sets, fmt.Sprintf("sort_order = $%d", idx))
		args = append(args, *req.SortOrder)
		idx++
	}

	if len(sets) == 0 {
		return s.getRequirementLightweight(ctx, id, wsID)
	}

	sets = append(sets, "updated_at = NOW()")
	args = append(args, id)
	idIdx := idx
	idx++
	args = append(args, wsID)
	wsIdx := idx
	query := fmt.Sprintf("UPDATE requirements SET %s WHERE id = $%d AND workspace_id = $%d RETURNING %s",
		strings.Join(sets, ", "), idIdx, wsIdx, requirementCols)

	r, err := scanRequirement(s.pool.QueryRow(ctx, query, args...))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update requirement: %w", err)
	}
	return r, nil
}

func (s *PostgresStore) getRequirementLightweight(ctx context.Context, id, wsID string) (*models.Requirement, error) {
	r, err := scanRequirement(s.pool.QueryRow(ctx,
		`SELECT `+requirementCols+` FROM requirements WHERE id = $1 AND workspace_id = $2`, id, wsID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return r, nil
}

func (s *PostgresStore) DeleteRequirement(ctx context.Context, id, wsID string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM requirements WHERE id = $1 AND workspace_id = $2`, id, wsID)
	if err != nil {
		return fmt.Errorf("delete requirement: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Requirement relation operations
// ---------------------------------------------------------------------------

func (s *PostgresStore) CreateRequirementRelation(ctx context.Context, rel *models.RequirementRelation) error {
	return s.pool.QueryRow(ctx, `
		INSERT INTO requirement_relations (id, workspace_id, source_id, target_id, relation_type, description)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING created_at`,
		rel.ID, rel.WorkspaceID, rel.SourceID, rel.TargetID,
		string(rel.RelationType), rel.Description,
	).Scan(&rel.CreatedAt)
}

func (s *PostgresStore) DeleteRequirementRelation(ctx context.Context, id, wsID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM requirement_relations WHERE id = $1 AND workspace_id = $2`, id, wsID)
	if err != nil {
		return fmt.Errorf("delete requirement relation: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) GetRelatedRequirementArtifacts(ctx context.Context, reqID, wsID string) (map[string][]models.Artifact, error) {
	relRows, err := s.pool.Query(ctx, `
		SELECT rr.relation_type,
		       CASE WHEN rr.source_id = $1 THEN rr.target_id ELSE rr.source_id END AS related_id
		FROM requirement_relations rr
		WHERE (rr.source_id = $1 OR rr.target_id = $1) AND rr.workspace_id = $2`, reqID, wsID)
	if err != nil {
		return nil, fmt.Errorf("query related requirements: %w", err)
	}
	defer relRows.Close()

	type relInfo struct {
		relationType string
		relatedID    string
	}
	var rels []relInfo
	for relRows.Next() {
		var ri relInfo
		if err := relRows.Scan(&ri.relationType, &ri.relatedID); err != nil {
			return nil, fmt.Errorf("scan relation: %w", err)
		}
		rels = append(rels, ri)
	}

	result := make(map[string][]models.Artifact)
	for _, ri := range rels {
		artRows, err := s.pool.Query(ctx,
			`SELECT `+artifactCols+` FROM artifacts a
			 WHERE a.workspace_id = $2 AND a.execution_id IN (
			   SELECT ae.id FROM agent_executions ae WHERE ae.requirement_id = $1
			 ) ORDER BY a.created_at DESC`,
			ri.relatedID, wsID)
		if err != nil {
			return nil, fmt.Errorf("query related artifacts: %w", err)
		}
		defer artRows.Close()
		for artRows.Next() {
			a, err := scanArtifact(artRows)
			if err != nil {
				return nil, fmt.Errorf("scan related artifact: %w", err)
			}
			result[ri.relationType] = append(result[ri.relationType], *a)
		}
	}

	return result, nil
}

// ---------------------------------------------------------------------------
// Requirement phase task reset
// ---------------------------------------------------------------------------

func (s *PostgresStore) ResetRequirementPhaseTasks(ctx context.Context, reqID, phaseID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE tasks SET status = 'pending', assigned_agent = NULL, updated_at = NOW()
		WHERE requirement_id = $1 AND phase_id = $2 AND status != 'pending'`,
		reqID, phaseID)
	if err != nil {
		return fmt.Errorf("reset requirement phase tasks: %w", err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// Artifact upsert
// ---------------------------------------------------------------------------

func (s *PostgresStore) UpsertArtifact(ctx context.Context, art *models.Artifact) error {
	return s.pool.QueryRow(ctx, `
		INSERT INTO artifacts (id, workspace_id, execution_id, agent_type, type, title, content, metadata, version)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, title = EXCLUDED.title,
		             metadata = EXCLUDED.metadata,
		             version = artifacts.version + 1, updated_at = NOW()
		RETURNING id, version, created_at, updated_at`,
		art.ID, art.WorkspaceID, art.ExecutionID,
		string(art.AgentType), art.Type, art.Title, art.Content, art.Metadata, art.Version,
	).Scan(&art.ID, &art.Version, &art.CreatedAt, &art.UpdatedAt)
}

// ListReposForPhase returns repos matching a phase type (or repos with no phase restriction).
func (s *PostgresStore) ListReposForPhase(ctx context.Context, workspaceID, phaseType string) ([]models.WorkspaceRepo, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+repoCols+` `+repoJoin+`
		 WHERE wr.workspace_id = $1
		   AND (wr.phase_types IS NULL OR wr.phase_types = '{}' OR $2 = ANY(wr.phase_types))
		 ORDER BY wr.is_primary DESC, wr.created_at`,
		workspaceID, phaseType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.WorkspaceRepo
	for rows.Next() {
		r, err := scanRepo(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	if out == nil {
		out = []models.WorkspaceRepo{}
	}
	return out, nil
}
