package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/store"
)

var ErrInvalidTransition = errors.New("invalid phase status transition")

type Service struct {
	store store.Store
	redis *redis.Client
	log   *slog.Logger
}

func New(s store.Store, r *redis.Client, l *slog.Logger) *Service {
	return &Service{store: s, redis: r, log: l}
}

// ---------------------------------------------------------------------------
// Default phase / agent definitions
// ---------------------------------------------------------------------------

var defaultPhases = []struct {
	Type        models.PhaseType
	Name        string
	Description string
}{
	{models.PhaseRequirement, "Requirement Analysis", "Gather and analyze project requirements"},
	{models.PhaseDesign, "UI/UX Design", "Design user interfaces and experience"},
	{models.PhaseArchitecture, "Architecture", "Define system architecture and technical design"},
	{models.PhaseDevelopment, "Development", "Implement features and functionality"},
	{models.PhaseTesting, "Testing & QA", "Test and verify quality assurance"},
	{models.PhaseDeployment, "Deployment", "Deploy to production environment"},
	{models.PhaseMonitoring, "Monitoring", "Monitor system health and performance"},
}

var defaultAgents = []struct {
	Type   models.AgentType
	Name   string
	Avatar string
}{
	{models.AgentRequirement, "Requirements Analyst", "📋"},
	{models.AgentDesign, "UI/UX Designer", "🎨"},
	{models.AgentArchitecture, "Solutions Architect", "🏗️"},
	{models.AgentDevelopment, "Developer", "💻"},
	{models.AgentTesting, "QA Engineer", "🧪"},
	{models.AgentCICD, "DevOps Engineer", "🚀"},
	{models.AgentMonitoring, "SRE", "📊"},
	{models.AgentPM, "Project Manager", "📌"},
}

// ---------------------------------------------------------------------------
// Workspace operations
// ---------------------------------------------------------------------------

func (s *Service) ListWorkspaces(ctx context.Context) ([]models.Workspace, error) {
	return s.store.ListWorkspaces(ctx)
}

func (s *Service) GetWorkspace(ctx context.Context, id string) (*models.Workspace, error) {
	return s.store.GetWorkspace(ctx, id)
}

func (s *Service) CreateWorkspace(ctx context.Context, req models.CreateWorkspaceReq) (*models.Workspace, error) {
	wsID := uuid.New().String()

	ws := models.Workspace{
		ID:          wsID,
		Name:        req.Name,
		Description: req.Description,
		Color:       req.Color,
	}
	if ws.Color == "" {
		ws.Color = "indigo"
	}

	phases := make([]models.Phase, len(defaultPhases))
	for i, d := range defaultPhases {
		phases[i] = models.Phase{
			ID:          uuid.New().String(),
			WorkspaceID: wsID,
			Type:        d.Type,
			Name:        d.Name,
			Description: d.Description,
			SortOrder:   i,
		}
	}

	agents := make([]models.Agent, len(defaultAgents))
	for i, d := range defaultAgents {
		agents[i] = models.Agent{
			ID:          uuid.New().String(),
			WorkspaceID: wsID,
			Type:        d.Type,
			Name:        d.Name,
			Avatar:      d.Avatar,
		}
	}

	if err := s.store.CreateWorkspaceFull(ctx, ws, phases, agents); err != nil {
		return nil, fmt.Errorf("create workspace: %w", err)
	}

	s.logActivity(ctx, wsID, "workspace_created", req.Name, nil)
	s.publishEvent(ctx, wsID, "workspace_created", map[string]string{"id": wsID, "name": req.Name})

	return s.store.GetWorkspace(ctx, wsID)
}

func (s *Service) UpdateWorkspace(ctx context.Context, id string, req models.UpdateWorkspaceReq) (*models.Workspace, error) {
	if _, err := s.store.UpdateWorkspace(ctx, id, req); err != nil {
		return nil, err
	}

	result, err := s.store.GetWorkspace(ctx, id)
	if err != nil {
		return nil, err
	}

	s.publishEvent(ctx, id, "workspace_updated", result)
	return result, nil
}

func (s *Service) DeleteWorkspace(ctx context.Context, id string) error {
	if err := s.store.DeleteWorkspace(ctx, id); err != nil {
		return err
	}
	s.publishEvent(ctx, id, "workspace_deleted", map[string]string{"id": id})
	return nil
}

// ---------------------------------------------------------------------------
// Phase operations
// ---------------------------------------------------------------------------

func phaseStatusTransitionAllowed(from, to models.PhaseStatus) bool {
	switch {
	case from == models.StatusPending && to == models.StatusInProgress:
		return true
	case from == models.StatusInProgress && to == models.StatusCompleted:
		return true
	case from == models.StatusInProgress && to == models.StatusPending:
		// e.g. orchestrator aborted mid-phase — unlock phase for retry
		return true
	default:
		return false
	}
}

func (s *Service) UpdatePhaseStatus(ctx context.Context, wsID, phaseID, status string) (*models.Phase, error) {
	phase, err := s.store.GetPhase(ctx, phaseID)
	if err != nil {
		return nil, err
	}
	if phase.WorkspaceID != wsID {
		return nil, store.ErrNotFound
	}

	newStatus := models.PhaseStatus(status)
	if !phaseStatusTransitionAllowed(phase.Status, newStatus) {
		return nil, fmt.Errorf("%w: cannot transition from %s to %s", ErrInvalidTransition, phase.Status, newStatus)
	}

	updated, err := s.store.UpdatePhaseStatusCAS(ctx, phaseID, string(phase.Status), status)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, fmt.Errorf("%w: phase status changed concurrently", ErrInvalidTransition)
		}
		return nil, err
	}

	if newStatus == models.StatusInProgress {
		if err := s.store.UpdateWorkspaceCurrentPhase(ctx, wsID, &phaseID); err != nil {
			s.log.Error("failed to update current phase", "error", err)
		}
	}

	if err := s.recalculateWorkspaceProgress(ctx, wsID); err != nil {
		s.log.Error("failed to recalculate workspace progress", "error", err)
	}

	s.logActivity(ctx, wsID, "phase_status_changed",
		fmt.Sprintf("%s → %s", updated.Name, status), nil)
	s.publishEvent(ctx, wsID, models.WSEventPhaseUpdate, updated)

	return updated, nil
}

// ---------------------------------------------------------------------------
// Task operations
// ---------------------------------------------------------------------------

func (s *Service) CreateTask(ctx context.Context, wsID, phaseID string, req models.CreateTaskReq) (*models.Task, error) {
	task := &models.Task{
		ID:          uuid.New().String(),
		PhaseID:     phaseID,
		WorkspaceID: wsID,
		Title:       req.Title,
		Description: req.Description,
		Status:      models.StatusPending,
		Labels:      []string{},
	}
	if req.Priority != nil {
		p := models.TaskPriority(*req.Priority)
		task.Priority = &p
	}
	if req.AssignedAgent != nil {
		a := models.AgentType(*req.AssignedAgent)
		task.AssignedAgent = &a
	}

	if err := s.store.CreateTask(ctx, task); err != nil {
		return nil, fmt.Errorf("create task: %w", err)
	}

	if err := s.recalculatePhaseProgress(ctx, phaseID); err != nil {
		s.log.Error("failed to recalculate phase progress", "error", err)
	}
	if err := s.recalculateWorkspaceProgress(ctx, wsID); err != nil {
		s.log.Error("failed to recalculate workspace progress", "error", err)
	}

	s.logActivity(ctx, wsID, "task_created", req.Title, nil)
	s.publishEvent(ctx, wsID, models.WSEventTaskUpdate, task)

	return task, nil
}

func (s *Service) UpdateTask(ctx context.Context, wsID, taskID string, req models.UpdateTaskReq) (*models.Task, error) {
	task, err := s.store.UpdateTask(ctx, taskID, wsID, req)
	if err != nil {
		return nil, err
	}

	if req.Status != nil {
		if err := s.recalculatePhaseProgress(ctx, task.PhaseID); err != nil {
			s.log.Error("failed to recalculate phase progress", "error", err)
		}
		if err := s.recalculateWorkspaceProgress(ctx, wsID); err != nil {
			s.log.Error("failed to recalculate workspace progress", "error", err)
		}
	}

	s.logActivity(ctx, wsID, "task_updated", task.Title, nil)
	s.publishEvent(ctx, wsID, models.WSEventTaskUpdate, task)

	if req.Status != nil && *req.Status == string(models.StatusCompleted) {
		if completed, err := s.AutoCompletePhaseIfDone(ctx, wsID, task.PhaseID); err != nil {
			s.log.Error("auto-complete phase check failed", "error", err)
		} else if completed {
			s.log.Info("phase auto-completed", "phaseId", task.PhaseID)
		}
	}

	return task, nil
}

func (s *Service) ClaimTask(ctx context.Context, wsID, taskID, agent string) (*models.Task, error) {
	task, err := s.store.ClaimTask(ctx, taskID, wsID, agent)
	if err != nil {
		return nil, err
	}
	if err := s.recalculatePhaseProgress(ctx, task.PhaseID); err != nil {
		s.log.Error("failed to recalculate phase progress", "error", err)
	}
	s.logActivity(ctx, wsID, "task_updated", task.Title+" (claimed by "+agent+")", nil)
	s.publishEvent(ctx, wsID, models.WSEventTaskUpdate, task)
	return task, nil
}

func (s *Service) DeleteTask(ctx context.Context, wsID, taskID string) error {
	task, err := s.store.GetTask(ctx, taskID)
	if err != nil {
		return err
	}

	if err := s.store.DeleteTask(ctx, taskID, wsID); err != nil {
		return err
	}

	if err := s.recalculatePhaseProgress(ctx, task.PhaseID); err != nil {
		s.log.Error("failed to recalculate phase progress", "error", err)
	}
	if err := s.recalculateWorkspaceProgress(ctx, wsID); err != nil {
		s.log.Error("failed to recalculate workspace progress", "error", err)
	}

	s.logActivity(ctx, wsID, "task_deleted", task.Title, nil)
	s.publishEvent(ctx, wsID, models.WSEventTaskUpdate, map[string]string{"id": taskID, "deleted": "true"})

	return nil
}

func (s *Service) ReorderTasks(ctx context.Context, wsID, phaseID string, taskIDs []string) error {
	if err := s.store.ReorderTasks(ctx, phaseID, taskIDs); err != nil {
		return err
	}
	s.publishEvent(ctx, wsID, models.WSEventTaskUpdate, map[string]any{"phaseId": phaseID, "reordered": true})
	return nil
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

func (s *Service) ListActivities(ctx context.Context, wsID string, page, pageSize int) ([]models.Activity, int64, error) {
	return s.store.ListActivities(ctx, wsID, page, pageSize)
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

func (s *Service) CreateArtifact(ctx context.Context, wsID string, req models.CreateArtifactReq) (*models.Artifact, error) {
	metadata := req.Metadata
	if metadata == "" {
		metadata = "{}"
	}
	artifact := &models.Artifact{
		ID:          uuid.New().String(),
		WorkspaceID: wsID,
		PhaseID:     req.PhaseID,
		TaskID:      req.TaskID,
		AgentType:   models.AgentType(req.AgentType),
		Type:        req.Type,
		Title:       req.Title,
		Content:     req.Content,
		Metadata:    metadata,
		Version:     1,
	}

	if err := s.store.CreateArtifact(ctx, artifact); err != nil {
		return nil, fmt.Errorf("create artifact: %w", err)
	}

	agentType := models.AgentType(req.AgentType)
	s.logActivity(ctx, wsID, "artifact_created",
		fmt.Sprintf("%s [%s]", req.Title, req.Type), &agentType)
	s.publishEvent(ctx, wsID, "artifact_created", artifact)

	return artifact, nil
}

func (s *Service) ListArtifactsByWorkspace(ctx context.Context, wsID string) ([]models.Artifact, error) {
	return s.store.ListArtifactsByWorkspace(ctx, wsID)
}

func (s *Service) ListArtifactsByPhase(ctx context.Context, wsID, phaseID string) ([]models.Artifact, error) {
	return s.store.ListArtifactsByPhase(ctx, wsID, phaseID)
}

func (s *Service) GetArtifact(ctx context.Context, wsID, id string) (*models.Artifact, error) {
	return s.store.GetArtifact(ctx, wsID, id)
}

// ---------------------------------------------------------------------------
// Agent operations
// ---------------------------------------------------------------------------

func (s *Service) ListAgents(ctx context.Context, wsID string) ([]models.Agent, error) {
	return s.store.ListAgentsByWorkspace(ctx, wsID)
}

func (s *Service) UpdateAgent(ctx context.Context, wsID, agentID string, req models.UpdateAgentReq) (*models.Agent, error) {
	agent, err := s.store.UpdateAgent(ctx, agentID, wsID, req)
	if err != nil {
		return nil, err
	}
	s.publishEvent(ctx, wsID, models.WSEventAgentStatus, agent)
	return agent, nil
}

// ---------------------------------------------------------------------------
// Feedback & trust operations
// ---------------------------------------------------------------------------

func (s *Service) CreateFeedbackSignal(ctx context.Context, wsID string, req models.CreateFeedbackSignalReq) (*models.FeedbackSignal, error) {
	signal := &models.FeedbackSignal{
		ID:             uuid.New().String(),
		WorkspaceID:    wsID,
		AgentType:      req.AgentType,
		ActionType:     req.ActionType,
		OriginalOutput: req.OriginalOutput,
		ModifiedOutput: req.ModifiedOutput,
		Context:        req.Context,
	}
	if err := s.store.CreateFeedbackSignal(ctx, signal); err != nil {
		return nil, fmt.Errorf("create feedback signal: %w", err)
	}

	if err := s.store.UpsertTrustScore(ctx, req.AgentType, req.ActionType); err != nil {
		s.log.Error("failed to upsert trust score", "error", err)
	}

	s.logActivity(ctx, wsID, "feedback_recorded",
		fmt.Sprintf("%s %s output from %s", req.ActionType, "agent", req.AgentType),
		nil)

	return signal, nil
}

func (s *Service) ListFeedbackSignals(ctx context.Context, wsID string, limit int) ([]models.FeedbackSignal, error) {
	return s.store.ListFeedbackSignals(ctx, wsID, limit)
}

func (s *Service) GetTrustScores(ctx context.Context, agentType string) ([]models.TrustScore, error) {
	return s.store.GetTrustScores(ctx, agentType)
}

// ---------------------------------------------------------------------------
// Summary creation
// ---------------------------------------------------------------------------

func (s *Service) CreateConversationSummary(ctx context.Context, wsID string, req models.CreateConversationSummaryReq) (*models.ConversationSummary, error) {
	now := models.TimeNow()
	cs := &models.ConversationSummary{
		ID:            uuid.New().String(),
		WorkspaceID:   wsID,
		Summary:       req.Summary,
		KeyDecisions:  ensureJSONArray(req.KeyDecisions),
		TimeRangeFrom: now,
		TimeRangeTo:   now,
		MessageCount:  req.MessageCount,
	}
	if req.SessionID != "" {
		cs.SessionID = &req.SessionID
	}
	if req.AgentType != "" {
		cs.AgentType = &req.AgentType
	}
	if err := s.store.SaveConversationSummary(ctx, cs); err != nil {
		return nil, fmt.Errorf("create conversation summary: %w", err)
	}
	return cs, nil
}

func (s *Service) CreateActivitySummary(ctx context.Context, wsID string, req models.CreateActivitySummaryReq) (*models.ActivitySummary, error) {
	now := models.TimeNow()
	as := &models.ActivitySummary{
		ID:            uuid.New().String(),
		WorkspaceID:   wsID,
		Summary:       req.Summary,
		KeyEvents:     ensureJSONArray(req.KeyEvents),
		TimeRangeFrom: now,
		TimeRangeTo:   now,
		ActivityCount: req.ActivityCount,
	}
	if err := s.store.SaveActivitySummary(ctx, as); err != nil {
		return nil, fmt.Errorf("create activity summary: %w", err)
	}
	return as, nil
}

// ensureJSONArray wraps a plain string as a single-element JSON array.
// If the input is already valid JSON (array or object), it's returned as-is.
func ensureJSONArray(s string) string {
	if s == "" {
		return "[]"
	}
	trimmed := s
	if len(trimmed) > 0 && (trimmed[0] == '[' || trimmed[0] == '{') {
		if json.Valid([]byte(trimmed)) {
			return trimmed
		}
	}
	b, _ := json.Marshal([]string{s})
	return string(b)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func (s *Service) AutoCompletePhaseIfDone(ctx context.Context, wsID, phaseID string) (bool, error) {
	total, completed, err := s.store.CountTasksByPhase(ctx, phaseID)
	if err != nil {
		return false, err
	}
	if total == 0 || completed != total {
		return false, nil
	}

	phase, err := s.store.GetPhase(ctx, phaseID)
	if err != nil {
		return false, err
	}
	if phase.Status == models.StatusCompleted {
		return false, nil
	}

	if phase.Status == models.StatusPending {
		if _, err := s.UpdatePhaseStatus(ctx, wsID, phaseID, string(models.StatusInProgress)); err != nil {
			return false, err
		}
	}
	if _, err := s.UpdatePhaseStatus(ctx, wsID, phaseID, string(models.StatusCompleted)); err != nil {
		return false, err
	}

	s.advanceCurrentPhase(ctx, wsID, phaseID)
	return true, nil
}

func (s *Service) advanceCurrentPhase(ctx context.Context, wsID, completedPhaseID string) {
	phases, err := s.store.ListPhasesByWorkspace(ctx, wsID)
	if err != nil {
		s.log.Error("failed to list phases for advance", "error", err)
		return
	}
	found := false
	for _, p := range phases {
		if found && p.Status != models.StatusCompleted {
			if err := s.store.UpdateWorkspaceCurrentPhase(ctx, wsID, &p.ID); err != nil {
				s.log.Error("failed to advance current_phase_id", "error", err)
			}
			return
		}
		if p.ID == completedPhaseID {
			found = true
		}
	}
}

func (s *Service) recalculatePhaseProgress(ctx context.Context, phaseID string) error {
	total, completed, err := s.store.CountTasksByPhase(ctx, phaseID)
	if err != nil {
		return err
	}
	var progress float64
	if total > 0 {
		progress = float64(completed) / float64(total)
	}
	return s.store.UpdatePhaseProgress(ctx, phaseID, progress)
}

func (s *Service) recalculateWorkspaceProgress(ctx context.Context, wsID string) error {
	phases, err := s.store.ListPhasesByWorkspace(ctx, wsID)
	if err != nil {
		return err
	}
	if len(phases) == 0 {
		return nil
	}
	var sum float64
	for _, p := range phases {
		sum += p.Progress
	}
	return s.store.UpdateWorkspaceProgress(ctx, wsID, sum/float64(len(phases)))
}

func (s *Service) logActivity(ctx context.Context, wsID, actType, desc string, agentType *models.AgentType) {
	activity := &models.Activity{
		ID:          uuid.New().String(),
		WorkspaceID: wsID,
		Type:        actType,
		Description: desc,
		AgentType:   agentType,
	}
	if err := s.store.CreateActivity(ctx, activity); err != nil {
		s.log.Error("failed to log activity", "error", err)
	}
}

func (s *Service) publishEvent(ctx context.Context, wsID, eventType string, payload any) {
	if s.redis == nil {
		return
	}
	evt := map[string]any{
		"type":        eventType,
		"workspaceId": wsID,
		"payload":     payload,
	}
	data, err := json.Marshal(evt)
	if err != nil {
		s.log.Error("failed to marshal event", "error", err)
		return
	}
	if err := s.redis.Publish(ctx, "vibeos:events", data).Err(); err != nil {
		s.log.Error("failed to publish redis event", "error", err)
	}
}
