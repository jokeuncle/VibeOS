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

type RegistryHandler struct {
	store store.Store
	log   *slog.Logger
}

func NewRegistryHandler(s store.Store, log *slog.Logger) *RegistryHandler {
	return &RegistryHandler{store: s, log: log}
}

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------

func (h *RegistryHandler) ListIntents(w http.ResponseWriter, r *http.Request) {
	enabledOnly := r.URL.Query().Get("enabled") != "false"
	entries, err := h.store.ListIntents(r.Context(), enabledOnly)
	if err != nil {
		h.log.Error("list intents", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if entries == nil {
		entries = []models.IntentRegistryEntry{}
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.IntentRegistryEntry]{Data: entries})
}

func (h *RegistryHandler) GetIntent(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	entry, err := h.store.GetIntent(r.Context(), name)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "intent not found")
			return
		}
		h.log.Error("get intent", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.IntentRegistryEntry]{Data: entry})
}

func (h *RegistryHandler) UpsertIntent(w http.ResponseWriter, r *http.Request) {
	var req models.CreateIntentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	entry, err := h.store.UpsertIntent(r.Context(), req)
	if err != nil {
		h.log.Error("upsert intent", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.IntentRegistryEntry]{Data: entry})
}

func (h *RegistryHandler) DeleteIntent(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := h.store.DeleteIntent(r.Context(), name); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "intent not found")
			return
		}
		h.log.Error("delete intent", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[any]{Data: "deleted"})
}

// ---------------------------------------------------------------------------
// Task Templates
// ---------------------------------------------------------------------------

func (h *RegistryHandler) ListTaskTemplates(w http.ResponseWriter, r *http.Request) {
	enabledOnly := r.URL.Query().Get("enabled") != "false"
	entries, err := h.store.ListTaskTemplates(r.Context(), enabledOnly)
	if err != nil {
		h.log.Error("list task templates", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if entries == nil {
		entries = []models.TaskTemplateEntry{}
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.TaskTemplateEntry]{Data: entries})
}

func (h *RegistryHandler) ResolveTaskTemplate(w http.ResponseWriter, r *http.Request) {
	intent := r.URL.Query().Get("intent")
	ctxScope := r.URL.Query().Get("context")
	if intent == "" {
		writeError(w, http.StatusBadRequest, "intent query param required")
		return
	}
	if ctxScope == "" {
		ctxScope = "*"
	}
	entry, err := h.store.ResolveTaskTemplate(r.Context(), intent, ctxScope)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "no matching template")
			return
		}
		h.log.Error("resolve task template", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.TaskTemplateEntry]{Data: entry})
}

func (h *RegistryHandler) CreateTaskTemplate(w http.ResponseWriter, r *http.Request) {
	var req models.CreateTaskTemplateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.IntentPattern == "" {
		writeError(w, http.StatusBadRequest, "intentPattern is required")
		return
	}
	entry, err := h.store.UpsertTaskTemplate(r.Context(), req)
	if err != nil {
		h.log.Error("create task template", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.TaskTemplateEntry]{Data: entry})
}

func (h *RegistryHandler) DeleteTaskTemplate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.store.DeleteTaskTemplate(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "template not found")
			return
		}
		h.log.Error("delete task template", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[any]{Data: "deleted"})
}

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

func (h *RegistryHandler) ListCapabilities(w http.ResponseWriter, r *http.Request) {
	enabledOnly := r.URL.Query().Get("enabled") != "false"
	provider := r.URL.Query().Get("provider")
	sourceType := r.URL.Query().Get("source_type")
	workspaceID := r.URL.Query().Get("workspace_id")

	var entries []models.CapabilityEntry
	var err error
	if sourceType != "" || workspaceID != "" {
		entries, err = h.store.ListCapabilitiesFiltered(r.Context(), sourceType, workspaceID)
	} else if provider != "" {
		entries, err = h.store.ListCapabilitiesByProvider(r.Context(), provider)
	} else {
		entries, err = h.store.ListCapabilities(r.Context(), enabledOnly)
	}
	if err != nil {
		h.log.Error("list capabilities", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if entries == nil {
		entries = []models.CapabilityEntry{}
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.CapabilityEntry]{Data: entries})
}

func (h *RegistryHandler) UpsertCapability(w http.ResponseWriter, r *http.Request) {
	var req models.CreateCapabilityReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" || req.Provider == "" {
		writeError(w, http.StatusBadRequest, "name and provider are required")
		return
	}
	entry, err := h.store.UpsertCapability(r.Context(), req)
	if err != nil {
		h.log.Error("upsert capability", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.CapabilityEntry]{Data: entry})
}

func (h *RegistryHandler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name     string `json:"name"`
		Provider string `json:"provider"`
		Health   string `json:"health"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Health == "" {
		req.Health = "healthy"
	}
	if err := h.store.UpdateCapabilityHealth(r.Context(), req.Name, req.Provider, req.Health); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "capability not found")
			return
		}
		h.log.Error("heartbeat", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[any]{Data: "ok"})
}

func (h *RegistryHandler) DeleteCapability(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	provider := r.URL.Query().Get("provider")
	if provider == "" {
		writeError(w, http.StatusBadRequest, "provider query param required")
		return
	}
	if err := h.store.DeleteCapability(r.Context(), name, provider); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "capability not found")
			return
		}
		h.log.Error("delete capability", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[any]{Data: "deleted"})
}

// ---------------------------------------------------------------------------
// Bulk manifest registration
// ---------------------------------------------------------------------------

func (h *RegistryHandler) RegisterManifest(w http.ResponseWriter, r *http.Request) {
	var req models.AgentManifestReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.AgentType == "" {
		writeError(w, http.StatusBadRequest, "agentType is required")
		return
	}

	src := req.Source
	if src == "" {
		src = req.AgentType
	}

	ctx := r.Context()
	var results struct {
		Intents      int `json:"intents"`
		Templates    int `json:"templates"`
		Capabilities int `json:"capabilities"`
	}

	for _, ir := range req.Intents {
		ir.Source = src
		if _, err := h.store.UpsertIntent(ctx, ir); err != nil {
			h.log.Error("manifest upsert intent", "name", ir.Name, "error", err)
			continue
		}
		results.Intents++
	}

	for _, tr := range req.Templates {
		tr.Source = src
		if _, err := h.store.UpsertTaskTemplate(ctx, tr); err != nil {
			h.log.Error("manifest upsert template", "pattern", tr.IntentPattern, "error", err)
			continue
		}
		results.Templates++
	}

	for _, cr := range req.Capabilities {
		if cr.Provider == "" {
			cr.Provider = req.AgentType
		}
		cr.Source = src
		if _, err := h.store.UpsertCapability(ctx, cr); err != nil {
			h.log.Error("manifest upsert capability", "name", cr.Name, "error", err)
			continue
		}
		results.Capabilities++
	}

	writeJSON(w, http.StatusOK, models.APIResponse[any]{Data: results})
}
