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

type PhaseHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewPhaseHandler(svc *service.Service, log *slog.Logger) *PhaseHandler {
	return &PhaseHandler{svc: svc, log: log}
}

func (h *PhaseHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	phaseID := chi.URLParam(r, "phaseId")

	var req models.UpdatePhaseStatusReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Status == "" {
		writeError(w, http.StatusBadRequest, "status is required")
		return
	}

	phase, err := h.svc.UpdatePhaseStatus(r.Context(), wsID, phaseID, req.Status)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "phase not found")
			return
		}
		if errors.Is(err, service.ErrInvalidTransition) {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		h.log.Error("update phase status failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.Phase]{Data: phase})
}
