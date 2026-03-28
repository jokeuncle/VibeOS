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

type ArtifactHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewArtifactHandler(svc *service.Service, log *slog.Logger) *ArtifactHandler {
	return &ArtifactHandler{svc: svc, log: log}
}

func (h *ArtifactHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	var req models.CreateArtifactReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == "" || req.Type == "" || req.AgentType == "" {
		writeError(w, http.StatusBadRequest, "title, type, and agentType are required")
		return
	}
	validAgents := map[string]bool{
		"requirement": true, "design": true, "architecture": true,
		"development": true, "testing": true, "cicd": true,
		"monitoring": true, "pm": true,
	}
	if !validAgents[req.AgentType] {
		writeError(w, http.StatusBadRequest, "invalid agentType")
		return
	}

	artifact, err := h.svc.CreateArtifact(r.Context(), wsID, req)
	if err != nil {
		h.log.Error("create artifact failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.Artifact]{Data: artifact})
}

func (h *ArtifactHandler) ListByWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	artifacts, err := h.svc.ListArtifactsByWorkspace(r.Context(), wsID)
	if err != nil {
		h.log.Error("list artifacts failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.Artifact]{Data: artifacts})
}

func (h *ArtifactHandler) ListByPhase(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	phaseID := chi.URLParam(r, "phaseId")

	artifacts, err := h.svc.ListArtifactsByPhase(r.Context(), wsID, phaseID)
	if err != nil {
		h.log.Error("list artifacts by phase failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.Artifact]{Data: artifacts})
}

func (h *ArtifactHandler) Get(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	id := chi.URLParam(r, "artifactId")

	artifact, err := h.svc.GetArtifact(r.Context(), wsID, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "artifact not found")
			return
		}
		h.log.Error("get artifact failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.Artifact]{Data: artifact})
}
