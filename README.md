# Operia — AI Diagnostic Platform

Operia is a B2B SaaS platform for AI consultants delivering structured SME diagnostic engagements. It automates a 7-step knowledge pipeline from document ingestion to final report generation, with full human editorial control at every AI step.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Edge Functions](#edge-functions)
- [Frontend Development](#frontend-development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)

---

## Overview

### The 7-Step Pipeline

| Step | Name | Type |
|------|------|------|
| 1 | Knowledge Ingestion | Human |
| 2 | Hypothesis Generation | AI |
| 3 | Interview Architect | AI |
| 4 | Human Breakpoint | Human |
| 5 | Gap Analysis | AI |
| 6 | Solution Architect | AI |
| 7 | Reporting | AI |

AI steps support:
- **Full AI re-run** — regenerate entire step output
- **Inline editing** — direct text edits saved as human-edit nodes
- **Targeted reprocess** — scoped AI call on a single item without touching other items

### Human Editorial Control (HEC)

Every AI-generated step exposes editorial controls:
- Edit any item inline and save as a new `human_edit` node version
- Request targeted AI reprocess of a single item before saving
- Override quality gate verdicts with a reason

Spec reference: Amendment OPERIA-AMD-001.

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system architecture document.

**Stack:**
- **Frontend**: React 18 + TypeScript (strict) + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (PostgreSQL 15+, Edge Functions on Deno, Auth, Storage, Realtime)
- **AI**: Google Gemini (Gemini Flash) — primary
  Anthropic (claude-haiku-4-5) — fallback
- **i18n**: react-i18next — French, English, Dutch

---

## Getting Started

### Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) v1.150+
- A Supabase project (or local `supabase start`)

### Install dependencies

```bash
npm install
```

### Local Supabase

```bash
supabase start
supabase db push          # Apply all migrations
supabase functions serve  # Serve Edge Functions locally
```

### Start dev server

```bash
npm run dev
```

Open `http://localhost:5173`.

---

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

**Edge Function secrets** (set via `supabase secrets set`):

```
GOOGLE_GEMINI_API_KEY=<key>
ANTHROPIC_API_KEY=<key>
```

---

## Database Setup

Migrations are in `supabase/migrations/` and run in order:

| File | Description |
|------|-------------|
| `001_extensions.sql` | pg_net, pgcrypto, uuid-ossp extensions |
| `002_tables.sql` | All 7 core tables with RLS enabled |
| `003_views.sql` | `active_workflow_nodes` convenience view |
| `004_functions.sql` | insert_workflow_node, insert_human_edit_node, is_project_member, is_project_editor RPCs |
| `005_rls.sql` | Row Level Security policies for all tables |
| `006_realtime.sql` | Realtime publication for live UI subscriptions |
| `007_storage.sql` | Buckets: project-documents, report-exports |
| `008_app_settings.sql` | **Required post-install:** database-level `app.edge_function_url` and `app.supabase_anon_key` settings for pg_net async calls |
| `009_domain_templates.sql` | Industry-specific steerage: default templates for ERP, Logistics, and HR automation |

Apply all:
```bash
supabase db push
```

### Post-deploy: configure runtime settings

After `supabase db push`, the pg_net call inside `insert_workflow_node` needs
two database-level settings to fire correctly. Run this **once** in the Supabase
SQL Editor (or via `psql`):

```sql
SELECT set_app_runtime_config(
  p_edge_function_url := 'https://<project-ref>.supabase.co/functions/v1',
  p_supabase_anon_key := '<your-anon-key>'
);
```

For local development:
```sql
SELECT set_app_runtime_config(
  p_edge_function_url := 'http://localhost:54321/functions/v1',
  p_supabase_anon_key := '<local-anon-key from supabase status>'
);
```

You can re-run this at any time to update values (e.g. after a key rotation).

### Key Design Decisions

- **Immutable node versioning**: `workflow_nodes` rows are never updated. Re-runs create new rows with the previous row's `superseded_by` set to the new row ID.
- **Idempotency**: `insert_workflow_node` uses `idempotency_key` (unique) to prevent duplicate inserts on retries.
- **Async quality gate**: The `evaluate-output` function is triggered via `pg_net` inside the `insert_workflow_node` RPC — it never blocks the pipeline response.

---

## Edge Functions

Located in `supabase/functions/`. Each function is a Deno module.

| Function | Description |
|----------|-------------|
| `pipeline-orchestrator` | Validates auth, prevents double-trigger, dispatches step functions |
| `generate-hypothesis` | Step 2: reads documents, calls AI, writes node |
| `generate-interview` | Step 3: builds interview question set from hypotheses |
| `generate-interview` | Step 4: Human Breakpoint helper functions |
| `analyze-gaps` | Step 5: cross-references interview transcript with hypotheses |
| `generate-solutions` | Step 6: generates automation solutions with ROI |
| `generate-report` | Step 7: assembles and stores PDF report |
| `targeted-reprocess` | Scoped AI reprocess of a single item (Amendment OPERIA-AMD-001) |
| `save-human-edit` | Writes human-edit node version, marks applied reprocess calls |
| `evaluate-output` | Async quality gate: scores AI output 0–100 |
| `storage-signer` | Creates signed download URLs (only function with SERVICE_ROLE_KEY) |
| `health-check` | **Installation verification:** checks secrets, Gemini connectivity, pg_net, and bucket config. No auth required. |

### Shared modules (`_shared/`)

| Module | Description |
|--------|-------------|
| `ai-provider/factory.ts` | `callAIWithFallback` — primary Google Gemini + Anthropic fallback |
| `sanitize.ts` | Prompt injection mitigation, XML wrapping, token budget utilities |
| `prompts.ts` | All step-specific prompt builders with JSON output schemas |
| `supabase.ts` | Supabase client factory (anon for regular, service-role for storage-signer only) |

---

## Frontend Development

### Directory structure

```
src/
  components/
    layout/         AppHeader, AppShell, Navigation
    projects/       ProjectCard, ProjectCreateModal, CollaboratorManager
    workflow/
      steps/        Step1–Step7 panel components
      editorial/    EditableItem, OriginBadge, ReprocessButton, ReprocessPanel, SaveEditBar
      AIQualityBadge.tsx
      WorkflowStepper.tsx
  hooks/
    useWorkflowState.ts     Realtime subscription hub (AR-07)
    useStepGating.ts        Pure step unlock computation
    useStepEditor.ts        Item-level edit state + save (Amendment)
    useTargetedReprocess.ts Per-item AI reprocess calls
    usePipelineAdvance.ts   Trigger pipeline orchestrator
  i18n/             fr.json, en.json, nl.json + i18n setup
  lib/
    types.ts        All TypeScript interfaces and enums
    constants.ts    Thresholds, budgets, pipeline actions
    supabase.ts     Supabase client singleton
  pages/            Auth, Dashboard, ProjectPage
```

### State model

All workflow state flows through `useWorkflowState`, which maintains three Realtime subscriptions:
- `workflow_nodes` — INSERT/UPDATE
- `ai_quality_gates` — INSERT/UPDATE
- `pipeline_executions` — INSERT/UPDATE

No polling. Components read from this single source of truth.

### Step gating

`useStepGating` is a pure `useMemo` that computes a `StepStatus` for each of the 7 steps:
- `locked` — prerequisite step not complete
- `pending` — ready to run but not yet triggered
- `running` — execution in progress
- `completed` — AI output available
- `needs_review` — quality gate score 40–60
- `failed` — quality gate score < 40

---

## Testing

```bash
npm run test          # Vitest unit tests
npm run test:e2e      # Playwright end-to-end tests
npm run test:coverage # Coverage report
```

Unit test files: `src/**/*.test.ts(x)` and `src/test/`.
E2E tests: `e2e/` directory.

---

## Post-Deploy Verification

After deploying, run the health check to confirm all prerequisites are met:

```bash
curl https://<project-ref>.supabase.co/functions/v1/health-check
```

Expected healthy response:
```json
{
  "healthy": true,
  "checks": {
    "env_vars":            { "ok": true, "detail": "GOOGLE_GEMINI_API_KEY ✓  ANTHROPIC_API_KEY ✓" },
    "gemini_connectivity": { "ok": true, "detail": "Gemini responded in < 8 s" },
    "anthropic_key":       { "ok": true, "detail": "Anthropic API key valid and reachable" },
    "database_config":     { "ok": true, "detail": "pg_net ✓  edge_function_url ✓  anon_key ✓  buckets ✓" }
  },
  "summary": "4/4 checks passed"
}
```

Or use the SQL view directly:
```sql
SELECT * FROM app_health_check;
```

All boolean columns should be `true`.

---

## Deployment

### Supabase (production)

```bash
supabase db push --linked
supabase functions deploy --project-ref <ref>
```

### Configure runtime settings (required, one-time)

```sql
SELECT set_app_runtime_config(
  p_edge_function_url := 'https://<project-ref>.supabase.co/functions/v1',
  p_supabase_anon_key := '<your-anon-key>'
);
```

### Verify
```bash
curl https://<project-ref>.supabase.co/functions/v1/health-check
```

```bash
npm run build
# Deploy dist/ to your static host
```

Set the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables in the hosting platform.

---

## Security

- **RLS**: All tables have Row Level Security enabled. Access is gated by `is_project_member()` and `is_project_editor()` SECURITY DEFINER functions.
- **Zero-trust service key**: `SUPABASE_SERVICE_ROLE_KEY` is only accessible inside `storage-signer`. All other functions use the anon key + JWT.
- **Prompt injection mitigation**: All user-supplied document content is XML-wrapped and scanned for injection patterns before being sent to AI providers.
- **GDPR**: EU data centers only. Cascade deletion on project removal. No AI model training (opt-out headers sent to all providers).
- **Auth**: 24-hour JWT expiry, refresh token rotation enabled, Google OAuth supported.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full security architecture (Section 6 of MRD).
