---
name: add-i18n-keys
description: Add internationalization translation keys (English and Chinese) to the VibeOS web frontend. Use when adding new UI text, labels, or messages that need bilingual support.
---

# Add i18n Translation Keys

The frontend uses a Zustand-based i18n system with type-safe keys. All text visible to users must have both English and Chinese translations.

## Workflow checklist

```
- [ ] Step 1: Add English keys
- [ ] Step 2: Add Chinese keys
- [ ] Step 3: Update barrel exports (if new file)
- [ ] Step 4: Use in components
```

## Step 1: Add English keys

File: `apps/web/src/i18n/en/<domain>.ts` (choose the matching domain file)

Existing domain files: `common.ts`, `workspace.ts`, `agent.ts`, `phase.ts`, `task.ts`, `requirement.ts`, `settings.ts`, `intelligence.ts`

```typescript
export default {
  // ... existing keys ...
  'myFeature.title': 'My Feature',
  'myFeature.description': 'Description text here',
  'myFeature.action.save': 'Save',
  'myFeature.action.cancel': 'Cancel',
} as const
```

**Key naming conventions:**
- Dot-separated hierarchy: `domain.section.element`
- Sidebar items: `sidebar.myView`
- Group labels: `sidebar.group.myGroup`
- Actions: `domain.action.verb`
- Placeholders: `domain.placeholder.field`

## Step 2: Add Chinese keys

File: `apps/web/src/i18n/zh/<domain>.ts` — same structure, same keys, Chinese values:

```typescript
export default {
  // ... existing keys — MUST match en counterpart ...
  'myFeature.title': '我的功能',
  'myFeature.description': '描述文字',
  'myFeature.action.save': '保存',
  'myFeature.action.cancel': '取消',
} as const
```

**Both files must have identical keys.** The `zh/index.ts` barrel is typed as `Record<TranslationKey, string>` — missing keys cause TypeScript errors.

## Step 3: Update barrel exports (only if creating a new domain file)

If you created a new file like `myfeature.ts`:

**`apps/web/src/i18n/en/index.ts`:**

```typescript
import myfeature from './myfeature'

const en = {
  ...common,
  // ... existing ...
  ...myfeature,
} as const
```

**`apps/web/src/i18n/zh/index.ts`:**

```typescript
import myfeature from './myfeature'

const zh: Record<TranslationKey, string> = {
  ...common,
  // ... existing ...
  ...myfeature,
}
```

## Step 4: Use in components

```tsx
import { useT } from '../i18n'

function MyComponent() {
  const t = useT()
  return <h1>{t('myFeature.title')}</h1>
}
```

`TranslationKey` is auto-derived from `keyof typeof en` — the new keys are available immediately with full type-safety and autocomplete.

## Quick checklist

- [ ] en and zh files have the **same keys**
- [ ] Key names follow dot-notation hierarchy
- [ ] No duplicate keys across domain files (they merge via spread)
- [ ] TypeScript compiles without errors (`TranslationKey` type is checked)
