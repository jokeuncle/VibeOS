package agentexec

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// Canonicalize strips the legacy "exec-" web prefix and ensures UUID syntax (RFC 4122).
func Canonicalize(raw string) (string, error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", fmt.Errorf("empty execution id")
	}
	if strings.HasPrefix(s, "exec-") {
		s = s[5:]
	}
	if _, err := uuid.Parse(s); err != nil {
		return "", fmt.Errorf("invalid execution id: %w", err)
	}
	return s, nil
}

// ForCreate returns the client id if it is a valid UUID (after strip), otherwise a new id.
func ForCreate(clientID string) string {
	if c, err := Canonicalize(clientID); err == nil {
		return c
	}
	return uuid.NewString()
}
