-- Migration 006: Realtime Configuration
-- Enables Supabase Realtime on tables that the frontend subscribes to.
-- The frontend uses these subscriptions exclusively — no polling (AR-07).

-- Enable realtime on workflow_nodes: step completions, status changes
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_nodes;

-- Enable realtime on ai_quality_gates: async quality badge updates
ALTER PUBLICATION supabase_realtime ADD TABLE ai_quality_gates;

-- Enable realtime on pipeline_executions: progress tracking
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_executions;

-- Note: consulting_projects is not added to realtime as it changes infrequently
-- and the dashboard refreshes on navigation. Add if needed for collaborative editing.

COMMENT ON TABLE workflow_nodes IS
  'Subscribed to Supabase Realtime. The frontend useWorkflowState hook maintains a
   local reducer updated by INSERT and UPDATE events from this subscription.
   Clients never poll — all state arrives via push. (AR-07)';

COMMENT ON TABLE ai_quality_gates IS
  'Subscribed to Supabase Realtime. The AIQualityBadge component updates automatically
   when the evaluate-output Edge Function writes gate results. (AR-04, FR-QG-03)';

COMMENT ON TABLE pipeline_executions IS
  'Subscribed to Supabase Realtime. Used to display pipeline progress indicators
   while AI steps are running. (FR-S2-02)';
