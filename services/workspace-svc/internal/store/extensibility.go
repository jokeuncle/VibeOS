package store

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/lib/pq"
	"github.com/vibeos/shared/models"
)

// ---------------------------------------------------------------------------
// MCP Servers
// ---------------------------------------------------------------------------

func (s *PostgresStore) ListMCPServers(ctx context.Context, workspaceID *string) ([]models.MCPServer, error) {
	var rows pgx.Rows
	var err error
	if workspaceID != nil {
		rows, err = s.pool.Query(ctx,
			`SELECT id, workspace_id, name, transport, config, enabled, created_at, updated_at
			 FROM mcp_servers WHERE workspace_id = $1 OR workspace_id IS NULL ORDER BY created_at`, *workspaceID)
	} else {
		rows, err = s.pool.Query(ctx,
			`SELECT id, workspace_id, name, transport, config, enabled, created_at, updated_at
			 FROM mcp_servers WHERE workspace_id IS NULL ORDER BY created_at`)
	}
	if err != nil {
		return nil, fmt.Errorf("list mcp_servers: %w", err)
	}
	defer rows.Close()
	var result []models.MCPServer
	for rows.Next() {
		var m models.MCPServer
		if err := rows.Scan(&m.ID, &m.WorkspaceID, &m.Name, &m.Transport, &m.Config, &m.Enabled, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan mcp_server: %w", err)
		}
		result = append(result, m)
	}
	return result, nil
}

func (s *PostgresStore) CreateMCPServer(ctx context.Context, req models.CreateMCPServerReq) (*models.MCPServer, error) {
	cfg := req.Config
	if cfg == nil {
		cfg = json.RawMessage(`{}`)
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	var m models.MCPServer
	err := s.pool.QueryRow(ctx,
		`INSERT INTO mcp_servers (workspace_id, name, transport, config, enabled)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, workspace_id, name, transport, config, enabled, created_at, updated_at`,
		req.WorkspaceID, req.Name, req.Transport, cfg, enabled,
	).Scan(&m.ID, &m.WorkspaceID, &m.Name, &m.Transport, &m.Config, &m.Enabled, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create mcp_server: %w", err)
	}
	return &m, nil
}

func (s *PostgresStore) GetMCPServer(ctx context.Context, id string) (*models.MCPServer, error) {
	var m models.MCPServer
	err := s.pool.QueryRow(ctx,
		`SELECT id, workspace_id, name, transport, config, enabled, created_at, updated_at
		 FROM mcp_servers WHERE id = $1`, id,
	).Scan(&m.ID, &m.WorkspaceID, &m.Name, &m.Transport, &m.Config, &m.Enabled, &m.CreatedAt, &m.UpdatedAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get mcp_server: %w", err)
	}
	return &m, nil
}

func (s *PostgresStore) UpdateMCPServer(ctx context.Context, id string, req models.UpdateMCPServerReq) (*models.MCPServer, error) {
	m, err := s.GetMCPServer(ctx, id)
	if err != nil {
		return nil, err
	}
	if req.Name != nil {
		m.Name = *req.Name
	}
	if req.Transport != nil {
		m.Transport = *req.Transport
	}
	if req.Config != nil {
		m.Config = *req.Config
	}
	if req.Enabled != nil {
		m.Enabled = *req.Enabled
	}
	_, err = s.pool.Exec(ctx,
		`UPDATE mcp_servers SET name=$2, transport=$3, config=$4, enabled=$5, updated_at=NOW() WHERE id=$1`,
		id, m.Name, m.Transport, m.Config, m.Enabled)
	if err != nil {
		return nil, fmt.Errorf("update mcp_server: %w", err)
	}
	return s.GetMCPServer(ctx, id)
}

func (s *PostgresStore) DeleteMCPServer(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM mcp_servers WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete mcp_server: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Tool Configs
// ---------------------------------------------------------------------------

func (s *PostgresStore) ListToolConfigs(ctx context.Context, workspaceID *string) ([]models.ToolConfig, error) {
	var rows pgx.Rows
	var err error
	if workspaceID != nil {
		rows, err = s.pool.Query(ctx,
			`SELECT id, workspace_id, name, description, parameters, implementation, enabled, created_at, updated_at
			 FROM tool_configs WHERE workspace_id = $1 OR workspace_id IS NULL ORDER BY created_at`, *workspaceID)
	} else {
		rows, err = s.pool.Query(ctx,
			`SELECT id, workspace_id, name, description, parameters, implementation, enabled, created_at, updated_at
			 FROM tool_configs WHERE workspace_id IS NULL ORDER BY created_at`)
	}
	if err != nil {
		return nil, fmt.Errorf("list tool_configs: %w", err)
	}
	defer rows.Close()
	var result []models.ToolConfig
	for rows.Next() {
		var t models.ToolConfig
		if err := rows.Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.Description, &t.Parameters, &t.Implementation, &t.Enabled, &t.CreatedAt, &t.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan tool_config: %w", err)
		}
		result = append(result, t)
	}
	return result, nil
}

func (s *PostgresStore) CreateToolConfig(ctx context.Context, req models.CreateToolConfigReq) (*models.ToolConfig, error) {
	params := req.Parameters
	if params == nil {
		params = json.RawMessage(`{}`)
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	var t models.ToolConfig
	err := s.pool.QueryRow(ctx,
		`INSERT INTO tool_configs (workspace_id, name, description, parameters, implementation, enabled)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, workspace_id, name, description, parameters, implementation, enabled, created_at, updated_at`,
		req.WorkspaceID, req.Name, req.Description, params, req.Implementation, enabled,
	).Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.Description, &t.Parameters, &t.Implementation, &t.Enabled, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create tool_config: %w", err)
	}
	return &t, nil
}

func (s *PostgresStore) DeleteToolConfig(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM tool_configs WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete tool_config: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

func (s *PostgresStore) ListSkills(ctx context.Context, workspaceID *string) ([]models.Skill, error) {
	var rows pgx.Rows
	var err error
	if workspaceID != nil {
		rows, err = s.pool.Query(ctx,
			`SELECT id, workspace_id, name, description, config, version, enabled, created_at, updated_at
			 FROM skills WHERE workspace_id = $1 OR workspace_id IS NULL ORDER BY created_at`, *workspaceID)
	} else {
		rows, err = s.pool.Query(ctx,
			`SELECT id, workspace_id, name, description, config, version, enabled, created_at, updated_at
			 FROM skills WHERE workspace_id IS NULL ORDER BY created_at`)
	}
	if err != nil {
		return nil, fmt.Errorf("list skills: %w", err)
	}
	defer rows.Close()
	var result []models.Skill
	for rows.Next() {
		var sk models.Skill
		if err := rows.Scan(&sk.ID, &sk.WorkspaceID, &sk.Name, &sk.Description, &sk.Config, &sk.Version, &sk.Enabled, &sk.CreatedAt, &sk.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan skill: %w", err)
		}
		result = append(result, sk)
	}
	return result, nil
}

func (s *PostgresStore) CreateSkill(ctx context.Context, req models.CreateSkillReq) (*models.Skill, error) {
	version := "1.0"
	if req.Version != "" {
		version = req.Version
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	var sk models.Skill
	err := s.pool.QueryRow(ctx,
		`INSERT INTO skills (workspace_id, name, description, config, version, enabled)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, workspace_id, name, description, config, version, enabled, created_at, updated_at`,
		req.WorkspaceID, req.Name, req.Description, req.Config, version, enabled,
	).Scan(&sk.ID, &sk.WorkspaceID, &sk.Name, &sk.Description, &sk.Config, &sk.Version, &sk.Enabled, &sk.CreatedAt, &sk.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("create skill: %w", err)
	}
	return &sk, nil
}

func (s *PostgresStore) DeleteSkill(ctx context.Context, id string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM skills WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("delete skill: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// User Contexts
// ---------------------------------------------------------------------------

func (s *PostgresStore) GetUserContext(ctx context.Context, userID string, workspaceID *string) (*models.UserContext, error) {
	var uc models.UserContext
	var err error
	if workspaceID != nil {
		err = s.pool.QueryRow(ctx,
			`SELECT id, user_id, workspace_id, custom_instructions, preferences, active_skills, created_at, updated_at
			 FROM user_contexts WHERE user_id = $1 AND workspace_id = $2`, userID, *workspaceID,
		).Scan(&uc.ID, &uc.UserID, &uc.WorkspaceID, &uc.CustomInstructions, &uc.Preferences, pq.Array(&uc.ActiveSkills), &uc.CreatedAt, &uc.UpdatedAt)
	} else {
		err = s.pool.QueryRow(ctx,
			`SELECT id, user_id, workspace_id, custom_instructions, preferences, active_skills, created_at, updated_at
			 FROM user_contexts WHERE user_id = $1 AND workspace_id IS NULL`, userID,
		).Scan(&uc.ID, &uc.UserID, &uc.WorkspaceID, &uc.CustomInstructions, &uc.Preferences, pq.Array(&uc.ActiveSkills), &uc.CreatedAt, &uc.UpdatedAt)
	}
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("get user_context: %w", err)
	}
	return &uc, nil
}

func (s *PostgresStore) UpsertUserContext(ctx context.Context, req models.UpsertUserContextReq) (*models.UserContext, error) {
	ci := ""
	if req.CustomInstructions != nil {
		ci = *req.CustomInstructions
	}
	prefs := json.RawMessage(`{}`)
	if req.Preferences != nil {
		prefs = *req.Preferences
	}
	var skills []string
	if req.ActiveSkills != nil {
		skills = *req.ActiveSkills
	}

	var uc models.UserContext
	err := s.pool.QueryRow(ctx,
		`INSERT INTO user_contexts (user_id, workspace_id, custom_instructions, preferences, active_skills)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id, workspace_id) DO UPDATE SET
		   custom_instructions = EXCLUDED.custom_instructions,
		   preferences = EXCLUDED.preferences,
		   active_skills = EXCLUDED.active_skills,
		   updated_at = NOW()
		 RETURNING id, user_id, workspace_id, custom_instructions, preferences, active_skills, created_at, updated_at`,
		req.UserID, req.WorkspaceID, ci, prefs, pq.Array(skills),
	).Scan(&uc.ID, &uc.UserID, &uc.WorkspaceID, &uc.CustomInstructions, &uc.Preferences, pq.Array(&uc.ActiveSkills), &uc.CreatedAt, &uc.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("upsert user_context: %w", err)
	}
	return &uc, nil
}
