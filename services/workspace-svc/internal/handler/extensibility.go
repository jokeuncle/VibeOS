package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/vibeos/shared/models"
	mw "github.com/vibeos/workspace-svc/internal/middleware"
	"github.com/vibeos/workspace-svc/internal/store"
)

// ExtensibilityHandler exposes CRUD for MCP servers, tool configs, skills,
// and user context preferences.
type ExtensibilityHandler struct {
	store store.Store
	log   *slog.Logger
}

func NewExtensibilityHandler(s store.Store, log *slog.Logger) *ExtensibilityHandler {
	return &ExtensibilityHandler{store: s, log: log}
}

// ---------------------------------------------------------------------------
// MCP Servers
// ---------------------------------------------------------------------------

func (h *ExtensibilityHandler) ListMCPServers(w http.ResponseWriter, r *http.Request) {
	wsID := ptrOrNil(r.URL.Query().Get("workspaceId"))
	entries, err := h.store.ListMCPServers(r.Context(), wsID)
	if err != nil {
		h.log.Error("list mcp_servers", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if entries == nil {
		entries = []models.MCPServer{}
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.MCPServer]{Data: entries})
}

func (h *ExtensibilityHandler) CreateMCPServer(w http.ResponseWriter, r *http.Request) {
	var req models.CreateMCPServerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" || req.Transport == "" {
		writeError(w, http.StatusBadRequest, "name and transport are required")
		return
	}
	m, err := h.store.CreateMCPServer(r.Context(), req)
	if err != nil {
		h.log.Error("create mcp_server", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.MCPServer]{Data: m})
}

func (h *ExtensibilityHandler) GetMCPServer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	m, err := h.store.GetMCPServer(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "mcp server not found")
			return
		}
		h.log.Error("get mcp_server", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.MCPServer]{Data: m})
}

func (h *ExtensibilityHandler) UpdateMCPServer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req models.UpdateMCPServerReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	m, err := h.store.UpdateMCPServer(r.Context(), id, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "mcp server not found")
			return
		}
		h.log.Error("update mcp_server", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.MCPServer]{Data: m})
}

func (h *ExtensibilityHandler) DeleteMCPServer(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.store.DeleteMCPServer(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "mcp server not found")
			return
		}
		h.log.Error("delete mcp_server", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[string]{Data: "deleted"})
}

// ---------------------------------------------------------------------------
// Tool Configs
// ---------------------------------------------------------------------------

func (h *ExtensibilityHandler) ListToolConfigs(w http.ResponseWriter, r *http.Request) {
	wsID := ptrOrNil(r.URL.Query().Get("workspaceId"))
	entries, err := h.store.ListToolConfigs(r.Context(), wsID)
	if err != nil {
		h.log.Error("list tool_configs", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if entries == nil {
		entries = []models.ToolConfig{}
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.ToolConfig]{Data: entries})
}

func (h *ExtensibilityHandler) CreateToolConfig(w http.ResponseWriter, r *http.Request) {
	var req models.CreateToolConfigReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	t, err := h.store.CreateToolConfig(r.Context(), req)
	if err != nil {
		h.log.Error("create tool_config", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.ToolConfig]{Data: t})
}

func (h *ExtensibilityHandler) DeleteToolConfig(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.store.DeleteToolConfig(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "tool config not found")
			return
		}
		h.log.Error("delete tool_config", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[string]{Data: "deleted"})
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

func (h *ExtensibilityHandler) ListSkills(w http.ResponseWriter, r *http.Request) {
	wsID := ptrOrNil(r.URL.Query().Get("workspaceId"))
	entries, err := h.store.ListSkills(r.Context(), wsID)
	if err != nil {
		h.log.Error("list skills", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if entries == nil {
		entries = []models.Skill{}
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.Skill]{Data: entries})
}

func (h *ExtensibilityHandler) CreateSkill(w http.ResponseWriter, r *http.Request) {
	var req models.CreateSkillReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	sk, err := h.store.CreateSkill(r.Context(), req)
	if err != nil {
		h.log.Error("create skill", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.Skill]{Data: sk})
}

func (h *ExtensibilityHandler) DeleteSkill(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.store.DeleteSkill(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "skill not found")
			return
		}
		h.log.Error("delete skill", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[string]{Data: "deleted"})
}

// ---------------------------------------------------------------------------
// User Contexts
// ---------------------------------------------------------------------------

func (h *ExtensibilityHandler) GetUserContext(w http.ResponseWriter, r *http.Request) {
	authedUser := mw.GetUserID(r.Context())
	userID := r.URL.Query().Get("userId")
	if userID == "" {
		userID = authedUser
	}
	if userID != authedUser && userID != "system" {
		writeError(w, http.StatusForbidden, "cannot access another user's context")
		return
	}
	wsID := ptrOrNil(r.URL.Query().Get("workspaceId"))
	uc, err := h.store.GetUserContext(r.Context(), userID, wsID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "user context not found")
			return
		}
		h.log.Error("get user_context", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.UserContext]{Data: uc})
}

func (h *ExtensibilityHandler) UpsertUserContext(w http.ResponseWriter, r *http.Request) {
	authedUser := mw.GetUserID(r.Context())
	var req models.UpsertUserContextReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.UserID == "" {
		req.UserID = authedUser
	}
	if req.UserID != authedUser && req.UserID != "system" {
		writeError(w, http.StatusForbidden, "cannot modify another user's context")
		return
	}
	uc, err := h.store.UpsertUserContext(r.Context(), req)
	if err != nil {
		h.log.Error("upsert user_context", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.UserContext]{Data: uc})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func ptrOrNil(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
