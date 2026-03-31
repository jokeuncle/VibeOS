---
name: add-go-endpoint
description: Add a new REST API endpoint to workspace-svc following the layered architecture. Use when adding Go API routes, handlers, store methods, or new CRUD endpoints to workspace-svc.
---

# Add Go REST API Endpoint

## Workflow checklist

```
- [ ] Step 1: Define DTOs in shared models
- [ ] Step 2: Extend Store interface + implement SQL
- [ ] Step 3: Add Service method (if orchestration needed)
- [ ] Step 4: Create Handler
- [ ] Step 5: Register route in main.go
- [ ] Step 6: Add migration (if schema change needed)
```

## Step 1: Define DTOs

File: `services/shared/models/api.go` (or a focused file in that package)

```go
type CreateFooReq struct {
    Name        string `json:"name"`
    Description string `json:"description"`
}

type UpdateFooReq struct {
    Name        *string `json:"name,omitempty"`
    Description *string `json:"description,omitempty"`
}
```

If a new domain entity is needed, add the struct in `services/shared/models/workspace.go` with both `json` (camelCase) and `db` (snake_case) tags.

## Step 2: Extend Store

**Interface** — `services/workspace-svc/internal/store/postgres.go`: add methods to the `Store` interface.

```go
CreateFoo(ctx context.Context, foo *models.Foo) error
GetFoo(ctx context.Context, id string) (*models.Foo, error)
ListFoos(ctx context.Context, workspaceID string) ([]models.Foo, error)
```

**Implementation** — create or extend a file in `services/workspace-svc/internal/store/` (e.g. `foo.go`).

- Use `s.pool.QueryRow` / `s.pool.Query` with parameterized SQL
- Return `store.ErrNotFound` when `pgx.ErrNoRows`
- Use `uuid_generate_v4()` for new IDs in INSERT

## Step 3: Service method (optional)

Only needed when the handler requires orchestration (Redis events, activity logging, cross-entity logic). Add to `services/workspace-svc/internal/service/workspace.go` or a new focused file.

The service has access to `s.store`, `s.rdb` (Redis), and `s.log` (slog.Logger).

## Step 4: Create Handler

File: `services/workspace-svc/internal/handler/<domain>.go`

```go
type FooHandler struct {
    svc *service.Service   // or store.Store for simple CRUD
    log *slog.Logger
}

func NewFooHandler(svc *service.Service, log *slog.Logger) *FooHandler {
    return &FooHandler{svc: svc, log: log}
}

func (h *FooHandler) Create(w http.ResponseWriter, r *http.Request) {
    var req models.CreateFooReq
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeError(w, http.StatusBadRequest, "invalid request body")
        return
    }
    result, err := h.svc.CreateFoo(r.Context(), &req)
    if err != nil {
        h.log.Error("create foo failed", "error", err)
        writeError(w, http.StatusInternalServerError, "internal error")
        return
    }
    writeJSON(w, http.StatusCreated, models.APIResponse[*models.Foo]{Data: result})
}
```

Key patterns:
- URL params: `chi.URLParam(r, "wsId")`
- 404: `if errors.Is(err, store.ErrNotFound) { writeError(w, 404, "not found") }`
- Response: always `models.APIResponse[T]{Data: result}`

## Step 5: Register route

File: `services/workspace-svc/cmd/main.go`

1. Construct the handler: `fooHandler := handler.NewFooHandler(svc, logger)`
2. Add route inside the appropriate `r.Route(...)` block:

```go
// Inside r.Route("/{wsId}", ...) for workspace-scoped:
r.Get("/foos", fooHandler.List)
r.Post("/foos", fooHandler.Create)

// Or top-level for global endpoints:
r.Route("/api/foos", func(r chi.Router) { ... })
```

Use `r.With(mw.RequireAuth)` for auth-gated routes.

## Step 6: Migration (if needed)

See the `add-db-migration` skill for the full workflow. Quick summary:

1. Create `deploy/migrations/NNN_description.sql` with `IF NOT EXISTS` for idempotency
2. Append filename to `MIGRATIONS` array in `deploy/apply-migrations.sh`

## Post-creation checklist

- [ ] `go build ./...` compiles without errors
- [ ] Corresponding frontend API helper added in `apps/web/src/lib/api.ts`
- [ ] Vite proxy rule added if endpoint is on a new path prefix (in `apps/web/vite.config.ts`)
