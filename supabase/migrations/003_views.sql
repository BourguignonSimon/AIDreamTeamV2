-- Migration 003: Views
-- Provides convenient access to active (non-superseded) workflow nodes

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- VIEW: active_workflow_nodes
-- Returns the latest completed, non-superseded node per project+step.
-- This is the canonical input-resolution view for all Edge Functions.
-- Specification: Section 5.1 (FR-VER-02)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE VIEW active_workflow_nodes AS
SELECT DISTINCT ON (project_id, step_type)
  wn.*
FROM workflow_nodes wn
WHERE execution_status = 'completed'
  AND superseded_by IS NULL
ORDER BY project_id, step_type, version DESC;

COMMENT ON VIEW active_workflow_nodes IS
  'Returns the current canonical workflow node per (project, step) pair.
   Edge Functions resolve upstream dependencies exclusively through this view.
   A node appears here only when: execution_status=completed AND superseded_by IS NULL.
   Both AI-generated and human-edited nodes are included — the most recent completed
   version is always canonical regardless of edit_source. (FR-VER-02, AR-09)';
