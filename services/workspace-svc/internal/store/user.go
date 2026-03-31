package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/vibeos/shared/models"
)

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
