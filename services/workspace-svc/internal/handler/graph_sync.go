package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/service"
	"github.com/vibeos/workspace-svc/internal/store"
)

type GraphSyncHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewGraphSyncHandler(svc *service.Service, log *slog.Logger) *GraphSyncHandler {
	return &GraphSyncHandler{svc: svc, log: log}
}

type syncTasksReq struct {
	PhaseID       string  `json:"phaseId"`
	RequirementID *string `json:"requirementId,omitempty"`
}

// GetDefaultGraph returns the embedded default graph definition for a phase type.
func (h *GraphSyncHandler) GetDefaultGraph(w http.ResponseWriter, r *http.Request) {
	phaseType := chi.URLParam(r, "phaseType")
	raw := service.DefaultGraphDef(phaseType)
	if raw == nil {
		writeError(w, http.StatusNotFound, "no default graph for phase type")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[json.RawMessage]{Data: raw})
}

// SyncTasks reads the graph_def from the specified graph, then creates,
// updates, or removes tasks so they match the graph's capability nodes.
// Accepts optional JSON body with phaseId to scope to a single phase.
func (h *GraphSyncHandler) SyncTasks(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	graphID := chi.URLParam(r, "graphId")

	graph, err := h.svc.GetWorkspaceGraph(r.Context(), graphID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "graph not found")
			return
		}
		h.log.Error("get graph for sync", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	if graph.WorkspaceID != wsID {
		writeError(w, http.StatusNotFound, "graph not found")
		return
	}

	var req syncTasksReq
	if r.Body != nil && r.ContentLength > 0 {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	phases, err := h.svc.ListPhases(r.Context(), wsID)
	if err != nil {
		h.log.Error("list phases for sync", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	var synced []models.Task

	if req.PhaseID != "" {
		tasks, err := h.svc.SyncGraphTasks(r.Context(), wsID, req.PhaseID,
			graph.GraphDef, graph.ID, req.RequirementID)
		if err != nil {
			h.log.Error("sync graph tasks", "error", err, "phase", req.PhaseID)
			writeError(w, http.StatusInternalServerError, "sync failed")
			return
		}
		synced = tasks
	} else {
		for _, phase := range phases {
			tasks, err := h.svc.SyncGraphTasks(r.Context(), wsID, phase.ID,
				graph.GraphDef, graph.ID, nil)
			if err != nil {
				h.log.Error("sync graph tasks", "error", err, "phase", phase.Type)
				continue
			}
			synced = append(synced, tasks...)
		}
	}

	if synced == nil {
		synced = []models.Task{}
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.Task]{Data: synced})
}
