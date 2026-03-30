package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/service"
	"github.com/vibeos/workspace-svc/internal/store"
)

type ExecutionLogHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewExecutionLogHandler(svc *service.Service, log *slog.Logger) *ExecutionLogHandler {
	return &ExecutionLogHandler{svc: svc, log: log}
}

// GET /api/workspaces/:wsId/execution-logs
func (h *ExecutionLogHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	cursor := r.URL.Query().Get("cursor")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	logs, nextCursor, err := h.svc.ListExecutionLogs(r.Context(), wsID, cursor, limit)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "workspace not found")
			return
		}
		h.log.Error("list execution logs failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.CursorResponse[models.ExecutionLog]{
		Data:    logs,
		Cursor:  nextCursor,
		HasMore: nextCursor != "",
	})
}

// POST /api/workspaces/:wsId/execution-logs
func (h *ExecutionLogHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	var req models.CreateExecutionLogReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AgentType == "" || req.Message == "" {
		writeError(w, http.StatusBadRequest, "agent and message are required")
		return
	}
	entry, err := h.svc.CreateExecutionLog(r.Context(), wsID, req)
	if err != nil {
		h.log.Error("create execution log failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.ExecutionLog]{Data: entry})
}
