package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/vibeos/shared/models"
)

const requirementCols = `id, workspace_id, title, description, status, current_phase, priority, iteration, progress, sort_order, created_at, updated_at`

func scanRequirement(sc rowScanner) (*models.Requirement, error) {
	var r models.Requirement
	var status string
	var priority *string
	err := sc.Scan(&r.ID, &r.WorkspaceID, &r.Title, &r.Description,
		&status, &r.CurrentPhase, &priority, &r.Iteration, &r.Progress,
		&r.SortOrder, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return nil, err
	}
	r.Status = models.RequirementStatus(status)
	if priority != nil {
		p := models.TaskPriority(*priority)
		r.Priority = &p
	}
	r.Tasks = []models.Task{}
	r.Artifacts = []models.Artifact{}
	r.Relations = []models.RequirementRelation{}
	return &r, nil
}

func (s *PostgresStore) CreateRequirement(ctx context.Context, req *models.Requirement) error {
	var priority *string
	if req.Priority != nil {
		v := string(*req.Priority)
		priority = &v
	}
	return s.pool.QueryRow(ctx, `
		INSERT INTO requirements (id, workspace_id, title, description, status, current_phase, priority, iteration, sort_order)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
			COALESCE((SELECT MAX(sort_order) FROM requirements WHERE workspace_id = $2), -1) + 1)
		RETURNING sort_order, created_at, updated_at`,
		req.ID, req.WorkspaceID, req.Title, req.Description,
		string(req.Status), req.CurrentPhase, priority, req.Iteration,
	).Scan(&req.SortOrder, &req.CreatedAt, &req.UpdatedAt)
}

func (s *PostgresStore) GetRequirement(ctx context.Context, id, wsID string) (*models.Requirement, error) {
	r, err := scanRequirement(s.pool.QueryRow(ctx,
		`SELECT `+requirementCols+` FROM requirements WHERE id = $1 AND workspace_id = $2`, id, wsID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("query requirement: %w", err)
	}

	taskRows, err := s.pool.Query(ctx,
		`SELECT `+taskCols+` FROM tasks WHERE requirement_id = $1 ORDER BY sort_order`, id)
	if err != nil {
		return nil, fmt.Errorf("query requirement tasks: %w", err)
	}
	defer taskRows.Close()
	for taskRows.Next() {
		t, err := scanTask(taskRows)
		if err != nil {
			return nil, fmt.Errorf("scan requirement task: %w", err)
		}
		r.Tasks = append(r.Tasks, *t)
	}

	relRows, err := s.pool.Query(ctx, `
		SELECT rr.id, rr.workspace_id, rr.source_id, rr.target_id, rr.relation_type,
		       rr.description, r2.title AS target_title, rr.created_at
		FROM requirement_relations rr
		JOIN requirements r2 ON (CASE WHEN rr.source_id = $1 THEN rr.target_id ELSE rr.source_id END) = r2.id
		WHERE rr.source_id = $1 OR rr.target_id = $1`, id)
	if err != nil {
		return nil, fmt.Errorf("query requirement relations: %w", err)
	}
	defer relRows.Close()
	for relRows.Next() {
		var rel models.RequirementRelation
		var relType string
		if err := relRows.Scan(&rel.ID, &rel.WorkspaceID, &rel.SourceID, &rel.TargetID,
			&relType, &rel.Description, &rel.TargetTitle, &rel.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan requirement relation: %w", err)
		}
		rel.RelationType = models.RelationType(relType)
		r.Relations = append(r.Relations, rel)
	}

	r.TaskCount = len(r.Tasks)
	for _, t := range r.Tasks {
		if t.Status == models.StatusCompleted {
			r.DoneCount++
		}
	}

	return r, nil
}

func (s *PostgresStore) ListRequirements(ctx context.Context, wsID string) ([]models.Requirement, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT r.id, r.workspace_id, r.title, r.description, r.status, r.current_phase,
		       r.priority, r.iteration, r.progress, r.sort_order, r.created_at, r.updated_at,
		       (SELECT COUNT(*) FROM tasks WHERE requirement_id = r.id) AS task_count,
		       (SELECT COUNT(*) FROM tasks WHERE requirement_id = r.id AND status = 'completed') AS done_count
		FROM requirements r WHERE r.workspace_id = $1 ORDER BY r.sort_order`, wsID)
	if err != nil {
		return nil, fmt.Errorf("query requirements: %w", err)
	}
	defer rows.Close()

	var reqs []models.Requirement
	for rows.Next() {
		var r models.Requirement
		var status string
		var priority *string
		if err := rows.Scan(&r.ID, &r.WorkspaceID, &r.Title, &r.Description,
			&status, &r.CurrentPhase, &priority, &r.Iteration, &r.Progress,
			&r.SortOrder, &r.CreatedAt, &r.UpdatedAt, &r.TaskCount, &r.DoneCount); err != nil {
			return nil, fmt.Errorf("scan requirement: %w", err)
		}
		r.Status = models.RequirementStatus(status)
		if priority != nil {
			p := models.TaskPriority(*priority)
			r.Priority = &p
		}
		reqs = append(reqs, r)
	}
	if reqs == nil {
		reqs = []models.Requirement{}
	}
	if len(reqs) == 0 {
		return reqs, nil
	}

	byID := make(map[string]*models.Requirement, len(reqs))
	for i := range reqs {
		byID[reqs[i].ID] = &reqs[i]
	}

	relRows, err := s.pool.Query(ctx, `
		SELECT rr.id, rr.workspace_id, rr.source_id, rr.target_id, rr.relation_type,
		       rr.description, rr.created_at,
		       st.title, tt.title
		FROM requirement_relations rr
		INNER JOIN requirements st ON st.id = rr.source_id AND st.workspace_id = rr.workspace_id
		INNER JOIN requirements tt ON tt.id = rr.target_id AND tt.workspace_id = rr.workspace_id
		WHERE rr.workspace_id = $1`, wsID)
	if err != nil {
		return nil, fmt.Errorf("query requirement relations for workspace: %w", err)
	}
	defer relRows.Close()

	for relRows.Next() {
		var id, wid, srcID, tgtID, relType, desc string
		var createdAt time.Time
		var srcTitle, tgtTitle string
		if err := relRows.Scan(&id, &wid, &srcID, &tgtID, &relType, &desc, &createdAt, &srcTitle, &tgtTitle); err != nil {
			return nil, fmt.Errorf("scan workspace requirement relation: %w", err)
		}
		rt := models.RelationType(relType)

		if src := byID[srcID]; src != nil {
			src.Relations = append(src.Relations, models.RequirementRelation{
				ID: id, WorkspaceID: wid, SourceID: srcID, TargetID: tgtID,
				RelationType: rt, Description: desc, TargetTitle: tgtTitle, CreatedAt: createdAt,
			})
		}
		if tgt := byID[tgtID]; tgt != nil {
			tgt.Relations = append(tgt.Relations, models.RequirementRelation{
				ID: id, WorkspaceID: wid, SourceID: srcID, TargetID: tgtID,
				RelationType: rt, Description: desc, TargetTitle: srcTitle, CreatedAt: createdAt,
			})
		}
	}
	if err := relRows.Err(); err != nil {
		return nil, fmt.Errorf("iterate workspace requirement relations: %w", err)
	}

	return reqs, nil
}

func (s *PostgresStore) UpdateRequirement(ctx context.Context, id, wsID string, req models.UpdateRequirementReq) (*models.Requirement, error) {
	sets := make([]string, 0, 8)
	args := make([]any, 0, 8)
	idx := 1

	if req.Title != nil {
		sets = append(sets, fmt.Sprintf("title = $%d", idx))
		args = append(args, *req.Title)
		idx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", idx))
		args = append(args, *req.Description)
		idx++
	}
	if req.Status != nil {
		sets = append(sets, fmt.Sprintf("status = $%d", idx))
		args = append(args, *req.Status)
		idx++
	}
	if req.CurrentPhase != nil {
		sets = append(sets, fmt.Sprintf("current_phase = $%d", idx))
		args = append(args, *req.CurrentPhase)
		idx++
	}
	if req.Priority != nil {
		sets = append(sets, fmt.Sprintf("priority = $%d", idx))
		args = append(args, *req.Priority)
		idx++
	}
	if req.Iteration != nil {
		sets = append(sets, fmt.Sprintf("iteration = $%d", idx))
		args = append(args, *req.Iteration)
		idx++
	}
	if req.Progress != nil {
		sets = append(sets, fmt.Sprintf("progress = $%d", idx))
		args = append(args, *req.Progress)
		idx++
	}
	if req.SortOrder != nil {
		sets = append(sets, fmt.Sprintf("sort_order = $%d", idx))
		args = append(args, *req.SortOrder)
		idx++
	}

	if len(sets) == 0 {
		return s.getRequirementLightweight(ctx, id, wsID)
	}

	sets = append(sets, "updated_at = NOW()")
	args = append(args, id)
	idIdx := idx
	idx++
	args = append(args, wsID)
	wsIdx := idx
	query := fmt.Sprintf("UPDATE requirements SET %s WHERE id = $%d AND workspace_id = $%d RETURNING %s",
		strings.Join(sets, ", "), idIdx, wsIdx, requirementCols)

	r, err := scanRequirement(s.pool.QueryRow(ctx, query, args...))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("update requirement: %w", err)
	}
	return r, nil
}

func (s *PostgresStore) getRequirementLightweight(ctx context.Context, id, wsID string) (*models.Requirement, error) {
	r, err := scanRequirement(s.pool.QueryRow(ctx,
		`SELECT `+requirementCols+` FROM requirements WHERE id = $1 AND workspace_id = $2`, id, wsID))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return r, nil
}

func (s *PostgresStore) DeleteRequirement(ctx context.Context, id, wsID string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM requirements WHERE id = $1 AND workspace_id = $2`, id, wsID)
	if err != nil {
		return fmt.Errorf("delete requirement: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ---------------------------------------------------------------------------
// Requirement relation operations
// ---------------------------------------------------------------------------

func (s *PostgresStore) CreateRequirementRelation(ctx context.Context, rel *models.RequirementRelation) error {
	return s.pool.QueryRow(ctx, `
		INSERT INTO requirement_relations (id, workspace_id, source_id, target_id, relation_type, description)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING created_at`,
		rel.ID, rel.WorkspaceID, rel.SourceID, rel.TargetID,
		string(rel.RelationType), rel.Description,
	).Scan(&rel.CreatedAt)
}

func (s *PostgresStore) DeleteRequirementRelation(ctx context.Context, id, wsID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM requirement_relations WHERE id = $1 AND workspace_id = $2`, id, wsID)
	if err != nil {
		return fmt.Errorf("delete requirement relation: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) GetRelatedRequirementArtifacts(ctx context.Context, reqID, wsID string) (map[string][]models.Artifact, error) {
	relRows, err := s.pool.Query(ctx, `
		SELECT rr.relation_type,
		       CASE WHEN rr.source_id = $1 THEN rr.target_id ELSE rr.source_id END AS related_id
		FROM requirement_relations rr
		WHERE (rr.source_id = $1 OR rr.target_id = $1) AND rr.workspace_id = $2`, reqID, wsID)
	if err != nil {
		return nil, fmt.Errorf("query related requirements: %w", err)
	}
	defer relRows.Close()

	type relInfo struct {
		relationType string
		relatedID    string
	}
	var rels []relInfo
	for relRows.Next() {
		var ri relInfo
		if err := relRows.Scan(&ri.relationType, &ri.relatedID); err != nil {
			return nil, fmt.Errorf("scan relation: %w", err)
		}
		rels = append(rels, ri)
	}

	result := make(map[string][]models.Artifact)
	for _, ri := range rels {
		artRows, err := s.pool.Query(ctx,
			`SELECT `+artifactCols+` FROM artifacts a
			 WHERE a.workspace_id = $2 AND a.execution_id IN (
			   SELECT ae.id FROM agent_executions ae WHERE ae.requirement_id = $1
			 ) ORDER BY a.created_at DESC`,
			ri.relatedID, wsID)
		if err != nil {
			return nil, fmt.Errorf("query related artifacts: %w", err)
		}
		defer artRows.Close()
		for artRows.Next() {
			a, err := scanArtifact(artRows)
			if err != nil {
				return nil, fmt.Errorf("scan related artifact: %w", err)
			}
			result[ri.relationType] = append(result[ri.relationType], *a)
		}
	}

	return result, nil
}

// ---------------------------------------------------------------------------
// Requirement phase task reset
// ---------------------------------------------------------------------------

func (s *PostgresStore) ResetRequirementPhaseTasks(ctx context.Context, reqID, phaseID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE tasks SET status = 'pending', assigned_agent = NULL, updated_at = NOW()
		WHERE requirement_id = $1 AND phase_id = $2 AND status != 'pending'`,
		reqID, phaseID)
	if err != nil {
		return fmt.Errorf("reset requirement phase tasks: %w", err)
	}
	return nil
}
