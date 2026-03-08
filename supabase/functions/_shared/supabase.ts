/**
 * Supabase Client for Edge Functions
 *
 * Edge Functions use the anon key + RLS for database access (AR-06: Zero-Trust Data Access).
 * The service role key is ONLY available to the storage-signer function.
 *
 * This module provides the standard client used by all AI step functions.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Creates a Supabase client authenticated with the requesting user's JWT.
 * This ensures all database operations respect RLS policies.
 *
 * Use this in functions that receive a user JWT (pipeline-orchestrator, save-human-edit, etc.)
 */
export function createUserClient(authHeader: string | null) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader ?? '' },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates a Supabase client using the service role key (bypasses RLS).
 * Used by internal step functions invoked server-to-server by the pipeline
 * orchestrator. These functions never run in a browser context and have no
 * user JWT to forward — they need to read workflow_nodes, consulting_projects,
 * project_documents and update pipeline_executions, all of which are
 * RLS-protected. The service role key is the correct credential here.
 *
 * Falls back to the anon key only in local development where the service role
 * key may not be configured, so `supabase functions serve` still works.
 *
 * DO NOT use this in functions that receive and should honour a user JWT —
 * use createUserClient() instead so RLS is respected for end-user requests.
 */
export function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const fallbackKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  if (!serviceRoleKey) {
    console.warn(
      '[supabase] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key. ' +
      'RLS will block DB reads in step functions unless policies allow anon access. ' +
      'Set the secret via: supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<key>'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey ?? fallbackKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Creates a Supabase admin client using the service role key.
 * RESTRICTED: Only for use in the storage-signer Edge Function. (SEC-AUTH-03)
 */
export function createAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not available in this function. ' +
      'Service role access is restricted to the storage-signer function only. (SEC-AUTH-03)'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
