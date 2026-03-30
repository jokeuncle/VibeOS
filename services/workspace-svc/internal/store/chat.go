package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
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
		`SELECT id, workspace_id, phase_id, task_id, requirement_id, agent_type, type, title,
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
		if err := rows.Scan(&a.ID, &a.WorkspaceID, &a.PhaseID, &a.TaskID, &a.RequirementID,
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

// =========================================================================
// Agent status updates
// =========================================================================

func (s *PostgresStore) UpdateAgent(ctx context.Context, id string, workspaceID string, req models.UpdateAgentReq) (*models.Agent, error) {
	var sets []string
	var args []any
	idx := 1

	if req.Status != nil {
		sets = append(sets, fmt.Sprintf("status = $%d", idx))
		args = append(args, *req.Status)
		idx++
	}
	if req.CurrentTask != nil {
		if *req.CurrentTask == "" {
			sets = append(sets, "current_task = NULL")
		} else {
			sets = append(sets, fmt.Sprintf("current_task = $%d", idx))
			args = append(args, *req.CurrentTask)
			idx++
		}
	}
	if req.PreferredModel != nil {
		sets = append(sets, fmt.Sprintf("preferred_model = $%d", idx))
		args = append(args, *req.PreferredModel)
		idx++
	}
	if len(sets) == 0 {
		return nil, fmt.Errorf("no fields to update")
	}

	sets = append(sets, "updated_at = NOW()")
	query := fmt.Sprintf(
		"UPDATE agents SET %s WHERE id = $%d AND workspace_id = $%d RETURNING id, workspace_id, type, name, status, current_task, preferred_model, avatar, created_at, updated_at",
		strings.Join(sets, ", "), idx, idx+1,
	)
	args = append(args, id, workspaceID)

	var a models.Agent
	var agentType, status string
	err := s.pool.QueryRow(ctx, query, args...).Scan(
		&a.ID, &a.WorkspaceID, &agentType, &a.Name, &status,
		&a.CurrentTask, &a.PreferredModel, &a.Avatar, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	a.Type = models.AgentType(agentType)
	a.Status = models.AgentStatus(status)
	return &a, nil
}

// =========================================================================
// Feedback signals & trust scores
// =========================================================================

func (s *PostgresStore) CreateFeedbackSignal(ctx context.Context, signal *models.FeedbackSignal) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO feedback_signals (id, workspace_id, agent_type, action_type, original_output, modified_output, context)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		signal.ID, signal.WorkspaceID, signal.AgentType, signal.ActionType,
		signal.OriginalOutput, signal.ModifiedOutput, signal.Context,
	)
	return err
}

func (s *PostgresStore) ListFeedbackSignals(ctx context.Context, workspaceID string, limit int) ([]models.FeedbackSignal, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, agent_type, action_type, original_output, modified_output, context, created_at
		 FROM feedback_signals WHERE workspace_id = $1
		 ORDER BY created_at DESC LIMIT $2`, workspaceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.FeedbackSignal
	for rows.Next() {
		var f models.FeedbackSignal
		if err := rows.Scan(&f.ID, &f.WorkspaceID, &f.AgentType, &f.ActionType,
			&f.OriginalOutput, &f.ModifiedOutput, &f.Context, &f.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	if out == nil {
		out = []models.FeedbackSignal{}
	}
	return out, nil
}

func (s *PostgresStore) UpsertTrustScore(ctx context.Context, agentType, actionType string) error {
	approvalDelta := 0
	rejectionDelta := 0
	if actionType == "approve" {
		approvalDelta = 1
	} else if actionType == "reject" {
		rejectionDelta = 1
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO trust_scores (model, agent_type, total_calls, approvals, rejections, score)
		 VALUES ('default', $1, 1, $2, $3,
		   CASE WHEN $2 = 1 THEN 1.0 ELSE 0.0 END)
		 ON CONFLICT (model, agent_type) DO UPDATE SET
		   total_calls = trust_scores.total_calls + 1,
		   approvals = trust_scores.approvals + $2,
		   rejections = trust_scores.rejections + $3,
		   score = CASE WHEN (trust_scores.total_calls + 1) > 0
		     THEN (trust_scores.approvals + $2)::float / (trust_scores.total_calls + 1)::float
		     ELSE 0.5 END,
		   updated_at = NOW()`,
		agentType, approvalDelta, rejectionDelta,
	)
	return err
}

func (s *PostgresStore) GetTrustScores(ctx context.Context, agentType string) ([]models.TrustScore, error) {
	var query string
	var args []any
	if agentType != "" {
		query = `SELECT id, model, agent_type, total_calls, approvals, rejections, score, updated_at
		         FROM trust_scores WHERE agent_type = $1 ORDER BY updated_at DESC`
		args = []any{agentType}
	} else {
		query = `SELECT id, model, agent_type, total_calls, approvals, rejections, score, updated_at
		         FROM trust_scores ORDER BY agent_type, updated_at DESC`
	}
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.TrustScore
	for rows.Next() {
		var t models.TrustScore
		if err := rows.Scan(&t.ID, &t.Model, &t.AgentType, &t.TotalCalls,
			&t.Approvals, &t.Rejections, &t.Score, &t.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	if out == nil {
		out = []models.TrustScore{}
	}
	return out, nil
}

// =========================================================================
// Budget settings
// =========================================================================

func (s *PostgresStore) GetBudgetSettings(ctx context.Context, workspaceID string) (*models.WorkspaceBudgetSettings, error) {
	var b models.WorkspaceBudgetSettings
	err := s.pool.QueryRow(ctx,
		`SELECT workspace_id, daily_spend_limit_usd, alert_threshold_pct, updated_at
		 FROM workspace_budget_settings WHERE workspace_id = $1`, workspaceID,
	).Scan(&b.WorkspaceID, &b.DailySpendLimitUSD, &b.AlertThresholdPct, &b.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Return defaults when no row yet
			return &models.WorkspaceBudgetSettings{
				WorkspaceID:        workspaceID,
				DailySpendLimitUSD: 10.0,
				AlertThresholdPct:  80,
				UpdatedAt:          time.Now().UTC(),
			}, nil
		}
		return nil, err
	}
	return &b, nil
}

func (s *PostgresStore) UpsertBudgetSettings(ctx context.Context, workspaceID string, req models.UpdateBudgetSettingsReq) (*models.WorkspaceBudgetSettings, error) {
	b, err := s.GetBudgetSettings(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	if req.DailySpendLimitUSD != nil {
		b.DailySpendLimitUSD = *req.DailySpendLimitUSD
	}
	if req.AlertThresholdPct != nil {
		b.AlertThresholdPct = *req.AlertThresholdPct
	}
	err = s.pool.QueryRow(ctx,
		`INSERT INTO workspace_budget_settings (workspace_id, daily_spend_limit_usd, alert_threshold_pct, updated_at)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (workspace_id) DO UPDATE
		   SET daily_spend_limit_usd = EXCLUDED.daily_spend_limit_usd,
		       alert_threshold_pct   = EXCLUDED.alert_threshold_pct,
		       updated_at            = NOW()
		 RETURNING workspace_id, daily_spend_limit_usd, alert_threshold_pct, updated_at`,
		workspaceID, b.DailySpendLimitUSD, b.AlertThresholdPct,
	).Scan(&b.WorkspaceID, &b.DailySpendLimitUSD, &b.AlertThresholdPct, &b.UpdatedAt)
	return b, err
}

// =========================================================================
// Pipeline phase configs
// =========================================================================

var defaultPipelinePhases = []struct {
	Key             string
	Enabled         bool
	RequireApproval bool
	QualityGate     *string
}{
	{Key: "requirement", Enabled: true, RequireApproval: false, QualityGate: nil},
	{Key: "architecture", Enabled: true, RequireApproval: true, QualityGate: strPtr("Schema + API spec required")},
	{Key: "design", Enabled: true, RequireApproval: false, QualityGate: nil},
	{Key: "development", Enabled: true, RequireApproval: false, QualityGate: strPtr("MR must be created")},
	{Key: "testing", Enabled: true, RequireApproval: false, QualityGate: strPtr("Coverage ≥ 80%")},
	{Key: "cicd", Enabled: true, RequireApproval: true, QualityGate: nil},
	{Key: "monitoring", Enabled: false, RequireApproval: false, QualityGate: nil},
}

func strPtr(s string) *string { return &s }

func (s *PostgresStore) GetPipelineConfigs(ctx context.Context, workspaceID string) ([]models.PipelinePhaseConfig, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT workspace_id, phase_key, enabled, require_approval, quality_gate, updated_at
		 FROM workspace_pipeline_configs WHERE workspace_id = $1 ORDER BY phase_key`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.PipelinePhaseConfig
	for rows.Next() {
		var c models.PipelinePhaseConfig
		if err := rows.Scan(&c.WorkspaceID, &c.PhaseKey, &c.Enabled, &c.RequireApproval, &c.QualityGate, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	// No rows yet → return defaults
	if len(out) == 0 {
		for _, d := range defaultPipelinePhases {
			out = append(out, models.PipelinePhaseConfig{
				WorkspaceID:     workspaceID,
				PhaseKey:        d.Key,
				Enabled:         d.Enabled,
				RequireApproval: d.RequireApproval,
				QualityGate:     d.QualityGate,
				UpdatedAt:       time.Now().UTC(),
			})
		}
	}
	return out, nil
}

func (s *PostgresStore) UpsertPipelineConfigs(ctx context.Context, workspaceID string, phases []models.PipelinePhaseConfigReq) ([]models.PipelinePhaseConfig, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	for _, p := range phases {
		_, err := tx.Exec(ctx,
			`INSERT INTO workspace_pipeline_configs (workspace_id, phase_key, enabled, require_approval, quality_gate, updated_at)
			 VALUES ($1, $2, $3, $4, $5, NOW())
			 ON CONFLICT (workspace_id, phase_key) DO UPDATE
			   SET enabled          = EXCLUDED.enabled,
			       require_approval = EXCLUDED.require_approval,
			       quality_gate     = EXCLUDED.quality_gate,
			       updated_at       = NOW()`,
			workspaceID, p.PhaseKey, p.Enabled, p.RequireApproval, p.QualityGate,
		)
		if err != nil {
			return nil, fmt.Errorf("upsert pipeline phase %s: %w", p.PhaseKey, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}
	return s.GetPipelineConfigs(ctx, workspaceID)
}

// =========================================================================
// Execution logs
// =========================================================================

func (s *PostgresStore) CreateExecutionLog(ctx context.Context, entry *models.ExecutionLog) error {
	if entry.ID == "" {
		entry.ID = uuid.NewString()
	}
	return s.pool.QueryRow(ctx,
		`INSERT INTO execution_logs (id, workspace_id, agent_type, level, message, task_id)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING created_at`,
		entry.ID, entry.WorkspaceID, entry.AgentType, entry.Level, entry.Message, entry.TaskID,
	).Scan(&entry.CreatedAt)
}

func (s *PostgresStore) ListExecutionLogs(ctx context.Context, workspaceID string, cursor string, limit int) ([]models.ExecutionLog, string, error) {
	var (
		query string
		args  []any
	)
	if cursor != "" {
		query = `SELECT id, workspace_id, agent_type, level, message, task_id, created_at
			 FROM execution_logs
			 WHERE workspace_id = $1 AND created_at < (SELECT created_at FROM execution_logs WHERE id = $2)
			 ORDER BY created_at DESC LIMIT $3`
		args = []any{workspaceID, cursor, limit}
	} else {
		query = `SELECT id, workspace_id, agent_type, level, message, task_id, created_at
			 FROM execution_logs WHERE workspace_id = $1
			 ORDER BY created_at DESC LIMIT $2`
		args = []any{workspaceID, limit}
	}
	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var out []models.ExecutionLog
	for rows.Next() {
		var e models.ExecutionLog
		if err := rows.Scan(&e.ID, &e.WorkspaceID, &e.AgentType, &e.Level, &e.Message, &e.TaskID, &e.CreatedAt); err != nil {
			return nil, "", err
		}
		out = append(out, e)
	}
	if out == nil {
		out = []models.ExecutionLog{}
	}
	var nextCursor string
	if len(out) == limit {
		nextCursor = out[len(out)-1].ID
	}
	return out, nextCursor, nil
}

func (s *PostgresStore) ListExecutionLogsSince(ctx context.Context, workspaceID string, since time.Time, limit int) ([]models.ExecutionLog, string, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, workspace_id, agent_type, level, message, task_id, created_at
		 FROM execution_logs
		 WHERE workspace_id = $1 AND created_at >= $2
		 ORDER BY created_at DESC LIMIT $3`,
		workspaceID, since, limit)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var out []models.ExecutionLog
	for rows.Next() {
		var e models.ExecutionLog
		if err := rows.Scan(&e.ID, &e.WorkspaceID, &e.AgentType, &e.Level, &e.Message, &e.TaskID, &e.CreatedAt); err != nil {
			return nil, "", err
		}
		out = append(out, e)
	}
	if out == nil {
		out = []models.ExecutionLog{}
	}
	return out, "", nil
}
