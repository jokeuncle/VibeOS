package store

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/vibeos/shared/models"
)

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

func scanAgent(s rowScanner) (*models.Agent, error) {
	var a models.Agent
	var agentType, status string
	err := s.Scan(&a.ID, &a.WorkspaceID, &agentType, &a.Name, &status,
		&a.PreferredModel, &a.SystemPromptTemplate, &a.ToolManifest, &a.Capabilities,
		&a.Avatar, &a.CreatedAt, &a.UpdatedAt)
	if err != nil {
		return nil, err
	}
	a.Type = models.AgentType(agentType)
	a.Status = models.AgentStatus(status)
	return &a, nil
}

// ---------------------------------------------------------------------------
// Workspace CRUD
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
// Agent operations
// ---------------------------------------------------------------------------

func (s *PostgresStore) ListAgentsByWorkspace(ctx context.Context, workspaceID string) ([]models.Agent, error) {
	return s.queryAgents(ctx, []string{workspaceID})
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
		`SELECT id, workspace_id, type, name, status, preferred_model,
		        system_prompt_template, tool_manifest, capabilities,
		        avatar, created_at, updated_at
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
