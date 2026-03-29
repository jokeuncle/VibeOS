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

type RequirementHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewRequirementHandler(svc *service.Service, log *slog.Logger) *RequirementHandler {
	return &RequirementHandler{svc: svc, log: log}
}

func (h *RequirementHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	reqs, err := h.svc.ListRequirements(r.Context(), wsID)
	if err != nil {
		h.log.Error("list requirements failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.Requirement]{Data: reqs})
}

func (h *RequirementHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	var req models.CreateRequirementReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}

	result, err := h.svc.CreateRequirement(r.Context(), wsID, req)
	if err != nil {
		h.log.Error("create requirement failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.Requirement]{Data: result})
}

func (h *RequirementHandler) Get(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	reqID := chi.URLParam(r, "reqId")

	result, err := h.svc.GetRequirement(r.Context(), wsID, reqID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "requirement not found")
			return
		}
		h.log.Error("get requirement failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.Requirement]{Data: result})
}

func (h *RequirementHandler) Update(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	reqID := chi.URLParam(r, "reqId")

	var req models.UpdateRequirementReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	result, err := h.svc.UpdateRequirement(r.Context(), wsID, reqID, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "requirement not found")
			return
		}
		h.log.Error("update requirement failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.Requirement]{Data: result})
}

func (h *RequirementHandler) Delete(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	reqID := chi.URLParam(r, "reqId")

	if err := h.svc.DeleteRequirement(r.Context(), wsID, reqID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "requirement not found")
			return
		}
		h.log.Error("delete requirement failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RequirementHandler) ResetPhase(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	reqID := chi.URLParam(r, "reqId")
	phaseType := chi.URLParam(r, "phaseType")

	if err := h.svc.ResetRequirementPhase(r.Context(), wsID, reqID, phaseType); err != nil {
		h.log.Error("reset requirement phase failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[string]{Data: "ok"})
}

func (h *RequirementHandler) AddRelation(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	reqID := chi.URLParam(r, "reqId")

	var req models.CreateRequirementRelationReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.TargetID == "" || req.RelationType == "" {
		writeError(w, http.StatusBadRequest, "targetId and relationType are required")
		return
	}

	rel, err := h.svc.CreateRequirementRelation(r.Context(), wsID, reqID, req)
	if err != nil {
		h.log.Error("create requirement relation failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.RequirementRelation]{Data: rel})
}

func (h *RequirementHandler) RemoveRelation(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	reqID := chi.URLParam(r, "reqId")
	relationID := chi.URLParam(r, "relationId")

	if err := h.svc.DeleteRequirementRelation(r.Context(), wsID, reqID, relationID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "relation not found")
			return
		}
		h.log.Error("delete requirement relation failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *RequirementHandler) GetRelatedArtifacts(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	reqID := chi.URLParam(r, "reqId")

	result, err := h.svc.GetRelatedRequirementArtifacts(r.Context(), wsID, reqID)
	if err != nil {
		h.log.Error("get related artifacts failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[map[string][]models.Artifact]{Data: result})
}
