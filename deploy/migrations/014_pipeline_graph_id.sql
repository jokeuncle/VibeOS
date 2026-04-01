-- ===================================================================
-- Add per-phase graph binding to pipeline configs.
-- Each phase can optionally reference a workspace graph to override
-- the default agent dispatch with a LangGraph-based execution.
-- ===================================================================

ALTER TABLE workspace_pipeline_configs
  ADD COLUMN IF NOT EXISTS graph_id UUID REFERENCES workspace_graphs(id) ON DELETE SET NULL;
