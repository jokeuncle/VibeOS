package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/vibeos/workspace-svc/internal/handler"
	mw "github.com/vibeos/workspace-svc/internal/middleware"
	"github.com/vibeos/workspace-svc/internal/service"
	"github.com/vibeos/workspace-svc/internal/store"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	ctx := context.Background()

	// ---- Database --------------------------------------------------------
	dbURL := envOr("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/vibeos?sslmode=disable")
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	if err := pool.Ping(ctx); err != nil {
		logger.Error("failed to ping database", "error", err)
		os.Exit(1)
	}
	logger.Info("connected to database")

	// ---- Redis -----------------------------------------------------------
	redisURL := envOr("REDIS_URL", "redis://localhost:6379")
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		logger.Error("failed to parse redis URL", "error", err)
		os.Exit(1)
	}
	rdb := redis.NewClient(opt)
	if err := rdb.Ping(ctx).Err(); err != nil {
		logger.Warn("redis not available, events disabled", "error", err)
		rdb = nil
	} else {
		logger.Info("connected to redis")
	}

	// ---- Layers ----------------------------------------------------------
	st := store.NewPostgresStore(pool)
	svc := service.New(st, rdb, logger)

	wsHandler := handler.NewWorkspaceHandler(svc, logger)
	taskHandler := handler.NewTaskHandler(svc, logger)
	phaseHandler := handler.NewPhaseHandler(svc, logger)

	// ---- Router ----------------------------------------------------------
	r := chi.NewRouter()
	r.Use(mw.CORS)
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	r.Route("/api/workspaces", func(r chi.Router) {
		r.Get("/", wsHandler.List)
		r.Post("/", wsHandler.Create)

		r.Route("/{wsId}", func(r chi.Router) {
			r.Get("/", wsHandler.Get)
			r.Patch("/", wsHandler.Update)
			r.Delete("/", wsHandler.Delete)

			r.Get("/activities", wsHandler.ListActivities)

			r.Patch("/phases/{phaseId}/status", phaseHandler.UpdateStatus)

			r.Post("/phases/{phaseId}/tasks", taskHandler.Create)
			r.Put("/phases/{phaseId}/tasks/reorder", taskHandler.Reorder)

			r.Patch("/tasks/{taskId}", taskHandler.Update)
			r.Delete("/tasks/{taskId}", taskHandler.Delete)
		})
	})

	// ---- Start -----------------------------------------------------------
	port := envOr("PORT", "8010")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("workspace-svc starting", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown error", "error", err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
