package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/service"
	"github.com/vibeos/workspace-svc/internal/store"
)

// ---------------------------------------------------------------------------
// GitLabCredentialHandler
// ---------------------------------------------------------------------------

type GitLabCredentialHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewGitLabCredentialHandler(svc *service.Service, log *slog.Logger) *GitLabCredentialHandler {
	return &GitLabCredentialHandler{svc: svc, log: log}
}

func (h *GitLabCredentialHandler) List(w http.ResponseWriter, r *http.Request) {
	creds, err := h.svc.ListGitLabCredentials(r.Context())
	if err != nil {
		h.log.Error("list credentials", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.GitLabCredential]{Data: creds})
}

func (h *GitLabCredentialHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateGitLabCredentialReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.GitLabURL == "" || req.Token == "" {
		writeError(w, http.StatusBadRequest, "gitlabUrl and token are required")
		return
	}
	cred, err := h.svc.CreateGitLabCredential(r.Context(), req)
	if err != nil {
		h.log.Error("create credential", "error", err)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.GitLabCredential]{Data: cred})
}

func (h *GitLabCredentialHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "credId")
	if err := h.svc.DeleteGitLabCredential(r.Context(), id); err != nil {
		h.log.Error("delete credential", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// SearchProjects proxies a project search to the GitLab instance identified by credId.
func (h *GitLabCredentialHandler) SearchProjects(w http.ResponseWriter, r *http.Request) {
	credID := chi.URLParam(r, "credId")
	search := r.URL.Query().Get("search")

	results, err := h.svc.SearchGitLabProjects(r.Context(), credID, search)
	if err != nil {
		h.log.Error("search gitlab projects", "error", err)
		writeError(w, http.StatusBadGateway, "gitlab search failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.GitLabProjectResult]{Data: results})
}

// Decrypt returns the decrypted token for internal service-to-service use.
// This endpoint should be network-restricted in production (e.g. only reachable by agents).
func (h *GitLabCredentialHandler) Decrypt(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "credId")
	gitlabURL, token, err := h.svc.GetDecryptedToken(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "credential not found")
			return
		}
		h.log.Error("decrypt credential", "error", err)
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	type decryptResp struct {
		GitLabURL string `json:"gitlabUrl"`
		Token     string `json:"token"`
	}
	writeJSON(w, http.StatusOK, models.APIResponse[decryptResp]{
		Data: decryptResp{GitLabURL: gitlabURL, Token: token},
	})
}

// ---------------------------------------------------------------------------
// WorkspaceRepoHandler
// ---------------------------------------------------------------------------

type WorkspaceRepoHandler struct {
	svc *service.Service
	log *slog.Logger
}

func NewWorkspaceRepoHandler(svc *service.Service, log *slog.Logger) *WorkspaceRepoHandler {
	return &WorkspaceRepoHandler{svc: svc, log: log}
}

func (h *WorkspaceRepoHandler) List(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	repos, err := h.svc.ListWorkspaceRepos(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[[]models.WorkspaceRepo]{Data: repos})
}

func (h *WorkspaceRepoHandler) Create(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	var req models.CreateWorkspaceRepoReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.CredentialID == "" || req.ProjectID == "" || req.ProjectName == "" {
		writeError(w, http.StatusBadRequest, "credentialId, projectId, projectName are required")
		return
	}
	repo, err := h.svc.CreateWorkspaceRepo(r.Context(), wsID, req)
	if err != nil {
		h.log.Error("create repo", "error", err)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, models.APIResponse[*models.WorkspaceRepo]{Data: repo})
}

func (h *WorkspaceRepoHandler) Update(w http.ResponseWriter, r *http.Request) {
	repoID := chi.URLParam(r, "repoId")
	var req models.UpdateWorkspaceRepoReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	repo, err := h.svc.UpdateWorkspaceRepo(r.Context(), repoID, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "repo not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, models.APIResponse[*models.WorkspaceRepo]{Data: repo})
}

func (h *WorkspaceRepoHandler) Delete(w http.ResponseWriter, r *http.Request) {
	repoID := chi.URLParam(r, "repoId")
	if err := h.svc.DeleteWorkspaceRepo(r.Context(), repoID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// TestConnection validates credentials+project access and returns project metadata.
func (h *WorkspaceRepoHandler) TestConnection(w http.ResponseWriter, r *http.Request) {
	wsID := chi.URLParam(r, "wsId")
	repoID := chi.URLParam(r, "repoId")

	repos, err := h.svc.ListWorkspaceRepos(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	var target *models.WorkspaceRepo
	for i := range repos {
		if repos[i].ID == repoID {
			target = &repos[i]
			break
		}
	}
	if target == nil {
		writeError(w, http.StatusNotFound, "repo not found")
		return
	}

	_, token, err := h.svc.GetDecryptedToken(r.Context(), target.CredentialID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not decrypt token")
		return
	}

	// URL-encode the project ID so that namespace paths (e.g. "group/project") are valid.
	encodedProjectID := url.PathEscape(strings.TrimPrefix(target.ProjectID, "/"))
	apiURL := strings.TrimRight(target.GitLabURL, "/") + "/api/v4/projects/" + encodedProjectID

	req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, apiURL, nil)
	if err != nil {
		writeJSON(w, http.StatusOK, models.TestRepoConnectionResp{OK: false, Message: "failed to build request: " + err.Error()})
		return
	}
	req.Header.Set("PRIVATE-TOKEN", token)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		writeJSON(w, http.StatusOK, models.TestRepoConnectionResp{OK: false, Message: "connection failed: " + err.Error()})
		return
	}
	defer func() {
		io.Copy(io.Discard, resp.Body) //nolint:errcheck
		resp.Body.Close()
	}()

	if resp.StatusCode >= 400 {
		writeJSON(w, http.StatusOK, models.TestRepoConnectionResp{OK: false, Message: resp.Status})
		return
	}
	writeJSON(w, http.StatusOK, models.TestRepoConnectionResp{
		OK:          true,
		ProjectName: target.ProjectName,
		Message:     "connection successful",
	})
}
