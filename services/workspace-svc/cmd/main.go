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
	loadEnvFromDotenvFiles()

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
	if err := svc.EnsureEnvGitLabCredential(ctx); err != nil {
		logger.Error("sync global GitLab credential from env", "error", err)
	}

	wsHandler := handler.NewWorkspaceHandler(svc, logger)
	taskHandler := handler.NewTaskHandler(svc, logger)
	phaseHandler := handler.NewPhaseHandler(svc, logger)
	artifactHandler := handler.NewArtifactHandler(svc, logger)
	credHandler := handler.NewGitLabCredentialHandler(svc, logger)
	repoHandler := handler.NewWorkspaceRepoHandler(svc, logger)
	authHandler := handler.NewAuthHandler(svc, logger)
	memberHandler := handler.NewMemberHandler(svc, logger)
	chatHandler := handler.NewChatHandler(st, logger)
	agentHandler := handler.NewAgentHandler(svc, logger)
	feedbackHandler := handler.NewFeedbackHandler(svc, logger)
	summaryHandler := handler.NewSummaryHandler(svc, logger)
	reqHandler := handler.NewRequirementHandler(svc, logger)
	budgetHandler := handler.NewBudgetHandler(svc, logger)
	pipelineConfigHandler := handler.NewPipelineConfigHandler(svc, logger)
	execHandler := handler.NewExecutionHandler(svc, logger)
	registryHandler := handler.NewRegistryHandler(st, logger)
	wsGraphHandler := handler.NewWorkspaceGraphHandler(st, logger)
	graphSyncHandler := handler.NewGraphSyncHandler(svc, logger)
	extHandler := handler.NewExtensibilityHandler(st, logger)

	// ---- Router ----------------------------------------------------------
	r := chi.NewRouter()
	r.Use(mw.CORS)
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(mw.OptionalAuth)

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// Auth (public, no token required)
	r.Post("/api/auth/register", authHandler.Register)
	r.Post("/api/auth/login", authHandler.Login)
	r.With(mw.RequireAuth).Get("/api/auth/me", authHandler.Me)

	// Agent descriptor registration (global, called by agents at boot)
	r.Post("/api/agent-manifest", agentHandler.UpsertManifest)

	r.Route("/api/workspaces", func(r chi.Router) {
		r.Get("/", wsHandler.List)
		r.Post("/", wsHandler.Create)

		r.Route("/{wsId}", func(r chi.Router) {
			r.Get("/", wsHandler.Get)
			r.Patch("/", wsHandler.Update)
			r.Delete("/", wsHandler.Delete)

			r.Get("/activities", wsHandler.ListActivities)

			r.Post("/phases/reset", wsHandler.ResetPhasesPipeline)
			r.Patch("/phases/{phaseId}/status", phaseHandler.UpdateStatus)

			r.Post("/phases/{phaseId}/tasks", taskHandler.Create)
			r.Put("/phases/{phaseId}/tasks/reorder", taskHandler.Reorder)

			r.Patch("/tasks/{taskId}", taskHandler.Update)
			r.Post("/tasks/{taskId}/claim", taskHandler.Claim)
			r.Delete("/tasks/{taskId}", taskHandler.Delete)

			r.Get("/artifacts", artifactHandler.ListByWorkspace)
			r.Post("/artifacts", artifactHandler.Create)
			r.Put("/artifacts", artifactHandler.Upsert)
			r.Get("/artifacts/meta", chatHandler.ListArtifactsMeta)
			r.Get("/artifacts/{artifactId}", artifactHandler.Get)
			r.Get("/executions/{execId}/artifacts", artifactHandler.ListByExecution)

			// GitLab repo bindings
			r.Get("/repos", repoHandler.List)
			r.Post("/repos", repoHandler.Create)
			r.Patch("/repos/{repoId}", repoHandler.Update)
			r.Delete("/repos/{repoId}", repoHandler.Delete)
			r.Post("/repos/{repoId}/test", repoHandler.TestConnection)

			// Workspace membership
			r.Get("/members", memberHandler.List)
			r.With(mw.RequireAuth).Post("/members", memberHandler.Add)
			r.With(mw.RequireAuth).Delete("/members/{memberId}", memberHandler.Remove)

			// Chat message persistence (cursor-paginated)
			r.Get("/messages", chatHandler.ListMessages)
			r.Post("/messages", chatHandler.SaveMessage)
			r.Delete("/messages", chatHandler.DeleteMessages)

			// Workspace lifecycle (archive/unarchive)
			r.Patch("/archive", chatHandler.ArchiveWorkspace)

			// AI-generated summaries (conversation + activity)
			r.Get("/summaries/conversations", chatHandler.ListConversationSummaries)
			r.Post("/summaries/conversations", summaryHandler.CreateConversationSummary)
			r.Get("/summaries/activities", chatHandler.ListActivitySummaries)
			r.Post("/summaries/activities", summaryHandler.CreateActivitySummary)

			// Agents (per-workspace roster + config)
			r.Get("/agents", agentHandler.List)
			r.Get("/agent-profiles", agentHandler.ListProfiles)
			r.Post("/agents", agentHandler.Create)
			r.Patch("/agents/{agentId}", agentHandler.Update)
			r.Delete("/agents/{agentId}", agentHandler.Delete)

			// Budget & usage
			r.Get("/budget", budgetHandler.Get)
			r.Patch("/budget", budgetHandler.Update)

			// Pipeline phase configuration
			r.Get("/pipeline", pipelineConfigHandler.Get)
			r.Patch("/pipeline", pipelineConfigHandler.Update)

			// Agent executions
			r.Get("/executions", execHandler.List)
			r.Post("/executions", execHandler.Create)
			r.Get("/executions/{execId}", execHandler.Get)
			r.Patch("/executions/{execId}", execHandler.Update)

			// Feedback signals
			r.Post("/feedback", feedbackHandler.Create)
			r.Get("/feedback", feedbackHandler.List)

			// Requirements
			r.Route("/requirements", func(r chi.Router) {
				r.Get("/", reqHandler.List)
				r.Post("/", reqHandler.Create)
				r.Route("/{reqId}", func(r chi.Router) {
					r.Get("/", reqHandler.Get)
					r.Patch("/", reqHandler.Update)
					r.Delete("/", reqHandler.Delete)
					r.Post("/phases/{phaseType}/reset", reqHandler.ResetPhase)
					r.Post("/relations", reqHandler.AddRelation)
					r.Delete("/relations/{relationId}", reqHandler.RemoveRelation)
					r.Get("/related-artifacts", reqHandler.GetRelatedArtifacts)
				})
			})

			// Workspace graphs (custom workflow definitions)
			r.Route("/graphs", func(r chi.Router) {
				r.Get("/", wsGraphHandler.List)
				r.Post("/", wsGraphHandler.Create)
				r.Get("/active", wsGraphHandler.GetActive)
				r.Route("/{graphId}", func(r chi.Router) {
					r.Get("/", wsGraphHandler.Get)
					r.Put("/", wsGraphHandler.Update)
					r.Delete("/", wsGraphHandler.Delete)
					r.Post("/activate", wsGraphHandler.Activate)
					r.Post("/sync-tasks", graphSyncHandler.SyncTasks)
				})
			})
		})
	})

	// Default graph definitions (phase-type keyed, static)
	r.Get("/api/default-graphs/{phaseType}", graphSyncHandler.GetDefaultGraph)

	// Global (home) messages — not workspace-scoped
	r.Get("/api/messages", chatHandler.ListGlobalMessages)
	r.Post("/api/messages", chatHandler.SaveGlobalMessage)
	r.Delete("/api/messages", chatHandler.DeleteGlobalMessages)

	// Global registry: intents, task templates, capabilities
	r.Route("/api/registry", func(r chi.Router) {
		r.Get("/intents", registryHandler.ListIntents)
		r.Post("/intents", registryHandler.UpsertIntent)
		r.Get("/intents/{name}", registryHandler.GetIntent)
		r.Delete("/intents/{name}", registryHandler.DeleteIntent)

		r.Get("/templates", registryHandler.ListTaskTemplates)
		r.Get("/templates/resolve", registryHandler.ResolveTaskTemplate)
		r.Post("/templates", registryHandler.CreateTaskTemplate)
		r.Delete("/templates/{id}", registryHandler.DeleteTaskTemplate)

		r.Get("/capabilities", registryHandler.ListCapabilities)
		r.Post("/capabilities", registryHandler.UpsertCapability)
		r.Post("/capabilities/heartbeat", registryHandler.Heartbeat)
		r.Delete("/capabilities/{name}", registryHandler.DeleteCapability)

		r.Post("/manifest", registryHandler.RegisterManifest)
	})

	// Extensibility: MCP servers, tool configs, skills, user contexts
	r.Route("/api/ext", func(r chi.Router) {
		r.Use(mw.RequireAuth)
		r.Get("/mcp-servers", extHandler.ListMCPServers)
		r.Post("/mcp-servers", extHandler.CreateMCPServer)
		r.Get("/mcp-servers/{id}", extHandler.GetMCPServer)
		r.Put("/mcp-servers/{id}", extHandler.UpdateMCPServer)
		r.Delete("/mcp-servers/{id}", extHandler.DeleteMCPServer)

		r.Get("/tool-configs", extHandler.ListToolConfigs)
		r.Post("/tool-configs", extHandler.CreateToolConfig)
		r.Delete("/tool-configs/{id}", extHandler.DeleteToolConfig)

		r.Get("/skills", extHandler.ListSkills)
		r.Post("/skills", extHandler.CreateSkill)
		r.Delete("/skills/{id}", extHandler.DeleteSkill)

		r.Get("/user-context", extHandler.GetUserContext)
		r.Post("/user-context", extHandler.UpsertUserContext)
	})

	// GitLab credentials (admin-level, not per-workspace)
	r.Route("/api/gitlab/credentials", func(r chi.Router) {
		r.Get("/", credHandler.List)
		r.Post("/", credHandler.Create)
		r.Delete("/{credId}", credHandler.Delete)
		r.Get("/{credId}/decrypt", credHandler.Decrypt)
		r.Get("/{credId}/projects", credHandler.SearchProjects)
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
