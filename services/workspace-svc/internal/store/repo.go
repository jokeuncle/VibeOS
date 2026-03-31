package store

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/vibeos/shared/models"
)

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
