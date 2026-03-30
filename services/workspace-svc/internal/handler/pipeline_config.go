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

type PipelineConfigHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewPipelineConfigHandler(svc *service.Service, log *slog.Logger) *PipelineConfigHandler {
	return &PipelineConfigHandler{svc: svc, log: log}
}

// GET /api/workspaces/:wsId/pipeline
func (h *PipelineConfigHandler) Get(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	configs, err := h.svc.GetPipelineConfigs(r.Context(), wsID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "workspace not found")
			return
		}
		h.log.Error("get pipeline configs failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.PipelinePhaseConfig]{Data: configs})
}

// PATCH /api/workspaces/:wsId/pipeline
func (h *PipelineConfigHandler) Update(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	var req models.UpdatePipelineReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Phases) == 0 {
		writeError(w, http.StatusBadRequest, "phases is required")
		return
	}
	configs, err := h.svc.UpdatePipelineConfigs(r.Context(), wsID, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "workspace not found")
			return
		}
		h.log.Error("update pipeline configs failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.PipelinePhaseConfig]{Data: configs})
}
