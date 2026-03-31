---
name: add-ws-event
description: Add a new WebSocket event type across the Go, Python, and TypeScript layers. Use when adding real-time push events from backend to frontend via ws-gateway.
---

# Add WebSocket Event Type

WebSocket events flow: **Python agent/workflow** → Redis `vibeos:events` → **ws-gateway (Go)** → **browser (TypeScript)**. Adding a new event type touches all three layers.

## Workflow checklist

```
- [ ] Step 1: Define event constant in Go shared models
- [ ] Step 2: Publish from Python (agent or workflow)
- [ ] Step 3: Handle in frontend ws.ts
- [ ] Step 4: Update store with event data
- [ ] Step 5: Document in project-overview rule
```

## Step 1: Go event constant

File: `services/shared/models/api.go`

Add a constant following the existing naming convention:

```go
const (
    // ... existing constants ...
    WSEventMyNewEvent = "my_domain:action"
)
```

Convention: `category:action` format (e.g. `agent:status`, `task:start`, `chat:message`).

The ws-gateway does not filter events — it broadcasts all `vibeos:events` messages to the matching workspace. So no changes needed in `services/ws-gateway/`.

## Step 2: Publish from Python

Events are published via `WSGatewayClient.publish()` in the shared SDK. Typical patterns:

**From an agent** (via `self.ws`):

```python
await self.ws.publish(
    workspace_id=task.workspace_id,
    event_type="my_domain:action",
    payload={"key": "value"},
)
```

**From pm-agent workflow** (via `self.ws_client`):

```python
await self.ws_client.publish(
    workspace_id=workspace_id,
    event_type="my_domain:action",
    payload=data,
)
```

The `WSGatewayClient` POSTs to ws-gateway's `/api/publish` which publishes to Redis.

## Step 3: Handle in frontend

File: `apps/web/src/lib/ws.ts`

Add a branch in `handleWSEvent()`:

```typescript
if (eventType === 'my_domain:action' && event.workspaceId === activeWsId) {
  // Update store or trigger UI
  store.handleMyEvent(event.payload)
}
```

Key patterns from existing handlers:
- Always check `event.workspaceId === activeWsId` for workspace-scoped events
- Check `sid && activeSids.has(sid)` dedup is already handled at the top of the function
- For structural changes, trigger `debouncedRefresh()` to reload workspace data

## Step 4: Update store

Add the handler method to the appropriate Zustand slice in `apps/web/src/stores/workspace/slices/`. For example, in `coreSlice.ts`:

```typescript
handleMyEvent: (payload: Record<string, any>) => {
  set(state => ({
    // ... update relevant state ...
  }))
},
```

Don't forget to add the method signature to `WorkspaceState` in `apps/web/src/stores/workspace/types.ts`.

## Step 5: Document

File: `.cursor/rules/project-overview.mdc`

Add the new event to the WebSocket Event Types section under the appropriate category (Go constants or Python workflow events).

## Event payload conventions

- Always include `workspaceId` at the top level
- Use camelCase for payload keys (frontend convention)
- Keep payloads small — send IDs and let the frontend fetch details if needed
- For status changes, include both old and new values when useful
