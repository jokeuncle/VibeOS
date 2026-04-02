package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/vibeos/shared/models"
)

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

func (s *PostgresStore) ListArtifactsByWorkspace(ctx context.Context, workspaceID, agentType, artifactType string) ([]models.Artifact, error) {
	query := `SELECT ` + artifactCols + ` FROM artifacts WHERE workspace_id = $1`
	args := []any{workspaceID}
	idx := 2
	if agentType != "" {
		query += fmt.Sprintf(` AND agent_type = $%d`, idx)
		args = append(args, agentType)
		idx++
	}
	if artifactType != "" {
		query += fmt.Sprintf(` AND type = $%d`, idx)
		args = append(args, artifactType)
		idx++
	}
	query += ` ORDER BY created_at DESC`

	rows, err := s.pool.Query(ctx, query, args...)
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
