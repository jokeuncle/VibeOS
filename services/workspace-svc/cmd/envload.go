package main

import (
	"os"
	"path/filepath"
	"strings"
)

// loadEnvFromDotenvFiles fills missing env vars from the first readable dotenv file.
// Does not override variables already set in the process environment.
// Search order: $ENV_FILE, then ./deploy/.env, ../deploy/.env, ../../deploy/.env (relative to cwd).
func loadEnvFromDotenvFiles() {
	var paths []string
	if p := strings.TrimSpace(os.Getenv("ENV_FILE")); p != "" {
		paths = append(paths, p)
	}
	if wd, err := os.Getwd(); err == nil {
		paths = append(paths,
			filepath.Join(wd, "deploy", ".env"),
			filepath.Join(wd, "..", "deploy", ".env"),
			filepath.Join(wd, "..", "..", "deploy", ".env"),
		)
	}
	for _, p := range paths {
		if loadDotenvFile(p) {
			return
		}
	}
}

func loadDotenvFile(path string) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}
		i := strings.IndexByte(line, '=')
		if i <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:i])
		val := strings.TrimSpace(line[i+1:])
		if key == "" {
			continue
		}
		if len(val) >= 2 && val[0] == '"' && val[len(val)-1] == '"' {
			val = val[1 : len(val)-1]
		}
		if os.Getenv(key) == "" {
			_ = os.Setenv(key, val)
		}
	}
	return true
}
