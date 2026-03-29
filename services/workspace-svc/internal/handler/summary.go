package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/service"
)

type SummaryHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewSummaryHandler(svc *service.Service, log *slog.Logger) *SummaryHandler {
	return &SummaryHandler{svc: svc, log: log}
}

func (h *SummaryHandler) CreateConversationSummary(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	var req models.CreateConversationSummaryReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Summary == "" {
		writeError(w, http.StatusBadRequest, "summary is required")
		return
	}

	summary, err := h.svc.CreateConversationSummary(r.Context(), wsID, req)
	if err != nil {
		h.log.Error("create conversation summary failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.ConversationSummary]{Data: summary})
}

func (h *SummaryHandler) CreateActivitySummary(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	var req models.CreateActivitySummaryReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Summary == "" {
		writeError(w, http.StatusBadRequest, "summary is required")
		return
	}

	summary, err := h.svc.CreateActivitySummary(r.Context(), wsID, req)
	if err != nil {
		h.log.Error("create activity summary failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.ActivitySummary]{Data: summary})
}
