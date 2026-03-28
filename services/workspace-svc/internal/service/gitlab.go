package service

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/google/uuid"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/store"
)

// ---------------------------------------------------------------------------
// Encryption helpers
// ---------------------------------------------------------------------------
// Key is taken from GITLAB_ENCRYPT_KEY env var (32 bytes base64-encoded).
// If not set, we fall back to a fixed dev key – NEVER use in production.

var encryptKey []byte

func init() {
	raw := os.Getenv("GITLAB_ENCRYPT_KEY")
	if raw != "" {
		b, err := base64.StdEncoding.DecodeString(raw)
		if err == nil && len(b) == 32 {
			encryptKey = b
			return
		}
	}
	// Dev fallback – deterministic, insecure, clearly labelled.
	encryptKey = []byte("vibeos-dev-key-UNSAFE-32b-------")
}

// encryptToken encrypts plaintext with AES-256-GCM and returns base64(nonce||ciphertext).
func encryptToken(plaintext string) (string, error) {
	block, err := aes.NewCipher(encryptKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ct := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ct), nil
}

// DecryptToken decrypts a value produced by encryptToken.
func DecryptToken(encoded string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}
	block, err := aes.NewCipher(encryptKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, ct := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}
	return string(plain), nil
}

// tokenHint extracts the last 4 characters of a token for safe UI display.
func tokenHint(token string) string {
	if len(token) <= 4 {
		return token
	}
	return token[len(token)-4:]
}

// ---------------------------------------------------------------------------
// GitLab credential service methods
// ---------------------------------------------------------------------------

func (s *Service) CreateGitLabCredential(ctx context.Context, req models.CreateGitLabCredentialReq) (*models.GitLabCredential, error) {
	enc, err := encryptToken(req.Token)
	if err != nil {
		return nil, fmt.Errorf("encrypt token: %w", err)
	}
	cred := &models.GitLabCredential{
		ID:        uuid.NewString(),
		GitLabURL: strings.TrimRight(req.GitLabURL, "/"),
		TokenEnc:  enc,
		TokenHint: tokenHint(req.Token),
		Label:     req.Label,
		CreatedBy: req.CreatedBy,
	}
	if err := s.store.CreateGitLabCredential(ctx, cred); err != nil {
		return nil, fmt.Errorf("store credential: %w", err)
	}
	return cred, nil
}

func (s *Service) ListGitLabCredentials(ctx context.Context) ([]models.GitLabCredential, error) {
	return s.store.ListGitLabCredentials(ctx)
}

func (s *Service) DeleteGitLabCredential(ctx context.Context, id string) error {
	return s.store.DeleteGitLabCredential(ctx, id)
}

// GetDecryptedToken fetches a credential and decrypts its token – for internal use only.
func (s *Service) GetDecryptedToken(ctx context.Context, credentialID string) (gitlabURL, token string, err error) {
	cred, err := s.store.GetGitLabCredential(ctx, credentialID)
	if err != nil {
		return "", "", err
	}
	tok, err := DecryptToken(cred.TokenEnc)
	if err != nil {
		return "", "", err
	}
	return cred.GitLabURL, tok, nil
}

// ---------------------------------------------------------------------------
// Workspace repo service methods
// ---------------------------------------------------------------------------

func (s *Service) CreateWorkspaceRepo(ctx context.Context, workspaceID string, req models.CreateWorkspaceRepoReq) (*models.WorkspaceRepo, error) {
	// Validate that the credential exists.
	cred, err := s.store.GetGitLabCredential(ctx, req.CredentialID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			return nil, fmt.Errorf("credential not found")
		}
		return nil, err
	}

	role := req.Role
	if role == "" {
		role = "primary"
	}
	bd := req.BranchDefault
	if bd == "" {
		bd = "main"
	}
	bs := req.BranchStrategy
	if bs == "" {
		bs = "feature"
	}

	repo := &models.WorkspaceRepo{
		ID:             uuid.NewString(),
		WorkspaceID:    workspaceID,
		CredentialID:   req.CredentialID,
		ProjectID:      req.ProjectID,
		ProjectName:    req.ProjectName,
		ProjectURL:     req.ProjectURL,
		GitLabURL:      cred.GitLabURL,
		Role:           role,
		IsPrimary:      req.IsPrimary,
		BranchDefault:  bd,
		BranchStrategy: bs,
		PhaseTypes:     req.PhaseTypes,
	}
	if repo.PhaseTypes == nil {
		repo.PhaseTypes = []string{}
	}

	if err := s.store.CreateWorkspaceRepo(ctx, repo); err != nil {
		return nil, fmt.Errorf("store repo: %w", err)
	}
	return repo, nil
}

func (s *Service) ListWorkspaceRepos(ctx context.Context, workspaceID string) ([]models.WorkspaceRepo, error) {
	return s.store.ListWorkspaceRepos(ctx, workspaceID)
}

func (s *Service) UpdateWorkspaceRepo(ctx context.Context, id string, req models.UpdateWorkspaceRepoReq) (*models.WorkspaceRepo, error) {
	return s.store.UpdateWorkspaceRepo(ctx, id, req)
}

func (s *Service) DeleteWorkspaceRepo(ctx context.Context, id string) error {
	return s.store.DeleteWorkspaceRepo(ctx, id)
}

func (s *Service) ListReposForPhase(ctx context.Context, workspaceID, phaseType string) ([]models.WorkspaceRepo, error) {
	return s.store.ListReposForPhase(ctx, workspaceID, phaseType)
}
