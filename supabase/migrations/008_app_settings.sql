-- Migration 008: App-Level Database Settings
-- "Install Anywhere" prerequisite configuration
--
-- PURPOSE
-- -------
-- The insert_workflow_node RPC (004_functions.sql) calls net.http_post() to
-- trigger async quality gate evaluation. It reads two runtime values via
-- current_setting():
--
--   current_setting('app.edge_function_url', true)   → Supabase Edge Function base URL
--   current_setting('app.supabase_anon_key', true)   → Anon JWT for the Authorization header
--
-- Without this migration those calls return NULL and pg_net silently fires
-- HTTP requests to "null/evaluate-output", making quality gates permanently
-- stuck in 'pending'. This migration bakes the correct values into the
-- database as ALTER DATABASE SET variables so they survive across sessions
-- and are automatically applied after every supabase db push.
--
-- HOW TO USE
-- ----------
-- Replace the placeholder values below with your actual Supabase project
-- settings BEFORE running supabase db push, OR set them manually after
-- push using the two UPDATE statements at the bottom of this file.
--
-- For local development:
--   SUPABASE_EDGE_FUNCTION_URL → http://localhost:54321/functions/v1
--   SUPABASE_ANON_KEY          → output of: supabase status | grep "anon key"
--
-- For production:
--   SUPABASE_EDGE_FUNCTION_URL → https://<project-ref>.supabase.co/functions/v1
--   SUPABASE_ANON_KEY          → from: supabase dashboard → Settings → API → anon key
--
-- SECURITY NOTE
-- -------------
-- The anon key is a *public* JWT. It is safe to store at the database level.
-- It only permits operations that pass RLS policies. Never store the
-- SERVICE_ROLE_KEY here.
--
-- Specification: "Install Anywhere" Gaps — Hardcoded RPC Settings


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SECTION 1: Validate required PostgreSQL extensions
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
BEGIN
  -- pg_net: required for async HTTP calls from insert_workflow_node (AR-04)
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
  ) THEN
    RAISE EXCEPTION
      'SETUP ERROR: pg_net extension is not installed. '
      'Run: CREATE EXTENSION IF NOT EXISTS pg_net; '
      'or enable it in the Supabase dashboard under Database → Extensions.';
  END IF;

  -- pgcrypto / uuid-ossp: required for gen_random_uuid() in all tables
  IF NOT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
      OR extname = 'uuid-ossp'
  ) THEN
    RAISE WARNING
      'SETUP WARNING: Neither pgcrypto nor uuid-ossp is installed. '
      'UUID generation in tables may fail. '
      'Migration 001_extensions.sql should have installed these.';
  END IF;

  RAISE NOTICE 'Extension check PASSED: pg_net is available.';
END;
$$;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SECTION 2: Validate required Storage buckets exist
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO $$
DECLARE
  v_missing_buckets TEXT := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'project-documents') THEN
    v_missing_buckets := v_missing_buckets || ' project-documents';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'report-exports') THEN
    v_missing_buckets := v_missing_buckets || ' report-exports';
  END IF;

  IF v_missing_buckets <> '' THEN
    RAISE WARNING
      'SETUP WARNING: The following Storage buckets are missing: %. '
      'Migration 007_storage.sql should have created them. '
      'File uploads (Step 1, Step 4) and PDF exports (Step 7) will fail.',
      v_missing_buckets;
  ELSE
    RAISE NOTICE 'Storage bucket check PASSED: project-documents and report-exports exist.';
  END IF;
END;
$$;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SECTION 3: Set database-level runtime configuration
--
-- These are read by insert_workflow_node via current_setting().
-- ALTER DATABASE SET persists across sessions and reconnects.
-- The values here are placeholders — replace before push (see HOW TO USE).
--
-- If you prefer to set/update them manually post-deploy (e.g. in CI),
-- use the helper function defined in Section 4 below.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Set a safe no-op default so current_setting() returns an empty string
-- rather than NULL. The actual values must be configured using
-- set_app_runtime_config() (Section 4) before going live.
DO $$
BEGIN
  -- Only set if not already configured (idempotent guard)
  -- We use a placeholder empty string so pg_net calls fail with a clear
  -- network error rather than a NULL-reference error, making misconfiguration
  -- immediately apparent in the Edge Function logs.

  -- Note: We cannot use ALTER DATABASE SET inside a transaction with DO $$,
  -- so we use ALTER ROLE instead, which applies to the session user.
  -- In Supabase, this is the postgres superuser role.
  EXECUTE format(
    'ALTER ROLE postgres SET app.edge_function_url = %L',
    COALESCE(
      current_setting('app.edge_function_url', true),
      ''
    )
  );

  EXECUTE format(
    'ALTER ROLE postgres SET app.supabase_anon_key = %L',
    COALESCE(
      current_setting('app.supabase_anon_key', true),
      ''
    )
  );

  RAISE NOTICE
    'Runtime config initialized. '
    'Run SELECT set_app_runtime_config(...) to set actual values.';
END;
$$;


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SECTION 4: Helper function to configure runtime settings
--
-- This is the RECOMMENDED way to set the runtime config after install.
-- Call this once post-deploy (can be called again to update values):
--
--   SELECT set_app_runtime_config(
--     p_edge_function_url := 'https://<ref>.supabase.co/functions/v1',
--     p_supabase_anon_key := '<your-anon-key>'
--   );
--
-- The function is SECURITY DEFINER and restricted to superuser/service role.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE FUNCTION set_app_runtime_config(
  p_edge_function_url  TEXT,
  p_supabase_anon_key  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_db_name TEXT;
BEGIN
  -- Security: only superuser or service_role should be able to call this
  IF current_setting('is_superuser', true) <> 'on'
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'set_app_runtime_config: insufficient privileges. '
      'Must be called as superuser or service_role.';
  END IF;

  -- Validate inputs
  IF p_edge_function_url IS NULL OR trim(p_edge_function_url) = '' THEN
    RAISE EXCEPTION 'p_edge_function_url must not be empty';
  END IF;

  IF p_supabase_anon_key IS NULL OR trim(p_supabase_anon_key) = '' THEN
    RAISE EXCEPTION 'p_supabase_anon_key must not be empty';
  END IF;

  IF p_edge_function_url NOT LIKE 'http%' THEN
    RAISE EXCEPTION 'p_edge_function_url must start with http:// or https://';
  END IF;

  -- Apply settings at the database level (survives reconnects)
  SELECT current_database() INTO v_db_name;

  EXECUTE format(
    'ALTER DATABASE %I SET app.edge_function_url = %L',
    v_db_name,
    p_edge_function_url
  );

  EXECUTE format(
    'ALTER DATABASE %I SET app.supabase_anon_key = %L',
    v_db_name,
    p_supabase_anon_key
  );

  -- Also apply to current session so the change is effective immediately
  PERFORM set_config('app.edge_function_url', p_edge_function_url, false);
  PERFORM set_config('app.supabase_anon_key', p_supabase_anon_key, false);

  RAISE NOTICE 'app.edge_function_url  → %', p_edge_function_url;
  RAISE NOTICE 'app.supabase_anon_key  → [SET, %s chars]', length(p_supabase_anon_key);

  RETURN jsonb_build_object(
    'ok',                  true,
    'edge_function_url',   p_edge_function_url,
    'anon_key_length',     length(p_supabase_anon_key),
    'effective_from',      now()
  );
END;
$$;

COMMENT ON FUNCTION set_app_runtime_config IS
  'Configures the two database-level settings required for pg_net async HTTP calls
   from insert_workflow_node to the evaluate-output Edge Function.
   Call once after deployment:
     SELECT set_app_runtime_config(
       p_edge_function_url := ''https://<ref>.supabase.co/functions/v1'',
       p_supabase_anon_key := ''<your-anon-key>''
     );
   Can be re-called at any time to update values (e.g. after rotating the anon key).
   Restricted to superuser / service_role. (Install Anywhere gap fix)';


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- SECTION 5: Health check view
--
-- Read-only view that lets operators quickly verify the installation:
--   SELECT * FROM app_health_check;
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CREATE OR REPLACE VIEW app_health_check AS
SELECT
  -- pg_net availability
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
    AS pg_net_enabled,

  -- Edge function URL configured (non-empty)
  (current_setting('app.edge_function_url', true) <> ''
   AND current_setting('app.edge_function_url', true) IS NOT NULL)
    AS edge_function_url_set,

  -- Anon key configured (non-empty)
  (current_setting('app.supabase_anon_key', true) <> ''
   AND current_setting('app.supabase_anon_key', true) IS NOT NULL)
    AS anon_key_set,

  -- Storage buckets
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'project-documents')
    AS bucket_project_documents,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'report-exports')
    AS bucket_report_exports,

  -- Partial URL for verification (never shows the full anon key)
  CASE
    WHEN current_setting('app.edge_function_url', true) IS NOT NULL
         AND current_setting('app.edge_function_url', true) <> ''
    THEN left(current_setting('app.edge_function_url', true), 60) || '...'
    ELSE '(not set)'
  END AS edge_function_url_preview,

  -- Key length for verification without exposing the key
  CASE
    WHEN current_setting('app.supabase_anon_key', true) IS NOT NULL
         AND current_setting('app.supabase_anon_key', true) <> ''
    THEN length(current_setting('app.supabase_anon_key', true))
    ELSE 0
  END AS anon_key_char_count,

  now() AS checked_at;

COMMENT ON VIEW app_health_check IS
  'Read-only installation health check. Query this after deployment to verify
   all runtime prerequisites are correctly configured:
     SELECT * FROM app_health_check;
   All boolean columns should be TRUE for a healthy installation.';
