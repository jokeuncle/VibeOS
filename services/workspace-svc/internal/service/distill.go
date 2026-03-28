package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/vibeos/shared/models"
	"github.com/vibeos/workspace-svc/internal/store"
)

// DistillService manages background conversation summarisation.
// When message counts exceed the threshold it calls the LLM gateway
// to generate a summary and persists a ConversationSummary row.
type DistillService struct {
	store            store.Store
	log              *slog.Logger
	llmEndpoint      string
	client           *http.Client
	messageThreshold int
	inProgress       sync.Map // workspaceID → struct{}
}

func NewDistillService(s store.Store, log *slog.Logger) *DistillService {
	ep := os.Getenv("LLM_GATEWAY_URL")
	if ep == "" {
		ep = "http://localhost:8030"
	}
	threshold := 100
	if v := os.Getenv("DISTILL_MESSAGE_THRESHOLD"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			threshold = n
		}
	}
	return &DistillService{
		store:            s,
		log:              log,
		llmEndpoint:      ep,
		client:           &http.Client{Timeout: 120 * time.Second},
		messageThreshold: threshold,
	}
}

// CheckAndDistillMessages checks if the unsummarized message count for a
// workspace exceeds the threshold. If so, it triggers an async summarisation
// job. Concurrent runs for the same workspace are skipped via sync.Map.
func (d *DistillService) CheckAndDistillMessages(ctx context.Context, workspaceID string) {
	msgs, _, _, err := d.store.ListChatMessages(ctx, workspaceID, "", d.messageThreshold+1)
	if err != nil {
		d.log.Warn("distill check failed", "error", err)
		return
	}

	if len(msgs) <= d.messageThreshold {
		return
	}

	if _, loaded := d.inProgress.LoadOrStore(workspaceID, struct{}{}); loaded {
		return
	}

	go func() {
		defer d.inProgress.Delete(workspaceID)
		d.distillConversation(workspaceID, msgs)
	}()
}

func (d *DistillService) distillConversation(workspaceID string, msgs []models.ChatMessage) {
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	if len(msgs) < 2 {
		return
	}
	timeFrom := msgs[len(msgs)-1].CreatedAt
	timeTo := msgs[0].CreatedAt

	var conversation string
	for i := len(msgs) - 1; i >= 0; i-- {
		m := msgs[i]
		conversation += fmt.Sprintf("[%s] %s: %s\n", m.Role, ptrOrEmpty(m.AgentType), m.Content)
	}

	reqBody := map[string]any{
		"model": "default",
		"messages": []map[string]string{
			{
				"role":    "system",
				"content": "You are a conversation summariser. Given a conversation between users and AI agents, produce a JSON object with two fields: \"summary\" (a concise paragraph summarising the conversation) and \"key_decisions\" (an array of strings listing important decisions made). Respond with ONLY valid JSON, no markdown.",
			},
			{
				"role":    "user",
				"content": fmt.Sprintf("Summarise this conversation:\n\n%s", conversation),
			},
		},
		"temperature": 0.3,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		d.log.Warn("failed to marshal distill request", "error", err)
		return
	}

	resp, err := d.client.Post(
		d.llmEndpoint+"/chat/completions",
		"application/json",
		bytes.NewReader(jsonBody),
	)
	if err != nil {
		d.log.Warn("distill request failed", "error", err, "workspace", workspaceID)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		d.log.Warn("distill returned non-2xx", "status", resp.StatusCode, "body", string(respBody))
		return
	}

	var llmResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&llmResp); err != nil {
		d.log.Warn("distill response parse failed", "error", err)
		return
	}
	if len(llmResp.Choices) == 0 {
		d.log.Warn("distill returned empty choices")
		return
	}

	raw := llmResp.Choices[0].Message.Content
	var parsed struct {
		Summary      string   `json:"summary"`
		KeyDecisions []string `json:"key_decisions"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		parsed.Summary = raw
	}

	kdJSON, err := json.Marshal(parsed.KeyDecisions)
	if err != nil {
		kdJSON = []byte("[]")
	}

	summary := &models.ConversationSummary{
		ID:            uuid.New().String(),
		WorkspaceID:   workspaceID,
		Summary:       parsed.Summary,
		KeyDecisions:  string(kdJSON),
		TimeRangeFrom: timeFrom,
		TimeRangeTo:   timeTo,
		MessageCount:  len(msgs),
	}

	if err := d.store.SaveConversationSummary(ctx, summary); err != nil {
		d.log.Error("failed to save conversation summary", "error", err)
	} else {
		d.log.Info("conversation distilled", "workspace", workspaceID, "messages", len(msgs))
	}
}

func ptrOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
