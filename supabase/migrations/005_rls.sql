-- Migration 005: Row Level Security Policies
-- Implements multi-tenant isolation per Section 5.2 and SG-03
-- All tables with project data must have RLS enabled (SEC-ISO-01)

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: consulting_projects
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE consulting_projects ENABLE ROW LEVEL SECURITY;

-- Owners have full access to their own projects
CREATE POLICY "owners_full_access" ON consulting_projects
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Accepted collaborators (editor or viewer) can read
CREATE POLICY "collaborators_read" ON consulting_projects
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_collaborators pc
      WHERE pc.project_id = id
        AND pc.user_id = auth.uid()
        AND pc.status = 'accepted'
    )
  );

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: workflow_nodes
-- Viewer access to workflow_nodes is enforced at the RLS level,
-- not the UI level — per 2.3 Tertiary Persona constraint
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE workflow_nodes ENABLE ROW LEVEL SECURITY;

-- Read: owners and all accepted collaborators (editor + viewer)
CREATE POLICY "project_members_read_nodes" ON workflow_nodes
  FOR SELECT
  USING (is_project_member(project_id, auth.uid()));

-- Write (INSERT/UPDATE): owners and accepted editors only — viewers cannot write
CREATE POLICY "editors_insert_nodes" ON workflow_nodes
  FOR INSERT
  WITH CHECK (is_project_editor(project_id, auth.uid()));

-- Only allow status updates (running → completed/failed) — no other field updates
CREATE POLICY "editors_update_node_status" ON workflow_nodes
  FOR UPDATE
  USING (is_project_editor(project_id, auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: project_documents
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

-- Read: all project members
CREATE POLICY "project_members_read_documents" ON project_documents
  FOR SELECT
  USING (is_project_member(project_id, auth.uid()));

-- Write: editors only
CREATE POLICY "editors_manage_documents" ON project_documents
  FOR INSERT
  WITH CHECK (is_project_editor(project_id, auth.uid()));

CREATE POLICY "editors_delete_documents" ON project_documents
  FOR DELETE
  USING (is_project_editor(project_id, auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: pipeline_executions
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE pipeline_executions ENABLE ROW LEVEL SECURITY;

-- Read: all project members (owners and collaborators)
CREATE POLICY "project_members_read_executions" ON pipeline_executions
  FOR SELECT
  USING (is_project_member(project_id, auth.uid()));

-- Insert/Update: handled by Edge Functions via SECURITY DEFINER functions
-- Direct client insert is allowed only for editors
CREATE POLICY "editors_insert_executions" ON pipeline_executions
  FOR INSERT
  WITH CHECK (is_project_editor(project_id, auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: project_collaborators
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;

-- Read: project owners and the collaborator themselves
CREATE POLICY "owner_reads_collaborators" ON project_collaborators
  FOR SELECT
  USING (
    -- Owner can see all collaborators for their project
    EXISTS (
      SELECT 1 FROM consulting_projects cp
      WHERE cp.id = project_id AND cp.owner_id = auth.uid()
    )
    OR
    -- Collaborator can see their own record (to check invitation status)
    user_id = auth.uid()
    OR
    -- Match by email for pending invitations (user may not have user_id set yet)
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

-- Insert: only project owners can invite collaborators (FR-PROJ-02)
CREATE POLICY "owners_invite_collaborators" ON project_collaborators
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM consulting_projects cp
      WHERE cp.id = project_id AND cp.owner_id = auth.uid()
    )
  );

-- Update: owners can revoke; collaborators can accept their own invitation
CREATE POLICY "manage_collaborator_status" ON project_collaborators
  FOR UPDATE
  USING (
    -- Owner can revoke any collaborator (FR-PROJ-04)
    EXISTS (
      SELECT 1 FROM consulting_projects cp
      WHERE cp.id = project_id AND cp.owner_id = auth.uid()
    )
    OR
    -- Collaborator can accept their own invitation (FR-PROJ-03)
    (user_id = auth.uid() AND status = 'pending')
    OR
    (email = (SELECT email FROM auth.users WHERE id = auth.uid()) AND status = 'pending')
  );

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: ai_quality_gates
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE ai_quality_gates ENABLE ROW LEVEL SECURITY;

-- Read: all project members
CREATE POLICY "project_members_read_gates" ON ai_quality_gates
  FOR SELECT
  USING (is_project_member(project_id, auth.uid()));

-- Override: editors can override gate status (FR-QG-05)
CREATE POLICY "editors_override_gates" ON ai_quality_gates
  FOR UPDATE
  USING (is_project_editor(project_id, auth.uid()));

-- Insert: handled by evaluate-output Edge Function via SECURITY DEFINER
CREATE POLICY "service_insert_gates" ON ai_quality_gates
  FOR INSERT
  WITH CHECK (is_project_member(project_id, auth.uid()));

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: targeted_reprocess_calls
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE targeted_reprocess_calls ENABLE ROW LEVEL SECURITY;

-- Read: all project members (audit trail visibility)
CREATE POLICY "project_members_read_reprocess" ON targeted_reprocess_calls
  FOR SELECT
  USING (is_project_member(project_id, auth.uid()));

-- Insert/Update: editors only (triggered by targeted-reprocess Edge Function)
CREATE POLICY "editors_reprocess" ON targeted_reprocess_calls
  FOR INSERT
  WITH CHECK (is_project_editor(project_id, auth.uid()));

CREATE POLICY "editors_update_reprocess" ON targeted_reprocess_calls
  FOR UPDATE
  USING (is_project_editor(project_id, auth.uid()));
