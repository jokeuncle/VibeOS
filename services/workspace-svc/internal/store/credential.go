package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/vibeos/shared/models"
)

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

// UpsertGitLabCredentialByURL inserts or updates token for a given GitLab base URL
// for global (user_id IS NULL) credentials, using the partial unique index
// idx_gitlab_creds_global_url created by migration 007.
func (s *PostgresStore) UpsertGitLabCredentialByURL(ctx context.Context, cred *models.GitLabCredential) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO gitlab_credentials (id, gitlab_url, token_enc, token_hint, label, created_by)
		 VALUES ($1,$2,$3,$4,$5,$6)
		 ON CONFLICT (gitlab_url) WHERE user_id IS NULL DO UPDATE SET
		   token_enc = EXCLUDED.token_enc,
		   token_hint = EXCLUDED.token_hint,
		   label = COALESCE(NULLIF(EXCLUDED.label, ''), gitlab_credentials.label),
		   updated_at = NOW()`,
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
