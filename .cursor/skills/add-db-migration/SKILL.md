---
name: add-db-migration
description: Add a new database migration to the VibeOS project. Use when creating tables, adding columns, creating indexes, or making any Postgres schema changes.
---

# Add Database Migration

## Workflow checklist

```
- [ ] Step 1: Determine next migration number
- [ ] Step 2: Write idempotent SQL
- [ ] Step 3: Append to apply-migrations.sh
- [ ] Step 4: Update init.sql (optional, for greenfield)
- [ ] Step 5: Apply and verify
```

## Step 1: Determine next number

Check existing migrations:

```bash
ls deploy/migrations/
```

Current range: `001` through `010`. The next migration should be `011_description.sql`.

## Step 2: Write SQL

File: `deploy/migrations/NNN_description.sql`

All DDL must be **idempotent** (safe to re-run):

```sql
-- NNN_description.sql
-- Brief description of what this migration does.

CREATE TABLE IF NOT EXISTS my_table (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name        VARCHAR(256) NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_my_table_workspace ON my_table(workspace_id);
```

**Idempotency patterns:**

| Operation | Pattern |
|-----------|---------|
| New table | `CREATE TABLE IF NOT EXISTS` |
| New column | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| New index | `CREATE INDEX IF NOT EXISTS` |
| New enum value | `DO $$ BEGIN ... EXCEPTION WHEN ... END $$` |
| Drop column | `ALTER TABLE ... DROP COLUMN IF EXISTS` (use sparingly) |

**Conventions:**
- Primary keys: `UUID DEFAULT uuid_generate_v4()`
- Timestamps: `TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- JSON data: `JSONB NOT NULL DEFAULT '{}'`
- Foreign keys: `REFERENCES parent_table(id) ON DELETE CASCADE`
- Always add indexes for columns used in WHERE/JOIN clauses

## Step 3: Update migration runner

File: `deploy/apply-migrations.sh`

Append the new filename to the `MIGRATIONS` array:

```bash
MIGRATIONS=(
  "001_gitlab_integration.sql"
  # ... existing ...
  "010_workspace_graphs.sql"
  "011_description.sql"           # <-- add here
)
```

## Step 4: Update init.sql (optional)

File: `deploy/init.sql`

Only update if you want **brand-new** Postgres volumes (first-time `docker compose up`) to include this schema. This is optional — `apply-migrations.sh` handles existing databases.

## Step 5: Apply

```bash
# Via DATABASE_URL
export DATABASE_URL=postgres://vibeos:vibeos_dev@localhost:5432/vibeos?sslmode=disable
cd deploy && ./apply-migrations.sh

# Or via Docker Compose
cd deploy && docker compose exec -T postgres psql -U vibeos -d vibeos < migrations/011_description.sql
```

Verify: connect to the database and check the new table/column exists.
