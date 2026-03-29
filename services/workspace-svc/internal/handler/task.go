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

type TaskHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewTaskHandler(svc *service.Service, log *slog.Logger) *TaskHandler {
	return &TaskHandler{svc: svc, log: log}
}

func (h *TaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	phaseID := chi.URLParam(r, "phaseId")

	var req models.CreateTaskReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	task, err := h.svc.CreateTask(r.Context(), wsID, phaseID, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "workspace or phase not found")
			return
		}
		h.log.Error("create task failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.Task]{Data: task})
}

func (h *TaskHandler) Update(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	taskID := chi.URLParam(r, "taskId")

	var req models.UpdateTaskReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	task, err := h.svc.UpdateTask(r.Context(), wsID, taskID, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "task not found")
			return
		}
		h.log.Error("update task failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.Task]{Data: task})
}

func (h *TaskHandler) Delete(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	taskID := chi.URLParam(r, "taskId")

	if err := h.svc.DeleteTask(r.Context(), wsID, taskID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "task not found")
			return
		}
		h.log.Error("delete task failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *TaskHandler) Claim(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	taskID := chi.URLParam(r, "taskId")

	var body struct {
		Agent string `json:"agent"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if body.Agent == "" {
		body.Agent = "unknown"
	}

	task, err := h.svc.ClaimTask(r.Context(), wsID, taskID, body.Agent)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusConflict, "task already claimed or not found")
			return
		}
		h.log.Error("claim task failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.Task]{Data: task})
}

func (h *TaskHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	phaseID := chi.URLParam(r, "phaseId")

	var req models.ReorderTasksReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.TaskIDs) == 0 {
		writeError(w, http.StatusBadRequest, "taskIds is required")
		return
	}

	if err := h.svc.ReorderTasks(r.Context(), wsID, phaseID, req.TaskIDs); err != nil {
		h.log.Error("reorder tasks failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[string]{Data: "ok"})
}
