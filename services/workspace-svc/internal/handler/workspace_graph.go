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
	graphs, err := h.store.ListWorkspaceGraphs(r.Context(), wsID)
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
	g, err := h.store.GetActiveWorkspaceGraph(r.Context(), wsID)
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

	// Clone from global template if sourceTemplateId is provided
	if req.SourceTemplateID != "" && req.GraphDef == nil {
		tpl, err := h.store.GetWorkspaceGraph(r.Context(), req.SourceTemplateID)
		if err != nil {
			templates, tplErr := h.store.ListTaskTemplates(r.Context(), false)
			if tplErr == nil {
				for _, t := range templates {
					if t.ID == req.SourceTemplateID {
						req.GraphDef = t.GraphDef
						req.StateSchema = t.StateSchema
						break
					}
				}
			}
			if req.GraphDef == nil {
				h.log.Warn("source template not found for clone", "id", req.SourceTemplateID, "error", err)
			}
		} else {
			req.GraphDef = tpl.GraphDef
			req.StateSchema = tpl.StateSchema
		}
	}

	g, err := h.store.CreateWorkspaceGraph(r.Context(), wsID, req)
	if err != nil {
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
