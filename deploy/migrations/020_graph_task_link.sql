-- ===================================================================
-- Link tasks to graph nodes: each capability node in a workflow graph
-- maps 1:1 to a task row that tracks its execution status.
-- ===================================================================

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS graph_node_id VARCHAR(128);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS graph_id UUID REFERENCES workspace_graphs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_graph_node
    ON tasks(graph_node_id) WHERE graph_node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_graph_id
    ON tasks(graph_id) WHERE graph_id IS NOT NULL;
