package service

import (
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/store"
)

//go:embed default-graphs.json
var defaultGraphsJSON []byte

type graphNodeDef struct {
	ID            string             `json:"id"`
	Type          string             `json:"type"`
	CapabilityRef string             `json:"capability_ref"`
	Config        map[string]any     `json:"config"`
	Position      map[string]float64 `json:"position,omitempty"`
}

type graphDef struct {
	Nodes       []graphNodeDef `json:"nodes"`
	Edges       []any          `json:"edges"`
	StateSchema any            `json:"state_schema"`
	Config      any            `json:"config"`
}

var defaultGraphs map[string]graphDef

func init() {
	defaultGraphs = make(map[string]graphDef)
	if err := json.Unmarshal(defaultGraphsJSON, &defaultGraphs); err != nil {
		log.Fatalf("failed to parse embedded default-graphs.json: %v", err)
	}
}

// DefaultGraphDef returns the embedded default graph JSON for a phase type,
// or nil if no default exists (e.g. deployment, monitoring).
func DefaultGraphDef(phaseType string) json.RawMessage {
	gd, ok := defaultGraphs[phaseType]
	if !ok {
		return nil
	}
	raw, err := json.Marshal(gd)
	if err != nil {
		return nil
	}
	return raw
}

// SyncGraphTasks ensures that tasks in a phase match the capability nodes
// in a graph definition. New nodes get new tasks; removed nodes get tasks
// marked as completed (no "cancelled" status exists); updated node titles
// propagate to task titles.
//
// If graphID is empty the graph is treated as an ephemeral / default graph
// and graph_id on tasks is set to NULL.
func (s *Service) SyncGraphTasks(
	ctx context.Context,
	workspaceID, phaseID string,
	graphRaw json.RawMessage,
	graphID string,
	requirementID *string,
) ([]models.Task, error) {
	nodes, err := extractCapabilityNodes(graphRaw)
	if err != nil {
		return nil, fmt.Errorf("parse graph_def: %w", err)
	}

	var graphIDPtr *string
	if graphID != "" {
		graphIDPtr = &graphID
	}

	existing, err := s.store.ListTasksByPhase(ctx, workspaceID, phaseID, requirementID)
	if err != nil {
		return nil, fmt.Errorf("list existing tasks: %w", err)
	}

	byNodeID := make(map[string]*models.Task, len(existing))
	for i := range existing {
		if existing[i].GraphNodeID != nil {
			byNodeID[*existing[i].GraphNodeID] = &existing[i]
		}
	}

	seen := make(map[string]bool, len(nodes))
	var result []models.Task

	for _, node := range nodes {
		seen[node.ID] = true
		title := nodeTitle(node)
		desc := nodeDescription(node)

		if t, ok := byNodeID[node.ID]; ok {
			if t.Title != title || t.Description != desc {
				titleCopy := title
				descCopy := desc
				updated, err := s.store.UpdateTask(ctx, t.ID, workspaceID, models.UpdateTaskReq{
					Title:       &titleCopy,
					Description: &descCopy,
				})
				if err != nil {
					s.log.Error("sync: update task title", "error", err, "taskId", t.ID)
				} else {
					result = append(result, *updated)
				}
			} else {
				result = append(result, *t)
			}
			continue
		}

		nodeIDCopy := node.ID
		task := &models.Task{
			ID:            uuid.New().String(),
			PhaseID:       phaseID,
			WorkspaceID:   workspaceID,
			RequirementID: requirementID,
			Title:         title,
			Description:   desc,
			Status:        models.StatusPending,
			Labels:        []string{},
			GraphNodeID:   &nodeIDCopy,
			GraphID:       graphIDPtr,
		}
		if err := s.store.CreateTask(ctx, task); err != nil {
			s.log.Error("sync: create task for graph node", "error", err, "nodeId", node.ID)
			continue
		}
		result = append(result, *task)
	}

	orphanStatus := "completed"
	for nodeID, t := range byNodeID {
		if !seen[nodeID] && t.Status != models.StatusCompleted {
			_, err := s.store.UpdateTask(ctx, t.ID, workspaceID, models.UpdateTaskReq{
				Status: &orphanStatus,
			})
			if err != nil {
				s.log.Error("sync: mark orphan task completed", "error", err, "taskId", t.ID)
			}
		}
	}

	return result, nil
}

// SyncGraphTasksForPhaseType resolves the active (or default) graph for
// a phase type, then syncs tasks accordingly.
func (s *Service) SyncGraphTasksForPhaseType(
	ctx context.Context,
	workspaceID, phaseID, phaseType string,
	requirementID *string,
) ([]models.Task, error) {
	activeGraph, err := s.store.GetActiveWorkspaceGraph(ctx, workspaceID)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return nil, fmt.Errorf("get active graph: %w", err)
	}
	if err == nil && activeGraph != nil {
		return s.SyncGraphTasks(ctx, workspaceID, phaseID,
			activeGraph.GraphDef, activeGraph.ID, requirementID)
	}

	defaultDef := DefaultGraphDef(phaseType)
	if defaultDef == nil {
		return nil, nil
	}
	return s.SyncGraphTasks(ctx, workspaceID, phaseID, defaultDef, "", requirementID)
}

func extractCapabilityNodes(raw json.RawMessage) ([]graphNodeDef, error) {
	var gd graphDef
	if err := json.Unmarshal(raw, &gd); err != nil {
		return nil, err
	}
	var caps []graphNodeDef
	for _, n := range gd.Nodes {
		if n.Type == "capability" {
			caps = append(caps, n)
		}
	}
	return caps, nil
}

func nodeTitle(n graphNodeDef) string {
	if t, ok := n.Config["task_title"].(string); ok && t != "" {
		return t
	}
	return n.ID
}

func nodeDescription(n graphNodeDef) string {
	if d, ok := n.Config["task_description"].(string); ok {
		return d
	}
	return ""
}

// GetWorkspaceGraph delegates to the store.
func (s *Service) GetWorkspaceGraph(ctx context.Context, id string) (*models.WorkspaceGraph, error) {
	return s.store.GetWorkspaceGraph(ctx, id)
}

// ListPhases returns phases for a workspace.
func (s *Service) ListPhases(ctx context.Context, workspaceID string) ([]models.Phase, error) {
	return s.store.ListPhasesByWorkspace(ctx, workspaceID)
}
