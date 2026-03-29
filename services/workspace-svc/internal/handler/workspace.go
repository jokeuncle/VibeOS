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

// ---------------------------------------------------------------------------
// Shared response helpers (used by all handlers in this package)
// ---------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, models.APIResponse[any]{Error: msg})
}

// ---------------------------------------------------------------------------
// WorkspaceHandler
// ---------------------------------------------------------------------------

type WorkspaceHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewWorkspaceHandler(svc *service.Service, log *slog.Logger) *WorkspaceHandler {
	return &WorkspaceHandler{svc: svc, log: log}
}

func (h *WorkspaceHandler) List(w http.ResponseWriter, r *http.Request) {
	workspaces, err := h.svc.ListWorkspaces(r.Context())
	if err != nil {
		h.log.Error("list workspaces failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.Workspace]{Data: workspaces})
}

func (h *WorkspaceHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateWorkspaceReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	ws, err := h.svc.CreateWorkspace(r.Context(), req)
	if err != nil {
		h.log.Error("create workspace failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.Workspace]{Data: ws})
}

func (h *WorkspaceHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "wsId")
	ws, err := h.svc.GetWorkspace(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "workspace not found")
			return
		}
		h.log.Error("get workspace failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.Workspace]{Data: ws})
}

func (h *WorkspaceHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "wsId")
	var req models.UpdateWorkspaceReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ws, err := h.svc.UpdateWorkspace(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "workspace not found")
			return
		}
		h.log.Error("update workspace failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.Workspace]{Data: ws})
}

func (h *WorkspaceHandler) ResetPhasesPipeline(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "wsId")
	if err := h.svc.ResetWorkspacePhasePipeline(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "workspace not found")
			return
		}
		h.log.Error("reset workspace phases failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	ws, err := h.svc.GetWorkspace(r.Context(), id)
	if err != nil {
		h.log.Error("get workspace after reset failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.Workspace]{Data: ws})
}

func (h *WorkspaceHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "wsId")
	if err := h.svc.DeleteWorkspace(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "workspace not found")
			return
		}
		h.log.Error("delete workspace failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *WorkspaceHandler) ListActivities(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	activities, total, err := h.svc.ListActivities(r.Context(), wsID, page, pageSize)
	if err != nil {
		h.log.Error("list activities failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.PaginatedResponse[models.Activity]{
		Data:     activities,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	})
}
