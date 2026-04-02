package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/vibeos/shared/models"
)

const taskCols = `id, phase_id, workspace_id, requirement_id, title, description, status, priority, labels, due_date, assigned_agent, last_execution_id, execution_count, graph_node_id, graph_id, sort_order, created_at, updated_at`

func scanTask(s rowScanner) (*models.Task, error) {
	var t models.Task
	var status string
	var priority, assignedAgent *string
	err := s.Scan(&t.ID, &t.PhaseID, &t.WorkspaceID, &t.RequirementID, &t.Title, &t.Description,
		&status, &priority, &t.Labels, &t.DueDate, &assignedAgent,
		&t.LastExecutionID, &t.ExecutionCount,
		&t.GraphNodeID, &t.GraphID,
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
		INSERT INTO tasks (id, phase_id, workspace_id, requirement_id, title, description, status, priority, labels, due_date, assigned_agent, graph_node_id, graph_id, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
			COALESCE((SELECT MAX(sort_order) FROM tasks WHERE phase_id = $2), -1) + 1)
		RETURNING sort_order, created_at, updated_at`,
		task.ID, task.PhaseID, task.WorkspaceID, task.RequirementID, task.Title, task.Description,
		string(task.Status), priority, task.Labels, task.DueDate, assignedAgent,
		task.GraphNodeID, task.GraphID,
	).Scan(&task.SortOrder, &task.CreatedAt, &task.UpdatedAt)
}

func (s *PostgresStore) ListTasksByPhase(ctx context.Context, workspaceID, phaseID string, requirementID *string) ([]models.Task, error) {
	var query string
	var args []any
	if requirementID != nil {
		query = `SELECT ` + taskCols + ` FROM tasks WHERE workspace_id = $1 AND phase_id = $2 AND requirement_id = $3 ORDER BY sort_order`
		args = []any{workspaceID, phaseID, *requirementID}
	} else {
		query = `SELECT ` + taskCols + ` FROM tasks WHERE workspace_id = $1 AND phase_id = $2 AND requirement_id IS NULL ORDER BY sort_order`
		args = []any{workspaceID, phaseID}
	}
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list tasks by phase: %w", err)
	}
	defer rows.Close()
	var out []models.Task
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

func (s *PostgresStore) FindTaskByGraphNode(ctx context.Context, workspaceID, phaseID, graphNodeID string, requirementID *string) (*models.Task, error) {
	var query string
	var args []any
	if requirementID != nil {
		query = `SELECT ` + taskCols + ` FROM tasks WHERE workspace_id = $1 AND phase_id = $2 AND graph_node_id = $3 AND requirement_id = $4 LIMIT 1`
		args = []any{workspaceID, phaseID, graphNodeID, *requirementID}
	} else {
		query = `SELECT ` + taskCols + ` FROM tasks WHERE workspace_id = $1 AND phase_id = $2 AND graph_node_id = $3 LIMIT 1`
		args = []any{workspaceID, phaseID, graphNodeID}
	}
	t, err := scanTask(s.pool.QueryRow(ctx, query, args...))
	if err != nil {
		return nil, err
	}
	return t, nil
}

func (s *PostgresStore) ListTasksByGraphID(ctx context.Context, workspaceID, graphID string) ([]models.Task, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+taskCols+` FROM tasks WHERE workspace_id = $1 AND graph_id = $2 ORDER BY sort_order`,
		workspaceID, graphID)
	if err != nil {
		return nil, fmt.Errorf("list tasks by graph: %w", err)
	}
	defer rows.Close()
	var out []models.Task
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
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
