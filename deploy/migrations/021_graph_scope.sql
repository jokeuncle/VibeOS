-- Add scope column to workspace_graphs for project-level DCG support.
-- scope: 'phase' (default, existing graphs) or 'project' (new project-level DCG).

ALTER TABLE workspace_graphs ADD COLUMN IF NOT EXISTS scope VARCHAR(16) NOT NULL DEFAULT 'phase';

-- Replace the old unique constraint with one that includes scope.
DROP INDEX IF EXISTS workspace_graphs_workspace_id_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_graphs_ws_scope_name
    ON workspace_graphs(workspace_id, scope, name);
