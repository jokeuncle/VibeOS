package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/store"
)

type WorkspaceGraphHandler struct {
	store store.Store
	log   *slog.Logger
}

func NewWorkspaceGraphHandler(s store.Store, log *slog.Logger) *WorkspaceGraphHandler {
	return &WorkspaceGraphHandler{store: s, log: log}
}

func (h *WorkspaceGraphHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	scope := r.URL.Query().Get("scope")
	graphs, err := h.store.ListWorkspaceGraphsByScope(r.Context(), wsID, scope)
	if err != nil {
		h.log.Error("list workspace graphs", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if graphs == nil {
		graphs = []models.WorkspaceGraph{}
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.WorkspaceGraph]{Data: graphs})
}

func (h *WorkspaceGraphHandler) Get(w http.ResponseWriter, r *http.Request) {
	graphID := chi.URLParam(r, "graphId")
	g, err := h.store.GetWorkspaceGraph(r.Context(), graphID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "graph not found")
			return
		}
		h.log.Error("get workspace graph", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.WorkspaceGraph]{Data: g})
}

func (h *WorkspaceGraphHandler) GetActive(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	scope := r.URL.Query().Get("scope")
	if scope == "" {
		scope = "phase"
	}
	g, err := h.store.GetActiveWorkspaceGraphByScope(r.Context(), wsID, scope)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeJSON(w, http.StatusOK, models.APIResponse[*models.WorkspaceGraph]{Data: nil})
			return
		}
		h.log.Error("get active workspace graph", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.WorkspaceGraph]{Data: g})
}

func (h *WorkspaceGraphHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	var req models.CreateWorkspaceGraphReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	// Clone from registry template or an existing workspace graph when sourceTemplateId is set
	if req.SourceTemplateID != "" && req.GraphDef == nil {
		regTpl, errReg := h.store.GetTaskTemplate(r.Context(), req.SourceTemplateID)
		switch {
		case errReg == nil:
			req.GraphDef = regTpl.GraphDef
			req.StateSchema = regTpl.StateSchema
		case errors.Is(errReg, store.ErrNotFound):
			wsTpl, errWS := h.store.GetWorkspaceGraph(r.Context(), req.SourceTemplateID)
			if errWS == nil {
				req.GraphDef = wsTpl.GraphDef
				req.StateSchema = wsTpl.StateSchema
			} else if !errors.Is(errWS, store.ErrNotFound) {
				h.log.Error("get workspace graph for clone", "error", errWS)
				writeError(w, http.StatusInternalServerError, "internal error")
				return
			}
		default:
			h.log.Error("get task template for clone", "error", errReg)
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if len(req.GraphDef) == 0 {
			writeError(w, http.StatusBadRequest, "source template not found or has no graph definition")
			return
		}
	}

	g, err := h.store.CreateWorkspaceGraph(r.Context(), wsID, req)
	if err != nil {
		if store.IsUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a graph with this name already exists in this workspace")
			return
		}
		h.log.Error("create workspace graph", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.WorkspaceGraph]{Data: g})
}

func (h *WorkspaceGraphHandler) Update(w http.ResponseWriter, r *http.Request) {
	graphID := chi.URLParam(r, "graphId")
	var req models.UpdateWorkspaceGraphReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	g, err := h.store.UpdateWorkspaceGraph(r.Context(), graphID, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "graph not found")
			return
		}
		h.log.Error("update workspace graph", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.WorkspaceGraph]{Data: g})
}

func (h *WorkspaceGraphHandler) Delete(w http.ResponseWriter, r *http.Request) {
	graphID := chi.URLParam(r, "graphId")
	if err := h.store.DeleteWorkspaceGraph(r.Context(), graphID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "graph not found")
			return
		}
		h.log.Error("delete workspace graph", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[string]{Data: "deleted"})
}

func (h *WorkspaceGraphHandler) Activate(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	graphID := chi.URLParam(r, "graphId")
	if err := h.store.ActivateWorkspaceGraph(r.Context(), wsID, graphID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "graph not found")
			return
		}
		h.log.Error("activate workspace graph", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[string]{Data: "activated"})
}
