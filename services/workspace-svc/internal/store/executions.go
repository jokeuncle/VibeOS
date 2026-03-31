package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/vibeos/shared/models"
)

func (s *PostgresStore) CreateAgentExecution(ctx context.Context, exec *models.AgentExecution) error {
	if exec.ID == "" {
		exec.ID = uuid.NewString()
	}
	if exec.Steps == nil {
		exec.Steps = json.RawMessage("[]")
	}
	if exec.TaskIDs == nil {
		exec.TaskIDs = []string{}
	}
	if exec.Status == "" {
		exec.Status = models.ExecQueued
	}
	if exec.StartedAt.IsZero() {
		exec.StartedAt = time.Now().UTC()
	}

	return s.pool.QueryRow(ctx,
		`INSERT INTO agent_executions
		 (id, workspace_id, requirement_id, task_ids, intent_type, intent_summary,
		  triggered_by, user_message, chat_message_id, status, agent_type, steps, result_type,
		  result_payload, error_message, parent_execution_id, started_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
		 RETURNING started_at`,
		exec.ID, exec.WorkspaceID, exec.RequirementID, exec.TaskIDs,
		exec.IntentType, exec.IntentSummary, exec.TriggeredBy, exec.UserMessage,
		exec.ChatMessageID,
		string(exec.Status), exec.AgentType, exec.Steps, exec.ResultType,
		exec.ResultPayload, exec.ErrorMessage,
		exec.ParentExecutionID, exec.StartedAt,
	).Scan(&exec.StartedAt)
}

func (s *PostgresStore) GetAgentExecution(ctx context.Context, id string) (*models.AgentExecution, error) {
	var e models.AgentExecution
	var status string
	err := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, requirement_id, task_ids, intent_type, intent_summary,
		        triggered_by, user_message, chat_message_id, status, agent_type, steps, result_type,
		        result_payload, error_message, parent_execution_id,
		        started_at, completed_at
		 FROM agent_executions WHERE id = $1`, id,
	).Scan(
		&e.ID, &e.WorkspaceID, &e.RequirementID, &e.TaskIDs,
		&e.IntentType, &e.IntentSummary, &e.TriggeredBy, &e.UserMessage,
		&e.ChatMessageID,
		&status, &e.AgentType, &e.Steps, &e.ResultType,
		&e.ResultPayload, &e.ErrorMessage,
		&e.ParentExecutionID, &e.StartedAt, &e.CompletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	e.Status = models.ExecutionStatus(status)
	if e.TaskIDs == nil {
		e.TaskIDs = []string{}
	}
	return &e, nil
}

func (s *PostgresStore) UpdateAgentExecution(ctx context.Context, id string, req models.UpdateAgentExecutionReq) (*models.AgentExecution, error) {
	var sets []string
	var args []any
	idx := 1

	if req.Status != nil {
		sets = append(sets, fmt.Sprintf("status = $%d", idx))
		args = append(args, *req.Status)
		idx++
		if *req.Status == string(models.ExecSuccess) || *req.Status == string(models.ExecFailed) || *req.Status == string(models.ExecCancelled) {
			sets = append(sets, fmt.Sprintf("completed_at = $%d", idx))
			args = append(args, time.Now().UTC())
			idx++
		}
	}
	if req.Steps != nil {
		sets = append(sets, fmt.Sprintf("steps = $%d", idx))
		args = append(args, *req.Steps)
		idx++
	}
	if req.ResultPayload != nil {
		sets = append(sets, fmt.Sprintf("result_payload = $%d", idx))
		args = append(args, *req.ResultPayload)
		idx++
	}
	if req.ErrorMessage != nil {
		sets = append(sets, fmt.Sprintf("error_message = $%d", idx))
		args = append(args, *req.ErrorMessage)
		idx++
	}
	if req.TaskIDs != nil {
		sets = append(sets, fmt.Sprintf("task_ids = $%d", idx))
		args = append(args, req.TaskIDs)
		idx++
	}
	if req.ChatMessageID != nil {
		sets = append(sets, fmt.Sprintf("chat_message_id = $%d", idx))
		args = append(args, *req.ChatMessageID)
		idx++
	}
	if len(sets) == 0 {
		return s.GetAgentExecution(ctx, id)
	}

	query := fmt.Sprintf(
		`UPDATE agent_executions SET %s WHERE id = $%d
		 RETURNING id, workspace_id, requirement_id, task_ids, intent_type, intent_summary,
		           triggered_by, user_message, chat_message_id, status, agent_type, steps, result_type,
		           result_payload, error_message, parent_execution_id,
		           started_at, completed_at`,
		strings.Join(sets, ", "), idx,
	)
	args = append(args, id)

	var e models.AgentExecution
	var status string
	err := s.pool.QueryRow(ctx, query, args...).Scan(
		&e.ID, &e.WorkspaceID, &e.RequirementID, &e.TaskIDs,
		&e.IntentType, &e.IntentSummary, &e.TriggeredBy, &e.UserMessage,
		&e.ChatMessageID,
		&status, &e.AgentType, &e.Steps, &e.ResultType,
		&e.ResultPayload, &e.ErrorMessage,
		&e.ParentExecutionID, &e.StartedAt, &e.CompletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	e.Status = models.ExecutionStatus(status)
	if e.TaskIDs == nil {
		e.TaskIDs = []string{}
	}
	return &e, nil
}

func (s *PostgresStore) ListAgentExecutions(ctx context.Context, workspaceID string, requirementID *string, cursor string, limit int) ([]models.AgentExecution, string, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	fetchN := limit + 1

	var (
		rows pgx.Rows
		err  error
	)

	baseCols := `id, workspace_id, requirement_id, task_ids, intent_type, intent_summary,
	             triggered_by, user_message, chat_message_id, status, agent_type, steps, result_type,
	             result_payload, error_message, parent_execution_id,
	             started_at, completed_at`

	if requirementID != nil {
		if cursor != "" {
			parts := strings.SplitN(cursor, "|", 2)
			if len(parts) != 2 {
				return nil, "", fmt.Errorf("invalid cursor")
			}
			cursorTime, perr := time.Parse(time.RFC3339Nano, parts[0])
			if perr != nil {
				return nil, "", fmt.Errorf("invalid cursor time: %w", perr)
			}
			rows, err = s.pool.Query(ctx,
				fmt.Sprintf(`SELECT %s FROM agent_executions
				 WHERE workspace_id = $1 AND requirement_id = $2
				   AND (started_at, id) < ($3, $4)
				 ORDER BY started_at DESC, id DESC LIMIT $5`, baseCols),
				workspaceID, *requirementID, cursorTime, parts[1], fetchN,
			)
		} else {
			rows, err = s.pool.Query(ctx,
				fmt.Sprintf(`SELECT %s FROM agent_executions
				 WHERE workspace_id = $1 AND requirement_id = $2
				 ORDER BY started_at DESC, id DESC LIMIT $3`, baseCols),
				workspaceID, *requirementID, fetchN,
			)
		}
	} else {
		if cursor != "" {
			parts := strings.SplitN(cursor, "|", 2)
			if len(parts) != 2 {
				return nil, "", fmt.Errorf("invalid cursor")
			}
			cursorTime, perr := time.Parse(time.RFC3339Nano, parts[0])
			if perr != nil {
				return nil, "", fmt.Errorf("invalid cursor time: %w", perr)
			}
			rows, err = s.pool.Query(ctx,
				fmt.Sprintf(`SELECT %s FROM agent_executions
				 WHERE workspace_id = $1 AND (started_at, id) < ($2, $3)
				 ORDER BY started_at DESC, id DESC LIMIT $4`, baseCols),
				workspaceID, cursorTime, parts[1], fetchN,
			)
		} else {
			rows, err = s.pool.Query(ctx,
				fmt.Sprintf(`SELECT %s FROM agent_executions
				 WHERE workspace_id = $1
				 ORDER BY started_at DESC, id DESC LIMIT $2`, baseCols),
				workspaceID, fetchN,
			)
		}
	}
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var out []models.AgentExecution
	for rows.Next() {
		var e models.AgentExecution
		var status string
		if err := rows.Scan(
			&e.ID, &e.WorkspaceID, &e.RequirementID, &e.TaskIDs,
			&e.IntentType, &e.IntentSummary, &e.TriggeredBy, &e.UserMessage,
			&e.ChatMessageID,
			&status, &e.AgentType, &e.Steps, &e.ResultType,
			&e.ResultPayload, &e.ErrorMessage,
			&e.ParentExecutionID, &e.StartedAt, &e.CompletedAt,
		); err != nil {
			return nil, "", err
		}
		e.Status = models.ExecutionStatus(status)
		if e.TaskIDs == nil {
			e.TaskIDs = []string{}
		}
		out = append(out, e)
	}

	hasMore := len(out) > limit
	if hasMore {
		out = out[:limit]
	}
	var nextCursor string
	if hasMore && len(out) > 0 {
		last := out[len(out)-1]
		nextCursor = last.StartedAt.Format(time.RFC3339Nano) + "|" + last.ID
	}
	if out == nil {
		out = []models.AgentExecution{}
	}
	return out, nextCursor, nil
}

func (s *PostgresStore) LinkExecutionToTasks(ctx context.Context, executionID string, taskIDs []string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	_, err = tx.Exec(ctx,
		`UPDATE agent_executions SET task_ids = $1 WHERE id = $2`,
		taskIDs, executionID,
	)
	if err != nil {
		return fmt.Errorf("update execution task_ids: %w", err)
	}

	for _, tid := range taskIDs {
		_, err = tx.Exec(ctx,
			`UPDATE tasks SET last_execution_id = $1, execution_count = execution_count + 1, updated_at = NOW()
			 WHERE id = $2`,
			executionID, tid,
		)
		if err != nil {
			return fmt.Errorf("update task %s execution ref: %w", tid, err)
		}
	}

	return tx.Commit(ctx)
}
