-- Migration 010: RLS and Concurrency Fixes
--
-- Fixes two issues identified during code review:
--
-- 1. MISSING UPDATE POLICY on pipeline_executions
--    Step Edge Functions (generate-hypothesis, analyze-gaps, etc.) call
--    supabase.from('pipeline_executions').update({ status: ... }) after being
--    invoked by the orchestrator. They run via createServiceClient() which uses
--    the service role key (bypasses RLS), so this fix is a correctness safeguard
--    for any code path that may run with a user token.
--    Adding an explicit UPDATE policy also makes the intent clear.
--
-- 2. MISSING ADVISORY LOCK in insert_human_edit_node
--    insert_workflow_node uses pg_advisory_xact_lock to serialise concurrent
--    calls for the same (project, step) pair (ROB-01). insert_human_edit_node
--    has the same SELECT MAX(version) → INSERT pattern but no advisory lock,
--    creating a race window where two concurrent saves could produce duplicate
--    active nodes. This patch adds the same lock.
--
-- Specification: Section 5.3, ROB-01, SEC-ISO-01

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FIX 1: Add UPDATE policy for pipeline_executions
-- Only project editors and owners can update execution status.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE POLICY "editors_update_executions" ON pipeline_executions
  FOR UPDATE
  USING (is_project_editor(project_id, auth.uid()))
  WITH CHECK (is_project_editor(project_id, auth.uid()));


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FIX 2: Add advisory lock to insert_human_edit_node (ROB-01)
--
-- Mirrors the locking strategy in insert_workflow_node to prevent
-- duplicate-version race conditions on concurrent human saves.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION insert_human_edit_node(
  p_project_id        UUID,
  p_step_type         TEXT,
  p_input_data        JSONB,
  p_output_data       JSONB,
  p_human_overrides   JSONB DEFAULT NULL,
  p_triggered_by      UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_node_id UUID;
  v_version INTEGER;
BEGIN
  -- ROB-01: Serialise concurrent saves for the same (project, step) pair to
  -- prevent a SELECT MAX(version) → INSERT race that could produce two
  -- non-superseded active nodes. Same strategy as insert_workflow_node.
  PERFORM pg_advisory_xact_lock(hashtext(p_project_id::TEXT || ':' || p_step_type));

  -- Calculate next version (under lock — safe from races)
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM workflow_nodes
  WHERE project_id = p_project_id AND step_type = p_step_type;

  -- Insert human-edit node
  -- No idempotency_key: human saves are intentional and each one is a distinct version
  INSERT INTO workflow_nodes (
    project_id, step_type, version,
    input_data, output_data, human_overrides,
    edit_source, execution_status, triggered_by
  )
  VALUES (
    p_project_id, p_step_type, v_version,
    p_input_data, p_output_data, p_human_overrides,
    'human_edit', 'completed', p_triggered_by
  )
  RETURNING id INTO v_node_id;

  -- Supersede all previous completed versions
  UPDATE workflow_nodes
  SET superseded_by = v_node_id
  WHERE project_id = p_project_id
    AND step_type = p_step_type
    AND id != v_node_id
    AND superseded_by IS NULL
    AND execution_status = 'completed';

  -- NOTE: No pg_net call here — human-edited nodes bypass quality gate scoring (AR-04, Section 5.4)

  RETURN v_node_id;
END;
$$;

COMMENT ON FUNCTION insert_human_edit_node IS
  'Creates a new versioned workflow node for consultant-edited step content.
   Architecturally equivalent to insert_workflow_node (AR-09) but sets edit_source=human_edit
   and does NOT trigger quality gate evaluation. Accepts human_overrides JSONB for Step 7
   section-level overrides. Called exclusively by the save-human-edit Edge Function. (Section 5.4)
   ROB-01: Uses pg_advisory_xact_lock to prevent version-number races on concurrent saves.';
