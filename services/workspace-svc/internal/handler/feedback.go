package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/service"
)

type FeedbackHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewFeedbackHandler(svc *service.Service, log *slog.Logger) *FeedbackHandler {
	return &FeedbackHandler{svc: svc, log: log}
}

func (h *FeedbackHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	var req models.CreateFeedbackSignalReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ActionType == "" {
		writeError(w, http.StatusBadRequest, "actionType is required")
		return
	}

	signal, err := h.svc.CreateFeedbackSignal(r.Context(), wsID, req)
	if err != nil {
		h.log.Error("create feedback signal failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.FeedbackSignal]{Data: signal})
}

func (h *FeedbackHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}

	signals, err := h.svc.ListFeedbackSignals(r.Context(), wsID, limit)
	if err != nil {
		h.log.Error("list feedback signals failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.FeedbackSignal]{Data: signals})
}

