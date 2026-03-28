package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/middleware"
	"github.com/vibeos/workspace-svc/internal/service"
)

type MemberHandler struct {
	svc    *service.Service
	logger *slog.Logger
}

func NewMemberHandler(svc *service.Service, logger *slog.Logger) *MemberHandler {
	return &MemberHandler{svc: svc, logger: logger}
}

func (h *MemberHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	members, err := h.svc.ListMembers(r.Context(), wsID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.APIResponse[any]{Error: err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.WorkspaceMember]{Data: members})
}

func (h *MemberHandler) Add(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	userID := middleware.GetUserID(r.Context())

	var req models.AddMemberReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse[any]{Error: "invalid request body"})
		return
	}

	member, err := h.svc.AddMember(r.Context(), wsID, userID, req)
	if err != nil {
		h.logger.Error("add member failed", "error", err)
		writeJSON(w, http.StatusBadRequest, models.APIResponse[any]{Error: err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, models.APIResponse[models.WorkspaceMember]{Data: *member})
}

func (h *MemberHandler) Remove(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	memberID := chi.URLParam(r, "memberId")
	userID := middleware.GetUserID(r.Context())

	if err := h.svc.RemoveMember(r.Context(), wsID, memberID, userID); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse[any]{Error: err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
