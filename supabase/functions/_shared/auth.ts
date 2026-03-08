/**
 * JWT Verification and Authorization Utilities for Edge Functions
 *
 * All Edge Functions that accept client requests must verify the JWT
 * before processing. (SEC-AUTH-01, SEC-AUTH-02)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface AuthUser {
  id: string;
  email: string;
}

/**
 * Verifies the Bearer JWT from the Authorization header and returns the user.
 * Throws on invalid/missing token. Returns HTTP 401 response object on failure.
 */
export async function verifyJWT(req: Request): Promise<AuthUser> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthError('Missing or invalid Authorization header', 401);
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    throw new AuthError('Invalid or expired token', 401);
  }

  return { id: user.id, email: user.email ?? '' };
}

export class AuthError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Returns CORS headers for Edge Functions that accept browser requests.
 *
 * SEC-01: In production, only origins listed in the ALLOWED_ORIGINS env var
 * (comma-separated) are reflected back. Falls back to '*' only when the env
 * var is not set (local dev). 'Vary: Origin' prevents CDN caching collisions.
 */
export function corsHeaders(requestOrigin?: string) {
  const allowedOriginsEnv = Deno.env.get('ALLOWED_ORIGINS');

  let allowOrigin: string;
  if (!allowedOriginsEnv) {
    // Local dev: no allowlist configured — open wildcard
    allowOrigin = '*';
  } else {
    const allowlist = allowedOriginsEnv.split(',').map((o) => o.trim()).filter(Boolean);
    allowOrigin =
      requestOrigin && allowlist.includes(requestOrigin) ? requestOrigin : allowlist[0] ?? '*';
  }

  return {
    'Access-Control-Allow-Origin':  allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Vary': 'Origin',
  };
}

/**
 * Handles the OPTIONS preflight request for CORS.
 */
export function handleCORS(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders(req.headers.get('Origin') ?? undefined),
    });
  }
  return null;
}

/**
 * Creates a JSON error response with the appropriate status code.
 */
export function errorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    }
  );
}

/**
 * Creates a JSON success response.
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    }
  );
}
