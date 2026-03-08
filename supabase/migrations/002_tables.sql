-- Migration 002: Core Tables
-- Implements the full schema from Section 5.1 of OPERIA-MRD-001

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: domain_templates
-- Must be created BEFORE consulting_projects because that table holds a FK
-- to domain_templates.id. Rows are seeded in migration 009.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE domain_templates (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL,
  description              TEXT,
  industry                 TEXT,
  focus_areas              TEXT[],
  default_questions        TEXT[],
  typical_bottlenecks      TEXT[],
  prompt_injection_context TEXT,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: consulting_projects
-- Owner table for all consulting engagements
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE consulting_projects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  client_name         TEXT NOT NULL,
  industry            TEXT NOT NULL,
  country             CHAR(2) NOT NULL,              -- ISO 3166-1 alpha-2
  language            CHAR(2) NOT NULL DEFAULT 'fr'  -- fr | en | nl (SG-06)
                      CHECK (language IN ('fr', 'en', 'nl')),
  context_summary     TEXT,                          -- FR-S1-06: max 500 words
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'archived', 'completed')),
  current_step        TEXT NOT NULL DEFAULT 'knowledge_ingestion',
  sme_profile         JSONB,                         -- SMEProfile object (Section 16)
  domain_template_id  UUID REFERENCES domain_templates(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_consulting_projects_owner ON consulting_projects(owner_id);
CREATE INDEX idx_consulting_projects_status ON consulting_projects(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_consulting_projects_updated_at
  BEFORE UPDATE ON consulting_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: project_documents
-- Tracks uploaded SME documents (FR-S1-01 through FR-S1-05)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE project_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES consulting_projects(id) ON DELETE CASCADE,
  uploaded_by     UUID NOT NULL REFERENCES auth.users(id),
  storage_path    TEXT NOT NULL UNIQUE,              -- path in project-documents bucket
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,                     -- application/pdf | application/vnd.openxmlformats... | text/plain
  size_bytes      BIGINT NOT NULL,                   -- max 26214400 (25 MB) — FR-S1-01
  status          TEXT NOT NULL DEFAULT 'uploaded'
                  CHECK (status IN ('uploaded', 'ingested', 'failed')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_project_documents_project ON project_documents(project_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: workflow_nodes
-- Immutable versioned AI step outputs (AR-03: Immutable Node History)
-- Extended with HEC fields (Amendment OPERIA-AMD-001, Section 18.3)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE workflow_nodes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES consulting_projects(id) ON DELETE CASCADE,
  step_type         TEXT NOT NULL
                    CHECK (step_type IN (
                      'knowledge_ingestion', 'hypothesis_generation',
                      'interview_architect', 'human_breakpoint',
                      'gap_analysis', 'solution_architect', 'reporting'
                    )),
  version           INTEGER NOT NULL DEFAULT 1,
  superseded_by     UUID REFERENCES workflow_nodes(id),

  -- Execution lifecycle — only status transitions allowed after creation (AR-03)
  execution_status  TEXT NOT NULL DEFAULT 'pending'
                    CHECK (execution_status IN (
                      'pending', 'running', 'completed', 'failed', 'retrying'
                    )),
  retry_count       INTEGER NOT NULL DEFAULT 0,

  -- Idempotency guard (AR-02)
  idempotency_key   TEXT UNIQUE,

  -- Data payload
  input_data        JSONB,                           -- node ID references only
  output_data       JSONB,                           -- AI-generated structured output
  human_overrides   JSONB,                           -- v2: keyed section overrides for Step 7

  -- Provenance (Amendment OPERIA-AMD-001)
  edit_source       TEXT NOT NULL DEFAULT 'ai_generated'
                    CHECK (edit_source IN ('ai_generated', 'human_edit')),

  error_message     TEXT,
  triggered_by      UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  -- One version per project+step combination
  UNIQUE (project_id, step_type, version)
);

CREATE INDEX idx_workflow_nodes_project ON workflow_nodes(project_id);
CREATE INDEX idx_workflow_nodes_project_step ON workflow_nodes(project_id, step_type);
CREATE INDEX idx_workflow_nodes_status ON workflow_nodes(execution_status);
CREATE INDEX idx_workflow_nodes_idempotency ON workflow_nodes(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TRIGGER update_workflow_nodes_updated_at
  BEFORE UPDATE ON workflow_nodes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: pipeline_executions
-- Audit and retry trail for pipeline step runs (Section 9.4)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE pipeline_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES consulting_projects(id) ON DELETE CASCADE,
  triggered_by    UUID REFERENCES auth.users(id),
  step_type       TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  queued_at       TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  error_message   TEXT,
  node_id         UUID REFERENCES workflow_nodes(id),   -- set on completion
  retry_of        UUID REFERENCES pipeline_executions(id)  -- retry chain
);

CREATE INDEX idx_pipeline_executions_project ON pipeline_executions(project_id);
CREATE INDEX idx_pipeline_executions_status ON pipeline_executions(status);
CREATE INDEX idx_pipeline_executions_step ON pipeline_executions(project_id, step_type);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: project_collaborators
-- Multi-tenant collaboration with role-based access (FR-PROJ-02)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE project_collaborators (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES consulting_projects(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id),
  email       TEXT NOT NULL,                         -- for pending (pre-accept) invitations
  role        TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'accepted', 'revoked')),
  invited_by  UUID NOT NULL REFERENCES auth.users(id),
  invited_at  TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,

  UNIQUE (project_id, email)
);

CREATE INDEX idx_collaborators_project ON project_collaborators(project_id);
CREATE INDEX idx_collaborators_user ON project_collaborators(user_id);
CREATE INDEX idx_collaborators_email ON project_collaborators(email);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: ai_quality_gates
-- Async quality evaluation results (FR-QG-01 through FR-QG-05)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE ai_quality_gates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id             UUID NOT NULL REFERENCES workflow_nodes(id) ON DELETE CASCADE,
  project_id          UUID NOT NULL REFERENCES consulting_projects(id) ON DELETE CASCADE,
  pragmatism_score    SMALLINT CHECK (pragmatism_score BETWEEN 0 AND 100),
  roi_focus_score     SMALLINT CHECK (roi_focus_score BETWEEN 0 AND 100),
  rationale           TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'passed', 'failed', 'overridden')),
  evaluation_status   TEXT NOT NULL DEFAULT 'pending'
                      CHECK (evaluation_status IN ('pending', 'evaluating', 'completed', 'skipped')),
  evaluated_async     BOOLEAN DEFAULT TRUE,
  overridden_by       UUID REFERENCES auth.users(id),
  override_reason     TEXT,
  evaluated_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- One gate per node
CREATE UNIQUE INDEX idx_quality_gates_node ON ai_quality_gates(node_id);
CREATE INDEX idx_quality_gates_project ON ai_quality_gates(project_id);
CREATE INDEX idx_quality_gates_status ON ai_quality_gates(status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- TABLE: targeted_reprocess_calls
-- Audit trail for scoped AI re-process calls (Amendment OPERIA-AMD-001)
-- Full specification: Section 5.1
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE targeted_reprocess_calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES consulting_projects(id) ON DELETE CASCADE,
  source_node_id    UUID NOT NULL REFERENCES workflow_nodes(id),
  step_type         TEXT NOT NULL,
  triggered_by      UUID NOT NULL REFERENCES auth.users(id),
  item_type         TEXT NOT NULL
                    CHECK (item_type IN ('bottleneck', 'question', 'gap_finding', 'solution', 'report_section')),
  item_id           TEXT NOT NULL,     -- the id field of the targeted item within output_data
  instruction       TEXT,              -- optional human refinement instruction
  input_snapshot    JSONB NOT NULL,    -- the item's state at time of re-process call
  ai_response       JSONB,             -- what the AI returned
  applied           BOOLEAN DEFAULT FALSE,        -- did editor accept and apply the result?
  applied_to_node   UUID REFERENCES workflow_nodes(id),  -- the human_edit node that used this result
  model_metadata    JSONB,             -- ModelCallMetadata (Section 16)
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reprocess_project ON targeted_reprocess_calls(project_id);
CREATE INDEX idx_reprocess_node ON targeted_reprocess_calls(source_node_id);
CREATE INDEX idx_reprocess_user ON targeted_reprocess_calls(triggered_by);
