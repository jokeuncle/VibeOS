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
	UpdatePhaseProgress(ctx context.Context, id string, progress float64) error
	ListPhasesByWorkspace(ctx context.Context, workspaceID string) ([]models.Phase, error)

	CreateTask(ctx context.Context, task *models.Task) error
	GetTask(ctx context.Context, id string) (*models.Task, error)
	UpdateTask(ctx context.Context, id string, workspaceID string, req models.UpdateTaskReq) (*models.Task, error)
	DeleteTask(ctx context.Context, id string, workspaceID string) error
	ReorderTasks(ctx context.Context, phaseID string, taskIDs []string) error
	CountTasksByPhase(ctx context.Context, phaseID string) (total int, completed int, err error)

	ListAgentsByWorkspace(ctx context.Context, workspaceID string) ([]models.Agent, error)

	CreateActivity(ctx context.Context, activity *models.Activity) error
	ListActivities(ctx context.Context, workspaceID string, page, pageSize int) ([]models.Activity, int64, error)

	CreateArtifact(ctx context.Context, artifact *models.Artifact) error
	ListArtifactsByWorkspace(ctx context.Context, workspaceID string) ([]models.Artifact, error)
	ListArtifactsByPhase(ctx context.Context, workspaceID, phaseID string) ([]models.Artifact, error)
	GetArtifact(ctx context.Context, workspaceID, id string) (*models.Artifact, error)

	// GitLab credential store
	CreateGitLabCredential(ctx context.Context, cred *models.GitLabCredential) error
	ListGitLabCredentials(ctx context.Context) ([]models.GitLabCredential, error)
	GetGitLabCredential(ctx context.Context, id string) (*models.GitLabCredential, error)
	DeleteGitLabCredential(ctx context.Context, id string) error

	// Workspace repo bindings
	CreateWorkspaceRepo(ctx context.Context, repo *models.WorkspaceRepo) error
	ListWorkspaceRepos(ctx context.Context, workspaceID string) ([]models.WorkspaceRepo, error)
	GetWorkspaceRepo(ctx context.Context, id string) (*models.WorkspaceRepo, error)
	UpdateWorkspaceRepo(ctx context.Context, id string, req models.UpdateWorkspaceRepoReq) (*models.WorkspaceRepo, error)
	DeleteWorkspaceRepo(ctx context.Context, id string) error
	ListReposForPhase(ctx context.Context, workspaceID, phaseType string) ([]models.WorkspaceRepo, error)
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

const taskCols = `id, phase_id, workspace_id, title, description, status, priority, labels, due_date, assigned_agent, sort_order, created_at, updated_at`

func scanTask(s rowScanner) (*models.Task, error) {
	var t models.Task
	var status string
	var priority, assignedAgent *string
	err := s.Scan(&t.ID, &t.PhaseID, &t.WorkspaceID, &t.Title, &t.Description,
		&status, &priority, &t.Labels, &t.DueDate, &assignedAgent,
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
		&a.CurrentTask, &a.Avatar, &a.CreatedAt, &a.UpdatedAt)
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
	err := s.Scan(&a.ID, &a.WorkspaceID, &a.Type, &a.Description, &agentType, &a.CreatedAt)
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

func (s *PostgresStore) UpdatePhaseProgress(ctx context.Context, id string, progress float64) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE phases SET progress = $1, updated_at = NOW() WHERE id = $2`, progress, id)
	return err
}

func (s *PostgresStore) ListPhasesByWorkspace(ctx context.Context, workspaceID string) ([]models.Phase, error) {
	return s.queryPhases(ctx, []string{workspaceID})
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
		INSERT INTO tasks (id, phase_id, workspace_id, title, description, status, priority, labels, due_date, assigned_agent, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
			COALESCE((SELECT MAX(sort_order) FROM tasks WHERE phase_id = $2), -1) + 1)
		RETURNING sort_order, created_at, updated_at`,
		task.ID, task.PhaseID, task.WorkspaceID, task.Title, task.Description,
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
		SELECT id, workspace_id, type, description, agent_type, created_at
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
		`SELECT id, workspace_id, type, name, status, current_task, avatar, created_at, updated_at
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
		SELECT id, workspace_id, type, description, agent_type, created_at FROM (
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

const artifactCols = `id, workspace_id, phase_id, task_id, agent_type, type, title, content, metadata, version, created_at, updated_at`

func scanArtifact(s rowScanner) (*models.Artifact, error) {
	var a models.Artifact
	err := s.Scan(&a.ID, &a.WorkspaceID, &a.PhaseID, &a.TaskID,
		&a.AgentType, &a.Type, &a.Title, &a.Content, &a.Metadata,
		&a.Version, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *PostgresStore) CreateArtifact(ctx context.Context, artifact *models.Artifact) error {
	return s.pool.QueryRow(ctx, `
		INSERT INTO artifacts (id, workspace_id, phase_id, task_id, agent_type, type, title, content, metadata, version)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING created_at, updated_at`,
		artifact.ID, artifact.WorkspaceID, artifact.PhaseID, artifact.TaskID,
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

func (s *PostgresStore) ListArtifactsByPhase(ctx context.Context, workspaceID, phaseID string) ([]models.Artifact, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+artifactCols+` FROM artifacts WHERE workspace_id = $1 AND phase_id = $2 ORDER BY created_at DESC`,
		workspaceID, phaseID)
	if err != nil {
		return nil, fmt.Errorf("query artifacts by phase: %w", err)
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
