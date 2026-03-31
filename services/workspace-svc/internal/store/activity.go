package store

import (
	"context"
	"fmt"

	"github.com/vibeos/shared/models"
)

func scanActivity(s rowScanner) (*models.Activity, error) {
	var a models.Activity
	var agentType *string
	err := s.Scan(&a.ID, &a.WorkspaceID, &a.RequirementID, &a.Type, &a.Description, &agentType, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	if agentType != nil {
		at := models.AgentType(*agentType)
		a.AgentType = &at
	}
	return &a, nil
}

func (s *PostgresStore) CreateActivity(ctx context.Context, activity *models.Activity) error {
	var agentType *string
	if activity.AgentType != nil {
		v := string(*activity.AgentType)
		agentType = &v
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO activities (id, workspace_id, type, description, agent_type) VALUES ($1, $2, $3, $4, $5)`,
		activity.ID, activity.WorkspaceID, activity.Type, activity.Description, agentType)
	if err != nil {
		return fmt.Errorf("insert activity: %w", err)
	}
	return nil
}

func (s *PostgresStore) ListActivities(ctx context.Context, workspaceID string, page, pageSize int) ([]models.Activity, int64, error) {
	var total int64
	err := s.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM activities WHERE workspace_id = $1`, workspaceID).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("count activities: %w", err)
	}

	offset := (page - 1) * pageSize
	rows, err := s.pool.Query(ctx, `
		SELECT id, workspace_id, requirement_id, type, description, agent_type, created_at
		FROM activities WHERE workspace_id = $1
		ORDER BY created_at DESC LIMIT $2 OFFSET $3`, workspaceID, pageSize, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("query activities: %w", err)
	}
	defer rows.Close()

	var activities []models.Activity
	for rows.Next() {
		a, err := scanActivity(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("scan activity: %w", err)
		}
		activities = append(activities, *a)
	}
	if activities == nil {
		activities = []models.Activity{}
	}
	return activities, total, nil
}
