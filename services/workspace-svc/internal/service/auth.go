package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/store"
	"golang.org/x/crypto/bcrypt"
)

func (s *Service) RegisterUser(ctx context.Context, req models.RegisterReq) (*models.User, error) {
	existing, _ := s.store.GetUserByEmail(ctx, req.Email)
	if existing != nil {
		return nil, fmt.Errorf("email already registered")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	user := &models.User{
		ID:           uuid.New().String(),
		Email:        req.Email,
		Name:         req.Name,
		PasswordHash: string(hash),
		Status:       "active",
	}
	if user.Name == "" {
		user.Name = req.Email
	}

	if err := s.store.CreateUser(ctx, user); err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return s.store.GetUser(ctx, user.ID)
}

func (s *Service) LoginUser(ctx context.Context, req models.LoginReq) (*models.User, error) {
	user, err := s.store.GetUserByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, fmt.Errorf("invalid credentials")
		}
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	return user, nil
}

func (s *Service) GetUser(ctx context.Context, id string) (*models.User, error) {
	return s.store.GetUser(ctx, id)
}

func (s *Service) ListMembers(ctx context.Context, workspaceID string) ([]models.WorkspaceMember, error) {
	return s.store.ListMembers(ctx, workspaceID)
}

func (s *Service) AddMember(ctx context.Context, workspaceID, requesterID string, req models.AddMemberReq) (*models.WorkspaceMember, error) {
	if requesterID != "" {
		requester, err := s.store.GetMemberByUserAndWorkspace(ctx, requesterID, workspaceID)
		if err != nil || requester.Role != "owner" {
			return nil, fmt.Errorf("only workspace owners can add members")
		}
	}

	targetUser, err := s.store.GetUserByEmail(ctx, req.Email)
	if err != nil {
		return nil, fmt.Errorf("user with email %s not found", req.Email)
	}

	role := req.Role
	if role == "" {
		role = "editor"
	}

	member := &models.WorkspaceMember{
		ID:          uuid.New().String(),
		WorkspaceID: workspaceID,
		UserID:      targetUser.ID,
		Role:        role,
	}

	if err := s.store.AddMember(ctx, member); err != nil {
		return nil, fmt.Errorf("failed to add member: %w", err)
	}

	members, err := s.store.ListMembers(ctx, workspaceID)
	if err != nil {
		return member, nil
	}
	for _, m := range members {
		if m.ID == member.ID {
			return &m, nil
		}
	}
	return member, nil
}

func (s *Service) RemoveMember(ctx context.Context, workspaceID, memberID, requesterID string) error {
	if requesterID != "" {
		requester, err := s.store.GetMemberByUserAndWorkspace(ctx, requesterID, workspaceID)
		if err != nil || requester.Role != "owner" {
			return fmt.Errorf("only workspace owners can remove members")
		}
	}
	return s.store.RemoveMember(ctx, memberID)
}
