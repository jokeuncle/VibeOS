---
name: add-frontend-view
description: Add a new page or view to the VibeOS web frontend. Use when creating workspace views, adding sidebar navigation items, or wiring new view modes into the store-driven routing.
---

# Add Frontend View / Page

This project has **no URL router** — navigation is driven by `viewMode` in `useUIStore`. Adding a new view requires updating the mode type, the view switch, the sidebar nav, and i18n keys.

## Workflow checklist

```
- [ ] Step 1: Add ViewMode value
- [ ] Step 2: Create view component
- [ ] Step 3: Add to ViewContent switch
- [ ] Step 4: Add sidebar nav item
- [ ] Step 5: Add i18n keys (en + zh)
- [ ] Step 6: Wire API / store (if needed)
```

## Step 1: Add ViewMode value

File: `apps/web/src/stores/ui.ts`

Add the new mode string to **both** the `viewMode` field type and the `setViewMode` parameter type:

```typescript
viewMode:
  | 'dashboard'
  | 'requirements'
  // ... existing ...
  | 'myNewView'        // <-- add here
setViewMode: (mode:
  | 'dashboard'
  | 'requirements'
  // ... existing ...
  | 'myNewView'        // <-- and here
) => void
```

Also update the `ViewMode` type in `apps/web/src/components/WorkspaceView.tsx`:

```typescript
type ViewMode =
  | 'dashboard'
  // ... existing ...
  | 'myNewView'
```

## Step 2: Create view component

File: `apps/web/src/components/MyNewView.tsx`

Follow project conventions:
- Default export function component
- Keep under ~350 lines; extract sub-views if larger
- Use `useWorkspaceStore`, `useUIStore`, `useT()` as needed
- Follow `ui-chrome.mdc` panel patterns: `rounded-xl border border-border-subtle bg-surface-1/30`

## Step 3: Add to ViewContent switch

File: `apps/web/src/components/WorkspaceView.tsx`

1. Import the component at the top
2. Add a branch in `ViewContent()`:

```tsx
if (currentMode === 'myNewView') return <MyNewView />
```

## Step 4: Add sidebar nav item

File: `apps/web/src/components/Sidebar.tsx`

Add to the appropriate group in `NAV_GROUPS`:

```typescript
{ key: 'myNewView', icon: SomeIcon, label: 'sidebar.myNewView' },
```

Import the icon from `lucide-react`.

## Step 5: Add i18n keys

**English:** `apps/web/src/i18n/en/common.ts` (or the relevant domain file)

```typescript
'sidebar.myNewView': 'My New View',
```

**Chinese:** `apps/web/src/i18n/zh/common.ts`

```typescript
'sidebar.myNewView': '新视图',
```

If creating a new domain file (e.g. `myview.ts`), also update the barrel in `en/index.ts` and `zh/index.ts`:

```typescript
import myview from './myview'
// ...
const en = { ...common, ...myview, /* ... */ } as const
```

## Step 6: Wire API / store (if needed)

If the view needs backend data:

1. Add API helpers in `apps/web/src/lib/api.ts` under the appropriate namespace
2. Either add state to an existing Zustand slice or create a new slice (see `add-zustand-slice` skill)
3. Add Vite proxy rule in `apps/web/vite.config.ts` if the API is on a new backend service

## Width considerations

Views inside `WorkspaceView` render within a container with max-width constraints. Check `WorkspaceView.tsx` for the width helper and ensure your view works within those bounds.
