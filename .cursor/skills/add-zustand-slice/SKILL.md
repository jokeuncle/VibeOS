---
name: add-zustand-slice
description: Add a new Zustand store slice to useWorkspaceStore. Use when adding a new functional domain (e.g. analytics, notifications) to the workspace store with the slice composition pattern.
---

# Add Zustand Store Slice

The workspace store uses a **slice composition** pattern: each domain is a `buildXSlice(set, get)` function merged into one `create()` call.

## Workflow checklist

```
- [ ] Step 1: Define types in types.ts
- [ ] Step 2: Create slice file
- [ ] Step 3: Merge into store index
- [ ] Step 4: Add API helpers (if needed)
```

## Step 1: Define types

File: `apps/web/src/stores/workspace/types.ts`

Add fields and methods to `WorkspaceState`:

```typescript
export interface WorkspaceState {
  // ... existing ...

  // MyDomain slice
  myItems: MyItem[]
  myLoading: boolean
  fetchMyItems: (wsId: string) => Promise<void>
  addMyItem: (wsId: string, item: Partial<MyItem>) => void
  removeMyItem: (wsId: string, itemId: string) => void
}
```

Optionally define a `MyDomainSlice` type using `Pick<WorkspaceState, ...>` for type-safety (see `CoreSlice` pattern).

Add domain types to `apps/web/src/types/index.ts` if they represent new backend entities.

## Step 2: Create slice

File: `apps/web/src/stores/workspace/slices/myDomainSlice.ts`

```typescript
import type { WorkspaceState } from '../types'
import { workspaceApi } from '../../../lib/api'

type Set = (fn: (state: WorkspaceState) => Partial<WorkspaceState>) => void
type Get = () => WorkspaceState

export function buildMyDomainSlice(set: Set, get: Get) {
  return {
    myItems: [] as MyItem[],
    myLoading: false,

    fetchMyItems: async (wsId: string) => {
      set(() => ({ myLoading: true }))
      try {
        const items = await workspaceApi.listMyItems(wsId)
        set(() => ({ myItems: items, myLoading: false }))
      } catch {
        set(() => ({ myLoading: false }))
      }
    },

    addMyItem: async (wsId: string, item: Partial<MyItem>) => {
      const created = await workspaceApi.createMyItem(wsId, item)
      set(state => ({ myItems: [...state.myItems, created] }))
    },

    removeMyItem: async (wsId: string, itemId: string) => {
      await workspaceApi.deleteMyItem(wsId, itemId)
      set(state => ({ myItems: state.myItems.filter(i => i.id !== itemId) }))
    },
  }
}
```

Action naming conventions:
- `fetch*` / `refresh*` — server sync
- `set*` — simple setters
- `add*` / `remove*` / `update*` — CRUD
- `patch*` — partial server-shaped updates

## Step 3: Merge into store

File: `apps/web/src/stores/workspace/index.ts`

```typescript
import { buildMyDomainSlice } from './slices/myDomainSlice'

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      ...buildCoreSlice(set, get),
      ...buildTasksSlice(set, get),
      // ... existing ...
      ...buildMyDomainSlice(set, get),   // <-- add here
    }),
    {
      name: 'vibeos-workspace',
      partialize: (state) => ({ activeWorkspaceId: state.activeWorkspaceId }),
    },
  ),
)
```

If any new state should be persisted across refreshes, add it to the `partialize` function. Be conservative — only persist IDs and preferences, not data arrays.

## Step 4: API helpers

File: `apps/web/src/lib/api.ts`

Add methods to `workspaceApi` (or a new namespace):

```typescript
export const workspaceApi = {
  // ... existing ...
  listMyItems: (wsId: string) =>
    request<MyItem[]>(`/api/workspaces/${wsId}/my-items`).then(unwrap),
  createMyItem: (wsId: string, data: Partial<MyItem>) =>
    request<MyItem>(`/api/workspaces/${wsId}/my-items`, { method: 'POST', body: data }).then(unwrap),
}
```

## Usage in components

```tsx
const { myItems, fetchMyItems } = useWorkspaceStore(s => ({
  myItems: s.myItems,
  fetchMyItems: s.fetchMyItems,
}))
```

Or with individual selectors for minimal re-renders:

```tsx
const myItems = useWorkspaceStore(s => s.myItems)
```
