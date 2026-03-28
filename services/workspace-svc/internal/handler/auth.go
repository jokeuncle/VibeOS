package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/middleware"
	"github.com/vibeos/workspace-svc/internal/service"
)

type AuthHandler struct {
	svc    *service.Service
	logger *slog.Logger
}

func NewAuthHandler(svc *service.Service, logger *slog.Logger) *AuthHandler {
	return &AuthHandler{svc: svc, logger: logger}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req models.RegisterReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse[any]{Error: "invalid request body"})
		return
	}
	if req.Email == "" || req.Password == "" {
		writeJSON(w, http.StatusBadRequest, models.APIResponse[any]{Error: "email and password are required"})
		return
	}

	user, err := h.svc.RegisterUser(r.Context(), req)
	if err != nil {
		h.logger.Error("register failed", "error", err)
		writeJSON(w, http.StatusConflict, models.APIResponse[any]{Error: err.Error()})
		return
	}

	token, err := middleware.GenerateToken(user.ID)
	if err != nil {
		h.logger.Error("token generation failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, models.APIResponse[any]{Error: "failed to generate token"})
		return
	}

	writeJSON(w, http.StatusCreated, models.APIResponse[models.AuthResponse]{
		Data: models.AuthResponse{Token: token, User: *user},
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req models.LoginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, models.APIResponse[any]{Error: "invalid request body"})
		return
	}

	user, err := h.svc.LoginUser(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse[any]{Error: "invalid email or password"})
		return
	}

	token, err := middleware.GenerateToken(user.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, models.APIResponse[any]{Error: "failed to generate token"})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse[models.AuthResponse]{
		Data: models.AuthResponse{Token: token, User: *user},
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetUserID(r.Context())
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, models.APIResponse[any]{Error: "not authenticated"})
		return
	}

	user, err := h.svc.GetUser(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, models.APIResponse[any]{Error: "user not found"})
		return
	}

	writeJSON(w, http.StatusOK, models.APIResponse[models.User]{Data: *user})
}
