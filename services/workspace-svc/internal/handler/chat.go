package handler

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/service"
	"github.com/vibeos/workspace-svc/internal/store"
)

// ChatHandler handles conversation persistence, workspace lifecycle,
// and data management APIs.
type ChatHandler struct {
	store   store.Store
	log     *slog.Logger
	distill *service.DistillService
}

func NewChatHandler(s store.Store, log *slog.Logger) *ChatHandler {
	return &ChatHandler{
		store:   s,
		log:     log,
		distill: service.NewDistillService(s, log),
	}
}

// POST /api/workspaces/{wsId}/messages
func (h *ChatHandler) SaveMessage(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	var req models.SendMessageReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	agentType := req.AgentType
	if agentType == "" {
		agentType = "nlp"
	}

	sess, err := h.store.GetOrCreateChatSession(r.Context(), wsID, agentType)
	if err != nil {
		h.log.Error("get or create chat session", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	ctxType := req.ContextType
	if ctxType == "" {
		ctxType = "workspace"
	}

	msg := &models.ChatMessage{
		ID:          uuid.New().String(),
		SessionID:   &sess.ID,
		WorkspaceID: &wsID,
		ContextType: ctxType,
		Role:        req.Role,
		Content:     req.Content,
		AgentType:   nilIfEmpty(req.AgentType),
		CreatedAt:   time.Now(),
	}
	if req.RichBlocks != "" {
		msg.RichBlocks = &req.RichBlocks
	}
	if req.Segments != "" {
		msg.Segments = &req.Segments
	}
	msg.RequirementID = nilIfEmpty(req.RequirementID)
	msg.ExecutionID = nilIfEmpty(req.ExecutionID)

	if err := h.store.SaveChatMessage(r.Context(), msg); err != nil {
		h.log.Error("save chat message", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	go h.distill.CheckAndDistillMessages(context.Background(), wsID)

	writeJSON(w, http.StatusCreated, models.APIResponse[models.ChatMessage]{Data: *msg})
}

// GET /api/workspaces/{wsId}/messages?cursor=&limit=
func (h *ChatHandler) ListMessages(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	cursor := r.URL.Query().Get("cursor")
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}

	msgs, nextCursor, hasMore, err := h.store.ListChatMessages(r.Context(), wsID, cursor, limit)
	if err != nil {
		h.log.Error("list chat messages", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, models.CursorResponse[models.ChatMessage]{
		Data:    msgs,
		Cursor:  nextCursor,
		HasMore: hasMore,
	})
}

// POST /api/messages — save a home (global) message
func (h *ChatHandler) SaveGlobalMessage(w http.ResponseWriter, r *http.Request) {
	var req models.SendMessageReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	msg := &models.ChatMessage{
		ID:          uuid.New().String(),
		ContextType: "home",
		Role:        req.Role,
		Content:     req.Content,
		AgentType:   nilIfEmpty(req.AgentType),
		CreatedAt:   time.Now(),
	}
	if req.RichBlocks != "" {
		msg.RichBlocks = &req.RichBlocks
	}
	if req.Segments != "" {
		msg.Segments = &req.Segments
	}

	if err := h.store.SaveChatMessage(r.Context(), msg); err != nil {
		h.log.Error("save global message", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusCreated, models.APIResponse[models.ChatMessage]{Data: *msg})
}

// GET /api/messages?cursor=&limit= — list home (global) messages
func (h *ChatHandler) ListGlobalMessages(w http.ResponseWriter, r *http.Request) {
	cursor := r.URL.Query().Get("cursor")
	limit := 50
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 && v <= 100 {
			limit = v
		}
	}

	msgs, nextCursor, hasMore, err := h.store.ListGlobalMessages(r.Context(), cursor, limit)
	if err != nil {
		h.log.Error("list global messages", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, models.CursorResponse[models.ChatMessage]{
		Data:    msgs,
		Cursor:  nextCursor,
		HasMore: hasMore,
	})
}

// DELETE /api/workspaces/{wsId}/messages
func (h *ChatHandler) DeleteMessages(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	if err := h.store.DeleteWorkspaceMessages(r.Context(), wsID); err != nil {
		h.log.Error("delete workspace messages", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[string]{Data: "ok"})
}

// DELETE /api/messages
func (h *ChatHandler) DeleteGlobalMessages(w http.ResponseWriter, r *http.Request) {
	if err := h.store.DeleteGlobalMessages(r.Context()); err != nil {
		h.log.Error("delete global messages", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[string]{Data: "ok"})
}

// PATCH /api/workspaces/{wsId}/archive
func (h *ChatHandler) ArchiveWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	var req models.ArchiveWorkspaceReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}

	var err error
	switch req.Status {
	case "archived":
		err = h.store.ArchiveWorkspace(r.Context(), wsID)
	case "active":
		err = h.store.UnarchiveWorkspace(r.Context(), wsID)
	default:
		writeError(w, http.StatusBadRequest, "status must be 'archived' or 'active'")
		return
	}

	if err != nil {
		h.log.Error("archive workspace", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse[string]{Data: "ok"})
}

// GET /api/workspaces/{wsId}/artifacts/meta
func (h *ChatHandler) ListArtifactsMeta(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	meta, err := h.store.ListArtifactMetaByWorkspace(r.Context(), wsID)
	if err != nil {
		h.log.Error("list artifact meta", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse[[]models.ArtifactMeta]{Data: meta})
}

// GET /api/workspaces/{wsId}/summaries/conversations
func (h *ChatHandler) ListConversationSummaries(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	summaries, err := h.store.ListConversationSummaries(r.Context(), wsID)
	if err != nil {
		h.log.Error("list conversation summaries", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse[[]models.ConversationSummary]{Data: summaries})
}

// GET /api/workspaces/{wsId}/summaries/activities
func (h *ChatHandler) ListActivitySummaries(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")

	summaries, err := h.store.ListActivitySummaries(r.Context(), wsID)
	if err != nil {
		h.log.Error("list activity summaries", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse[[]models.ActivitySummary]{Data: summaries})
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

