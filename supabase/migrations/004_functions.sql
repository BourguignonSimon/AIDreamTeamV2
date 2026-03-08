-- Migration 004: Security Functions and Stored Procedures
-- Implements SECURITY DEFINER RPCs per Section 5.2, 5.3, 5.4

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FUNCTION: is_project_member
-- Returns TRUE if p_user_id is the owner or an accepted collaborator
-- Used in RLS SELECT policies (AR-06: Zero-Trust Data Access)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Owner check
  IF EXISTS (
    SELECT 1 FROM consulting_projects
    WHERE id = p_project_id AND owner_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- Accepted collaborator (any role) check
  RETURN EXISTS (
    SELECT 1 FROM project_collaborators
    WHERE project_id = p_project_id
      AND user_id = p_user_id
      AND status = 'accepted'
  );
END;
$$;

COMMENT ON FUNCTION is_project_member IS
  'Returns TRUE when p_user_id is either the project owner or an accepted collaborator
   (editor or viewer). Used in RLS SELECT policies for all project-scoped tables.
   SECURITY DEFINER ensures this function bypasses RLS for its internal queries.';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FUNCTION: is_project_editor
-- Returns TRUE if p_user_id has write access to the project
-- Used in RLS INSERT/UPDATE policies and Edge Function authorization
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION is_project_editor(p_project_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Owner always has full editor access
  IF EXISTS (
    SELECT 1 FROM consulting_projects
    WHERE id = p_project_id AND owner_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- Accepted editor collaborator check
  RETURN EXISTS (
    SELECT 1 FROM project_collaborators
    WHERE project_id = p_project_id
      AND user_id = p_user_id
      AND status = 'accepted'
      AND role = 'editor'
  );
END;
$$;

COMMENT ON FUNCTION is_project_editor IS
  'Returns TRUE when p_user_id is either the project owner or an accepted editor.
   Viewers return FALSE. Called by pipeline-orchestrator and save-human-edit Edge Functions
   before any write operation. Also used in RLS INSERT/UPDATE policies. (SEC-AUTH-02)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FUNCTION: insert_workflow_node
-- Idempotent versioned node insertion for AI-generated steps.
-- Triggers async quality gate evaluation via pg_net after insert.
-- Full specification: Section 5.3
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION insert_workflow_node(
  p_project_id        UUID,
  p_step_type         TEXT,
  p_input_data        JSONB,
  p_output_data       JSONB,
  p_idempotency_key   TEXT,
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
  -- ROB-01: Serialise concurrent calls for the same (project, step) pair at the
  -- transaction level to prevent a SELECT MAX(version) → INSERT race condition that
  -- could produce two non-superseded active nodes.
  PERFORM pg_advisory_xact_lock(hashtext(p_project_id::TEXT || ':' || p_step_type));

  -- Idempotency guard: check again under the lock (double-checked locking) (AR-02)
  SELECT id INTO v_node_id
  FROM workflow_nodes
  WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN v_node_id;
  END IF;

  -- Calculate next version for this project+step combination
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM workflow_nodes
  WHERE project_id = p_project_id
    AND step_type = p_step_type;

  -- Insert new completed node
  INSERT INTO workflow_nodes (
    project_id, step_type, version, input_data, output_data,
    idempotency_key, execution_status, triggered_by, edit_source
  )
  VALUES (
    p_project_id, p_step_type, v_version, p_input_data, p_output_data,
    p_idempotency_key, 'completed', p_triggered_by, 'ai_generated'
  )
  RETURNING id INTO v_node_id;

  -- Point all previous completed versions to the new one (supersede them)
  UPDATE workflow_nodes
  SET superseded_by = v_node_id
  WHERE project_id = p_project_id
    AND step_type = p_step_type
    AND id != v_node_id
    AND superseded_by IS NULL
    AND execution_status = 'completed';

  -- Trigger async quality gate evaluation via pg_net (AR-04)
  -- The evaluate-output Edge Function runs in the background without blocking step completion
  PERFORM net.http_post(
    url     := current_setting('app.edge_function_url', true) || '/evaluate-output',
    body    := json_build_object(
                 'node_id',    v_node_id,
                 'project_id', p_project_id
               )::text,
    headers := json_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key', true)
               )::jsonb
  );

  RETURN v_node_id;
END;
$$;

COMMENT ON FUNCTION insert_workflow_node IS
  'Creates a new versioned workflow node for AI-generated step output.
   Idempotent: repeated calls with the same idempotency_key return the existing node ID.
   Supersedes all previous completed nodes for the same (project, step) pair.
   Triggers async quality gate evaluation via pg_net — this does NOT block the return.
   SECURITY DEFINER: called by AI step Edge Functions using the anon key. (Section 5.3)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FUNCTION: insert_human_edit_node
-- Creates a versioned node for consultant-edited content.
-- Does NOT trigger quality gate evaluation (human edits bypass scoring).
-- Full specification: Section 5.4
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
  -- Calculate next version
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
   section-level overrides. Called exclusively by the save-human-edit Edge Function. (Section 5.4)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FUNCTION: accept_project_invitation
-- Called when an invited collaborator clicks their invitation link.
-- Updates collaborator status and links their auth.users ID.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION accept_project_invitation(
  p_invitation_token  TEXT,
  p_user_id           UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collaborator project_collaborators%ROWTYPE;
  v_project_id   UUID;
BEGIN
  -- SEC-04: The invitation token IS the project_id UUID.
  -- Cast explicitly so an invalid format returns a clear error rather than
  -- silently falling through to a "not found" match against any pending invite.
  BEGIN
    v_project_id := p_invitation_token::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN json_build_object('error', 'Invalid invitation token format');
  END;

  -- Find pending invitation scoped to the specific project AND the authenticated
  -- user's email. Prevents cross-project token reuse (SEC-04).
  SELECT * INTO v_collaborator
  FROM project_collaborators
  WHERE project_id = v_project_id
    AND email      = (SELECT email FROM auth.users WHERE id = p_user_id)
    AND status     = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'No pending invitation found for this user and project');
  END IF;

  -- Accept the invitation
  UPDATE project_collaborators
  SET
    status      = 'accepted',
    user_id     = p_user_id,
    accepted_at = NOW()
  WHERE id = v_collaborator.id;

  RETURN json_build_object(
    'project_id', v_collaborator.project_id,
    'role',       v_collaborator.role
  );
END;
$$;

COMMENT ON FUNCTION accept_project_invitation IS
  'Links the authenticated user to their pending invitation record.
   p_invitation_token must be the project_id UUID — the lookup is scoped to that
   specific project AND the authenticated user''s email, preventing cross-project
   token reuse (SEC-04). Called from the invitation accept flow in the frontend. (FR-PROJ-03)';

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- FUNCTION: delete_project_cascade
-- GDPR-compliant project deletion: removes all data including storage paths
-- Returned storage paths must be deleted from the bucket by the caller.
-- Specification: SEC-GDPR-02
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE OR REPLACE FUNCTION delete_project_cascade(
  p_project_id  UUID,
  p_user_id     UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_storage_paths TEXT[];
BEGIN
  -- Only the project owner can permanently delete
  IF NOT EXISTS (
    SELECT 1 FROM consulting_projects
    WHERE id = p_project_id AND owner_id = p_user_id
  ) THEN
    RETURN json_build_object('error', 'Only the project owner can delete this project');
  END IF;

  -- Collect all storage paths that need purging from the bucket
  SELECT array_agg(storage_path)
  INTO v_storage_paths
  FROM project_documents
  WHERE project_id = p_project_id;

  -- Also collect report export paths from workflow_nodes output_data
  -- (these would be in report-exports bucket)

  -- Delete the project — all related rows cascade automatically (ON DELETE CASCADE)
  DELETE FROM consulting_projects WHERE id = p_project_id;

  -- Return storage paths for the caller (Edge Function) to purge from the bucket
  RETURN json_build_object(
    'deleted',        true,
    'storage_paths',  COALESCE(v_storage_paths, '{}')
  );
END;
$$;

COMMENT ON FUNCTION delete_project_cascade IS
  'Permanently deletes a project and all cascading data (nodes, documents, collaborators, etc.).
   Returns the storage_paths array so the caller can purge objects from Supabase Storage buckets.
   Only the project owner (p_user_id = owner_id) can invoke this. (SEC-GDPR-02)';
