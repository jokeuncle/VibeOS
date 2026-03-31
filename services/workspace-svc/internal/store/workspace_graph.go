package store

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/vibeos/shared/models"
)

// ---------------------------------------------------------------------------
// Workspace Graph CRUD
// ---------------------------------------------------------------------------

func (s *PostgresStore) ListWorkspaceGraphs(ctx context.Context, workspaceID string) ([]models.WorkspaceGraph, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, name, description, source_template_id,
		        graph_def, state_schema, config, is_active, created_at, updated_at
		 FROM workspace_graphs
		 WHERE workspace_id = $1
		 ORDER BY is_active DESC, updated_at DESC`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list workspace graphs: %w", err)
	}
	defer rows.Close()

	var out []models.WorkspaceGraph
	for rows.Next() {
		g, err := scanWorkspaceGraph(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *g)
	}
	return out, rows.Err()
}

func (s *PostgresStore) GetWorkspaceGraph(ctx context.Context, id string) (*models.WorkspaceGraph, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, name, description, source_template_id,
		        graph_def, state_schema, config, is_active, created_at, updated_at
		 FROM workspace_graphs WHERE id = $1`, id)
	return scanWorkspaceGraph(row)
}

func (s *PostgresStore) GetActiveWorkspaceGraph(ctx context.Context, workspaceID string) (*models.WorkspaceGraph, error) {
	row := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, name, description, source_template_id,
		        graph_def, state_schema, config, is_active, created_at, updated_at
		 FROM workspace_graphs
		 WHERE workspace_id = $1 AND is_active = true
		 LIMIT 1`, workspaceID)
	g, err := scanWorkspaceGraph(row)
	if err != nil {
		return nil, err
	}
	return g, nil
}

func (s *PostgresStore) CreateWorkspaceGraph(ctx context.Context, workspaceID string, req models.CreateWorkspaceGraphReq) (*models.WorkspaceGraph, error) {
	now := models.TimeNow()
	graphDef := req.GraphDef
	if graphDef == nil {
		graphDef = []byte("{}")
	}
	stateSchema := req.StateSchema
	if stateSchema == nil {
		stateSchema = []byte("{}")
	}
	cfg := req.Config
	if cfg == nil {
		cfg = []byte(`{"checkpointer":"memory","recursion_limit":25}`)
	}
	isActive := false
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	var srcTplID *string
	if req.SourceTemplateID != "" {
		srcTplID = &req.SourceTemplateID
	}

	if isActive {
		_, _ = s.pool.Exec(ctx,
			`UPDATE workspace_graphs SET is_active = false, updated_at = $1 WHERE workspace_id = $2 AND is_active = true`,
			now, workspaceID)
	}

	row := s.pool.QueryRow(ctx,
		`INSERT INTO workspace_graphs
		   (workspace_id, name, description, source_template_id, graph_def, state_schema, config, is_active, created_at, updated_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
		 RETURNING id, workspace_id, name, description, source_template_id,
		           graph_def, state_schema, config, is_active, created_at, updated_at`,
		workspaceID, req.Name, req.Description, srcTplID, graphDef, stateSchema, cfg, isActive, now)
	return scanWorkspaceGraph(row)
}

func (s *PostgresStore) UpdateWorkspaceGraph(ctx context.Context, id string, req models.UpdateWorkspaceGraphReq) (*models.WorkspaceGraph, error) {
	now := models.TimeNow()
	sets := []string{"updated_at = $1"}
	args := []any{now}
	idx := 2

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
	if req.GraphDef != nil {
		sets = append(sets, fmt.Sprintf("graph_def = $%d", idx))
		args = append(args, *req.GraphDef)
		idx++
	}
	if req.StateSchema != nil {
		sets = append(sets, fmt.Sprintf("state_schema = $%d", idx))
		args = append(args, *req.StateSchema)
		idx++
	}
	if req.Config != nil {
		sets = append(sets, fmt.Sprintf("config = $%d", idx))
		args = append(args, *req.Config)
		idx++
	}
	if req.IsActive != nil {
		if *req.IsActive {
			current, err := s.GetWorkspaceGraph(ctx, id)
			if err == nil && current != nil {
				_, _ = s.pool.Exec(ctx,
					`UPDATE workspace_graphs SET is_active = false, updated_at = $1 WHERE workspace_id = $2 AND is_active = true AND id != $3`,
					now, current.WorkspaceID, id)
			}
		}
		sets = append(sets, fmt.Sprintf("is_active = $%d", idx))
		args = append(args, *req.IsActive)
		idx++
	}

	args = append(args, id)
	q := fmt.Sprintf(
		`UPDATE workspace_graphs SET %s WHERE id = $%d
		 RETURNING id, workspace_id, name, description, source_template_id,
		           graph_def, state_schema, config, is_active, created_at, updated_at`,
		strings.Join(sets, ", "), idx)
	return scanWorkspaceGraph(s.pool.QueryRow(ctx, q, args...))
}

func (s *PostgresStore) DeleteWorkspaceGraph(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM workspace_graphs WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete workspace graph: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) ActivateWorkspaceGraph(ctx context.Context, workspaceID, graphID string) error {
	now := models.TimeNow()
	_, _ = s.pool.Exec(ctx,
		`UPDATE workspace_graphs SET is_active = false, updated_at = $1 WHERE workspace_id = $2 AND is_active = true`,
		now, workspaceID)
	tag, err := s.pool.Exec(ctx,
		`UPDATE workspace_graphs SET is_active = true, updated_at = $1 WHERE id = $2 AND workspace_id = $3`,
		now, graphID, workspaceID)
	if err != nil {
		return fmt.Errorf("activate workspace graph: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Scanner + helper
// ---------------------------------------------------------------------------

func scanWorkspaceGraph(s rowScanner) (*models.WorkspaceGraph, error) {
	var g models.WorkspaceGraph
	err := s.Scan(&g.ID, &g.WorkspaceID, &g.Name, &g.Description, &g.SourceTemplateID,
		&g.GraphDef, &g.StateSchema, &g.Config, &g.IsActive, &g.CreatedAt, &g.UpdatedAt)
	if err == pgx.ErrNoRows {
		return nil, ErrNotFound
	}
	return &g, err
}

