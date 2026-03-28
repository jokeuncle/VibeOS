package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/vibeos/shared/models"
)

// =========================================================================
// Chat message persistence
// =========================================================================

func (s *PostgresStore) GetOrCreateChatSession(ctx context.Context, workspaceID, agentType string) (*models.ChatSession, error) {
	var sess models.ChatSession
	err := s.pool.QueryRow(ctx,
		`INSERT INTO chat_sessions (workspace_id, agent_type)
		 VALUES ($1, $2)
		 ON CONFLICT (workspace_id, agent_type)
		 DO UPDATE SET updated_at = NOW()
		 RETURNING id, workspace_id, agent_type, created_at, updated_at`,
		workspaceID, agentType,
	).Scan(&sess.ID, &sess.WorkspaceID, &sess.AgentType, &sess.CreatedAt, &sess.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get or create chat session: %w", err)
	}
	return &sess, nil
}

func (s *PostgresStore) SaveChatMessage(ctx context.Context, msg *models.ChatMessage) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO chat_messages (id, session_id, workspace_id, role, content, rich_blocks, agent_type, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		msg.ID, msg.SessionID, msg.WorkspaceID, msg.Role, msg.Content,
		msg.RichBlocks, msg.AgentType, msg.CreatedAt,
	)
	return err
}

// ListChatMessages returns messages with cursor-based pagination (newest first).
// Cursor format: "RFC3339Nano|uuid". Pass empty cursor for the first page.
func (s *PostgresStore) ListChatMessages(ctx context.Context, workspaceID string, cursor string, limit int) ([]models.ChatMessage, string, bool, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	fetchN := limit + 1

	var rows pgx.Rows
	var err error
	if cursor == "" {
		rows, err = s.pool.Query(ctx,
			`SELECT id, session_id, workspace_id, role, content, rich_blocks, agent_type, created_at
			 FROM chat_messages
			 WHERE workspace_id = $1
			 ORDER BY created_at DESC, id DESC
			 LIMIT $2`,
			workspaceID, fetchN,
		)
	} else {
		parts := strings.SplitN(cursor, "|", 2)
		if len(parts) != 2 {
			return nil, "", false, fmt.Errorf("invalid cursor format")
		}
		cursorTime, parseErr := time.Parse(time.RFC3339Nano, parts[0])
		if parseErr != nil {
			return nil, "", false, fmt.Errorf("invalid cursor time: %w", parseErr)
		}
		cursorID := parts[1]
		rows, err = s.pool.Query(ctx,
			`SELECT id, session_id, workspace_id, role, content, rich_blocks, agent_type, created_at
			 FROM chat_messages
			 WHERE workspace_id = $1 AND (created_at, id) < ($2, $3)
			 ORDER BY created_at DESC, id DESC
			 LIMIT $4`,
			workspaceID, cursorTime, cursorID, fetchN,
		)
	}
	if err != nil {
		return nil, "", false, err
	}
	defer rows.Close()

	var msgs []models.ChatMessage
	for rows.Next() {
		var m models.ChatMessage
		var wsID *string
		if err := rows.Scan(&m.ID, &m.SessionID, &wsID, &m.Role, &m.Content,
			&m.RichBlocks, &m.AgentType, &m.CreatedAt); err != nil {
			return nil, "", false, err
		}
		if wsID != nil {
			m.WorkspaceID = *wsID
		}
		msgs = append(msgs, m)
	}

	hasMore := len(msgs) > limit
	if hasMore {
		msgs = msgs[:limit]
	}
	var nextCursor string
	if hasMore && len(msgs) > 0 {
		last := msgs[len(msgs)-1]
		nextCursor = last.CreatedAt.Format(time.RFC3339Nano) + "|" + last.ID
	}
	if msgs == nil {
		msgs = []models.ChatMessage{}
	}
	return msgs, nextCursor, hasMore, nil
}

// =========================================================================
// Artifact metadata-only listing
// =========================================================================

func (s *PostgresStore) ListArtifactMetaByWorkspace(ctx context.Context, workspaceID string) ([]models.ArtifactMeta, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, phase_id, task_id, agent_type, type, title,
		        COALESCE(content_size, octet_length(content)) AS content_size,
		        metadata, version, created_at, updated_at
		 FROM artifacts WHERE workspace_id = $1
		 ORDER BY created_at DESC`,
		workspaceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ArtifactMeta
	for rows.Next() {
		var a models.ArtifactMeta
		if err := rows.Scan(&a.ID, &a.WorkspaceID, &a.PhaseID, &a.TaskID,
			&a.AgentType, &a.Type, &a.Title, &a.ContentSize,
			&a.Metadata, &a.Version, &a.CreatedAt, &a.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	if out == nil {
		out = []models.ArtifactMeta{}
	}
	return out, nil
}

// =========================================================================
// Workspace lifecycle
// =========================================================================

func (s *PostgresStore) ArchiveWorkspace(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE workspaces SET status = 'archived', archived_at = NOW(), updated_at = NOW() WHERE id = $1`, id)
	return err
}

func (s *PostgresStore) UnarchiveWorkspace(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE workspaces SET status = 'active', archived_at = NULL, updated_at = NOW() WHERE id = $1`, id)
	return err
}

func (s *PostgresStore) ListWorkspacesByStatus(ctx context.Context, status string) ([]models.Workspace, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, name, description, progress, current_phase_id, color, status, created_at, updated_at
		 FROM workspaces WHERE status = $1 ORDER BY updated_at DESC`, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Workspace
	for rows.Next() {
		var w models.Workspace
		if err := rows.Scan(&w.ID, &w.Name, &w.Description, &w.Progress,
			&w.CurrentPhaseID, &w.Color, &w.Status, &w.CreatedAt, &w.UpdatedAt); err != nil {
			return nil, err
		}
		w.Phases = []models.Phase{}
		w.Agents = []models.Agent{}
		w.Activities = []models.Activity{}
		w.Repos = []models.WorkspaceRepo{}
		out = append(out, w)
	}
	if out == nil {
		out = []models.Workspace{}
	}
	return out, nil
}

// =========================================================================
// Conversation & activity summaries
// =========================================================================

func (s *PostgresStore) SaveConversationSummary(ctx context.Context, cs *models.ConversationSummary) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO conversation_summaries
		 (id, workspace_id, session_id, agent_type, summary, key_decisions, time_range_from, time_range_to, message_count)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		cs.ID, cs.WorkspaceID, cs.SessionID, cs.AgentType, cs.Summary,
		cs.KeyDecisions, cs.TimeRangeFrom, cs.TimeRangeTo, cs.MessageCount,
	)
	return err
}

func (s *PostgresStore) ListConversationSummaries(ctx context.Context, workspaceID string) ([]models.ConversationSummary, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, session_id, agent_type, summary, key_decisions,
		        time_range_from, time_range_to, message_count, created_at
		 FROM conversation_summaries WHERE workspace_id = $1
		 ORDER BY time_range_to DESC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ConversationSummary
	for rows.Next() {
		var c models.ConversationSummary
		if err := rows.Scan(&c.ID, &c.WorkspaceID, &c.SessionID, &c.AgentType,
			&c.Summary, &c.KeyDecisions, &c.TimeRangeFrom, &c.TimeRangeTo,
			&c.MessageCount, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	if out == nil {
		out = []models.ConversationSummary{}
	}
	return out, nil
}

func (s *PostgresStore) SaveActivitySummary(ctx context.Context, as *models.ActivitySummary) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO activity_summaries
		 (id, workspace_id, summary, key_events, time_range_from, time_range_to, activity_count)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		as.ID, as.WorkspaceID, as.Summary, as.KeyEvents,
		as.TimeRangeFrom, as.TimeRangeTo, as.ActivityCount,
	)
	return err
}

func (s *PostgresStore) ListActivitySummaries(ctx context.Context, workspaceID string) ([]models.ActivitySummary, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, summary, key_events, time_range_from, time_range_to,
		        activity_count, created_at
		 FROM activity_summaries WHERE workspace_id = $1
		 ORDER BY time_range_to DESC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ActivitySummary
	for rows.Next() {
		var a models.ActivitySummary
		if err := rows.Scan(&a.ID, &a.WorkspaceID, &a.Summary, &a.KeyEvents,
			&a.TimeRangeFrom, &a.TimeRangeTo, &a.ActivityCount, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	if out == nil {
		out = []models.ActivitySummary{}
	}
	return out, nil
}
