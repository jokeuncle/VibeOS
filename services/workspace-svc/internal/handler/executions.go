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

type ExecutionHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewExecutionHandler(svc *service.Service, log *slog.Logger) *ExecutionHandler {
	return &ExecutionHandler{svc: svc, log: log}
}

// POST /api/workspaces/:wsId/executions
func (h *ExecutionHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	var req models.CreateAgentExecutionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.IntentType == "" || req.AgentType == "" {
		writeError(w, http.StatusBadRequest, "intentType and agentType are required")
		return
	}
	exec, err := h.svc.CreateAgentExecution(r.Context(), wsID, req)
	if err != nil {
		h.log.Error("create agent execution failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.AgentExecution]{Data: exec})
}

// GET /api/workspaces/:wsId/executions
func (h *ExecutionHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	cursor := r.URL.Query().Get("cursor")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var reqID *string
	if rid := r.URL.Query().Get("requirementId"); rid != "" {
		reqID = &rid
	}
	execs, nextCursor, err := h.svc.ListAgentExecutions(r.Context(), wsID, reqID, cursor, limit)
	if err != nil {
		h.log.Error("list agent executions failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.CursorResponse[models.AgentExecution]{
		Data:    execs,
		Cursor:  nextCursor,
		HasMore: nextCursor != "",
	})
}

// GET /api/workspaces/:wsId/executions/:execId
func (h *ExecutionHandler) Get(w http.ResponseWriter, r *http.Request) {
	execID := chi.URLParam(r, "execId")
	exec, err := h.svc.GetAgentExecution(r.Context(), execID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "execution not found")
			return
		}
		h.log.Error("get agent execution failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.AgentExecution]{Data: exec})
}

// PATCH /api/workspaces/:wsId/executions/:execId
func (h *ExecutionHandler) Update(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	execID := chi.URLParam(r, "execId")
	var req models.UpdateAgentExecutionReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	exec, err := h.svc.UpdateAgentExecution(r.Context(), wsID, execID, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "execution not found")
			return
		}
		h.log.Error("update agent execution failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.AgentExecution]{Data: exec})
}
