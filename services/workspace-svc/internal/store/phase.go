package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/vibeos/shared/models"
)

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
