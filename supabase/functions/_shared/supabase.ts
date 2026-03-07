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
 * Creates a Supabase client using the anon key without user context.
 * Used by internal step functions triggered by pipeline_executions events.
 * The SECURITY DEFINER RPCs (insert_workflow_node) handle authorization internally.
 */
export function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  return createClient(supabaseUrl, supabaseAnonKey, {
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
