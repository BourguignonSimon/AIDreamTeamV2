# Operia Architecture Document

Version 1.0 — Generated from `operia_master_requirements_v2.md`

---

## 1. System Overview

Operia is a multi-tenant B2B SaaS platform. Each **consulting project** represents a single SME diagnostic engagement. Projects move through a 7-step pipeline controlled by an AI orchestrator, with full human editorial oversight at every AI step.

### Core Architectural Principles

| ID | Principle |
|----|-----------|
| AR-01 | Single source of truth: `workflow_nodes` table |
| AR-02 | UI language from user profile; AI content language from project |
| AR-03 | Immutable node versioning; re-runs create new rows, supersede previous |
| AR-04 | Quality gate is async — never blocks pipeline response |
| AR-05 | AI provider abstraction with automatic fallback |
| AR-06 | Zero-trust: SERVICE_ROLE_KEY isolated to `storage-signer` only |
| AR-07 | Realtime-driven UI — no polling, Supabase Realtime subscriptions |
| AR-08 | Document storage in private Supabase Storage buckets |
| AR-09 | Cascade deletion for GDPR compliance |
| AR-10 | Targeted reprocess does NOT go through orchestrator |

---

## 2. Database Schema

### Tables

#### `consulting_projects`
Primary entity. Owned by one user; members via `project_collaborators`.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| owner_id | UUID FK → auth.users | |
| name | TEXT | |
| client_name | TEXT | |
| industry_sector | TEXT | |
| language | TEXT | 'fr', 'en', 'nl' — AI content language |
| current_step | TEXT | WorkflowStep enum value |
| domain_template_id | UUID FK | Links to domain_templates |
| created_at | TIMESTAMPTZ | |

#### `domain_templates`
Pre-defined industry contexts for AI steerage.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | TEXT | |
| description | TEXT | |
| industry | TEXT | |
| focus_areas | TEXT[] | |
| typical_bottlenecks | JSONB | |
| default_questions | JSONB | |
| prompt_injection_context | TEXT | Injected into AI system prompts |
| created_at | TIMESTAMPTZ | |

#### `project_documents`
Uploaded documents for Step 1. Stored in `project-documents` bucket.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID FK | cascade delete |
| storage_path | TEXT | bucket-relative path |
| original_name | TEXT | |
| mime_type | TEXT | |
| size_bytes | INTEGER | ≤ 25MB (SG-05) |
| uploaded_by | UUID FK → auth.users | |
| created_at | TIMESTAMPTZ | |

#### `workflow_nodes`
Immutable versioned output records. Core of AR-01 and AR-03.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID FK | |
| step_type | TEXT | WorkflowStep value |
| execution_id | UUID | Links to pipeline_executions |
| output_data | JSONB | Step-specific output payload |
| edit_source | TEXT | 'ai_generated' or 'human_edit' |
| human_overrides | JSONB | Tracks which items were edited |
| superseded_by | UUID FK → workflow_nodes | Self-referential; set when a new version is created |
| idempotency_key | TEXT UNIQUE | Prevents duplicate inserts on retry |
| execution_status | TEXT | 'queued', 'running', 'completed', 'failed' |
| created_at | TIMESTAMPTZ | |

> The **active node** for a given step is the one where `superseded_by IS NULL`.

#### `pipeline_executions`
Tracks a full pipeline run. Prevents double-trigger (checked before starting).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID FK | |
| triggered_by | UUID FK → auth.users | |
| action | TEXT | PIPELINE_ACTIONS key |
| status | TEXT | 'queued', 'running', 'completed', 'failed' |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |

#### `project_collaborators`
Multi-tenant access control. Roles: `owner`, `editor`, `viewer`.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID FK | |
| user_id | UUID FK → auth.users | |
| role | TEXT | 'owner', 'editor', 'viewer' |
| invited_email | TEXT | For pending invitations |
| invitation_token | TEXT | UUID token for accept link |
| joined_at | TIMESTAMPTZ | |

#### `ai_quality_gates`
Async quality scores per node. 0–100 scale.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| node_id | UUID FK → workflow_nodes | |
| project_id | UUID FK | |
| status | TEXT | 'pending', 'evaluating', 'passed', 'needs_review', 'failed', 'overridden' |
| overall_score | INTEGER | 0–100 |
| dimension_scores | JSONB | Per-dimension breakdown |
| verdict_reason | TEXT | |
| override_reason | TEXT | Consultant-provided override note |
| evaluated_at | TIMESTAMPTZ | |

#### `targeted_reprocess_calls`
Audit log of every scoped AI call. Linked to a `save_human_edit` when applied.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| project_id | UUID FK | |
| node_id | UUID FK → workflow_nodes | Source node |
| step_type | TEXT | |
| item_type | TEXT | 'bottleneck', 'question', 'gap', 'solution', etc. |
| item_id | TEXT | ID within the output_data array |
| revised_item | JSONB | AI-revised item payload |
| applied | BOOLEAN | true once saved to a human_edit node |
| applied_to_node | UUID FK → workflow_nodes | |
| created_at | TIMESTAMPTZ | |

### Database Functions

All business logic RPCs are `SECURITY DEFINER` to bypass RLS where needed:

| Function | Description |
|----------|-------------|
| `is_project_member(project_id, user_id)` | Returns TRUE if user has any collaborator role |
| `is_project_editor(project_id, user_id)` | Returns TRUE if role is owner or editor |
| `insert_workflow_node(...)` | Idempotency guard, auto-supersede, async quality gate trigger via pg_net |
| `insert_human_edit_node(...)` | Same versioning but edit_source='human_edit', NO quality gate |
| `accept_project_invitation(token, user_id)` | Converts pending invitation to active collaborator |
| `delete_project_cascade(project_id, user_id)` | GDPR-compliant cascade deletion (owner only) |

---

## 3. Row Level Security

All 6 main tables have RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`).

### General pattern

```sql
-- Read: any project member
CREATE POLICY "select_member" ON workflow_nodes
  FOR SELECT USING (is_project_member(project_id, auth.uid()));

-- Insert/Update: editors only
CREATE POLICY "insert_editor" ON workflow_nodes
  FOR INSERT WITH CHECK (is_project_editor(project_id, auth.uid()));
```

### Storage RLS

```sql
-- project-documents bucket
CREATE POLICY "upload_editor" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'project-documents'
    AND is_project_editor((storage.foldername(name))[1]::UUID, auth.uid())
  );
```

Viewers can read documents but cannot upload or delete.

---

## 4. Edge Functions

### Request Authentication

Every function except `storage-signer` and `invite-collaborator` verifies JWT:

```typescript
const authHeader = req.headers.get('Authorization');
const { data: { user }, error } = await supabase.auth.getUser(
  authHeader?.replace('Bearer ', '') ?? ''
);
if (error || !user) return new Response('Unauthorized', { status: 401 });
```

### Pipeline Orchestrator

1. Verify JWT + editor role via `is_project_editor` RPC
2. Check `pipeline_executions` for queued/running status (prevent double-trigger)
3. Insert `pipeline_executions` record with status='queued'
4. Use `EdgeRuntime.waitUntil` to invoke the step function asynchronously
5. Return `{ execution_id }` immediately

### AI Provider Abstraction (AR-05)

```typescript
// _shared/ai-provider/factory.ts
export async function callAIWithFallback(prompt: AIPrompt): Promise<AIResponse> {
  const primary = createAIProvider();   // Google Gemini (Gemini Flash)
  try {
    return await primary.complete(prompt);
  } catch {
    const fallback = createFallbackProvider();  // Anthropic claude-haiku-4-5
    return await fallback.complete(prompt);     // throws combined error if both fail
  }
}
```

### Quality Gate (AR-04)

Triggered asynchronously via `pg_net` inside `insert_workflow_node`:

```sql
SELECT net.http_post(
  url := current_setting('app.edge_base_url') || '/evaluate-output',
  body := json_build_object('node_id', new_node_id, 'project_id', p_project_id)::text,
  headers := '{"Content-Type": "application/json"}'
);
```

The `evaluate-output` function updates `ai_quality_gates` once complete. The pipeline response is never delayed.

### Targeted Reprocess (AR-10, Amendment OPERIA-AMD-001)

```
POST /targeted-reprocess
{
  "node_id": "uuid",
  "item_type": "bottleneck",
  "item_id": "btn_001",
  "step_type": "hypothesis_generation"
}
```

Returns `{ call_id, revised_item }`. Does NOT write to `workflow_nodes`. The consultant reviews the result and optionally saves it via `save-human-edit`.

### Save Human Edit

```
POST /save-human-edit
{
  "project_id": "uuid",
  "step_type": "hypothesis_generation",
  "output_data": { ...full edited output... },
  "human_overrides": { "bottlenecks": ["btn_001"] },
  "applied_call_ids": ["uuid", "uuid"]
}
```

Calls `insert_human_edit_node` RPC (no quality gate), then marks `targeted_reprocess_calls.applied = true`.

---

## 5. Frontend Architecture

### State Management

No external state library (Redux/Zustand). State is colocated:

- **Workflow state**: `useWorkflowState` hook — `useReducer` + 3 Realtime channels
- **Step gating**: `useStepGating` — pure `useMemo`, no side effects
- **Edit state**: `useStepEditor` — local draft + optimistic item updates
- **Reprocess**: `useTargetedReprocess` — per-item loading state + pending call tracking
- **Pipeline control**: `usePipelineAdvance` — single button trigger with loading state

### Component Hierarchy

```
ProjectPage
  └── WorkflowStepper (sidebar nav)
  └── Step[N]Panel (active step)
        ├── AIQualityBadge
        ├── EditableItem (per item)
        │     ├── OriginBadge
        │     ├── ReprocessButton
        │     └── EditForm (step-specific)
        ├── ReprocessPanel (diff preview)
        └── SaveEditBar
```

### Realtime Channels

| Channel | Table | Events |
|---------|-------|--------|
| `workflow:nodes:{projectId}` | workflow_nodes | INSERT |
| `workflow:gates:{projectId}` | ai_quality_gates | INSERT, UPDATE |
| `workflow:executions:{projectId}` | pipeline_executions | INSERT, UPDATE |

### i18n

- UI language: from `i18n.language` (user preference, persisted in `user_metadata.preferred_language`)
- AI content language: from `project.language` — passed in every AI prompt
- Translation files: `src/i18n/fr.json`, `en.json`, `nl.json`

---

## 6. Security Architecture

### Prompt Injection Mitigation (Section 6.4 MRD)

All user-supplied content is:
1. Scanned against `INJECTION_PATTERNS` (XML escapes, "ignore previous instructions", control characters, etc.)
2. Wrapped in XML tags before being embedded in prompts:

```typescript
function sanitizeDocumentContent(content: string, filename: string): string {
  if (containsInjectionAttempt(content)) {
    throw new Error(`Document "${filename}" contains disallowed content patterns`);
  }
  return `<document filename="${escapeXml(filename)}">\n${escapeXml(content)}\n</document>`;
}
```

### Token Budget Management (Section 6.5 MRD)

```typescript
const TOKEN_BUDGETS = {
  SINGLE_DOC_MAX: 8_000,
  TOTAL_CONTEXT_MAX: 32_000,
  SUMMARY_TARGET: 2_000,
  RESERVE_FOR_OUTPUT: 4_000,
};
```

When total document tokens exceed 32,000, hierarchical summarization is applied:
1. Summarize each document individually to `SUMMARY_TARGET` tokens
2. Re-evaluate combined size
3. If still over budget, summarize the combined summaries

### Zero-Trust Data Access (AR-06)

```typescript
// Only callable within storage-signer function
export function createAdminClient() {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceKey) {
    throw new Error('SERVICE_ROLE_KEY not available in this function context');
  }
  return createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);
}
```

All other functions use the anon key + user JWT.

### GDPR Compliance

- Data stored in EU Supabase region only
- `delete_project_cascade` RPC removes all project data including storage files
- No AI model training: all provider calls include opt-out headers
  - Anthropic: `anthropic-beta: no-training`
  - Google: `x-goog-user-project` scoped, no training by default

---

## 7. Quality Gate Thresholds

```typescript
const QUALITY_GATE_PASS_THRESHOLD = 60;    // score >= 60 → passed
const QUALITY_GATE_REVIEW_THRESHOLD = 40;   // score 40–59 → needs_review
                                             // score < 40 → failed
```

Quality gates are **advisory**, not blocking. Consultants can override any verdict with a reason. Viewer-role users cannot override.

---

## 8. Deployment Architecture

```
┌─────────────────────────────────────────────┐
│                  Vercel / Netlify            │
│         React SPA (static build)            │
└──────────────┬──────────────────────────────┘
               │ HTTPS
┌──────────────▼──────────────────────────────┐
│              Supabase Platform               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Auth     │  │ PostgREST│  │ Realtime │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│  ┌──────────────────────────────────────┐   │
│  │  Edge Functions (Deno runtime)       │   │
│  │  pipeline-orchestrator               │   │
│  │  generate-hypothesis                 │   │
│  │  generate-interview                  │   │
│  │  analyze-gaps                        │   │
│  │  generate-solutions                  │   │
│  │  generate-report                     │   │
│  │  ... (11 total)                      │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────┐  ┌──────────────────────────┐ │
│  │PostgreSQL│  │ Storage                  │ │
│  │ 15+      │  │ project-documents        │ │
│  │ RLS      │  │ report-exports           │ │
│  └──────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│            AI Providers (External)           │
│  Google Gemini (Direct REST API) — primary  │
│  Anthropic (Direct REST API) — fallback     │
└─────────────────────────────────────────────┘
```

---

## 9. Key Data Flows

### Triggering a Pipeline Step

```
User clicks "Run AI" →
  POST /pipeline-orchestrator { project_id, action } →
    Validate JWT + editor role →
    Check no running execution →
    INSERT pipeline_executions (queued) →
    EdgeRuntime.waitUntil(invoke step function) →
    Return { execution_id } →
  UI receives 200, shows "running" via Realtime
```

### Step Function Execution

```
Step function starts →
  Read documents from Storage →
  Sanitize + summarize if needed →
  Call callAIWithFallback(prompt) →
  Parse JSON response →
  INSERT workflow_node via insert_workflow_node RPC →
    (Inside RPC: trigger pg_net → evaluate-output) →
  Update pipeline_executions to completed →
  UI receives node via Realtime subscription
```

### Human Edit + Targeted Reprocess

```
Consultant clicks "Reprocess item" →
  POST /targeted-reprocess { node_id, item_id, item_type } →
    Resolve item from node output_data →
    Build scoped prompt →
    Call AI →
    INSERT targeted_reprocess_calls →
    Return { call_id, revised_item } →
  UI shows diff in ReprocessPanel →
  Consultant accepts/rejects →
  (If accepted) consultant clicks "Save edits" →
  POST /save-human-edit { output_data, human_overrides, applied_call_ids } →
    insert_human_edit_node RPC (supersedes previous active node) →
    Mark targeted_reprocess_calls.applied = true →
  UI receives new node via Realtime
```
