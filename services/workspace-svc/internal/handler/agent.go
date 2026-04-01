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

type AgentHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewAgentHandler(svc *service.Service, log *slog.Logger) *AgentHandler {
	return &AgentHandler{svc: svc, log: log}
}

func (h *AgentHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	agents, err := h.svc.ListAgents(r.Context(), wsID)
	if err != nil {
		h.log.Error("list agents failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.Agent]{Data: agents})
}

func (h *AgentHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	var req models.CreateAgentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Type == "" {
		writeError(w, http.StatusBadRequest, "type is required")
		return
	}
	agent, err := h.svc.CreateAgent(r.Context(), wsID, req)
	if err != nil {
		if errors.Is(err, service.ErrInvalidAgentType) {
			writeError(w, http.StatusBadRequest, "invalid agent type")
			return
		}
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "workspace not found")
			return
		}
		h.log.Error("create agent failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.Agent]{Data: agent})
}

func (h *AgentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	agentID := chi.URLParam(r, "agentId")
	err := h.svc.DeleteAgent(r.Context(), wsID, agentID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "agent not found")
			return
		}
		h.log.Error("delete agent failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AgentHandler) Update(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	agentID := chi.URLParam(r, "agentId")

	var req models.UpdateAgentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	agent, err := h.svc.UpdateAgent(r.Context(), wsID, agentID, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "agent not found")
			return
		}
		h.log.Error("update agent failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.Agent]{Data: agent})
}

// ListProfiles returns agents enriched with the bound graph name.
func (h *AgentHandler) ListProfiles(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	profiles, err := h.svc.ListAgentProfiles(r.Context(), wsID)
	if err != nil {
		h.log.Error("list agent profiles failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.AgentProfile]{Data: profiles})
}

// UpsertManifest merges code-level agent defaults (system prompt, tools,
// capabilities) into every workspace's agent row of the matching type.
func (h *AgentHandler) UpsertManifest(w http.ResponseWriter, r *http.Request) {
	var req models.UpsertManifestReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AgentType == "" {
		writeError(w, http.StatusBadRequest, "agentType is required")
		return
	}

	if err := h.svc.UpsertManifest(r.Context(), req); err != nil {
		h.log.Error("upsert manifest failed", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[string]{Data: "ok"})
}
