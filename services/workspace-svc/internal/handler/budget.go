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

type BudgetHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewBudgetHandler(svc *service.Service, log *slog.Logger) *BudgetHandler {
	return &BudgetHandler{svc: svc, log: log}
}

// GET /api/workspaces/:wsId/budget
func (h *BudgetHandler) Get(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	resp, err := h.svc.GetBudget(r.Context(), wsID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "workspace not found")
			return
		}
		h.log.Error("get budget failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.BudgetResponse]{Data: resp})
}

// PATCH /api/workspaces/:wsId/budget
func (h *BudgetHandler) Update(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	var req models.UpdateBudgetSettingsReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	settings, err := h.svc.UpdateBudgetSettings(r.Context(), wsID, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "workspace not found")
			return
		}
		h.log.Error("update budget failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.WorkspaceBudgetSettings]{Data: settings})
}
