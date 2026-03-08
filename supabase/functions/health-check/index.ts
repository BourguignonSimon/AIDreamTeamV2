/**
 * health-check — Installation Health Verification Endpoint
 *
 * Verifies that all runtime prerequisites for the Operia platform
 * are correctly configured in this Supabase deployment:
 *
 *   ✓ Required environment variables / secrets are set
 *   ✓ AI primary provider (Google Gemini) is reachable and responding
 *   ✓ AI fallback provider (Anthropic) is configured (key present)
 *   ✓ Database runtime settings (app.edge_function_url, app.supabase_anon_key)
 *   ✓ pg_net extension is enabled
 *   ✓ Storage buckets exist
 *
 * Usage:
 *   GET  https://<project>.supabase.co/functions/v1/health-check
 *   GET  http://localhost:54321/functions/v1/health-check   (local dev)
 *
 * No authentication required — this endpoint is intentionally public.
 * It returns no secrets; key values are replaced with presence/length info.
 *
 * Response shape:
 *   {
 *     "healthy": true | false,
 *     "checks": { "<check_name>": { "ok": bool, "detail": string } },
 *     "summary": "N/M checks passed",
 *     "checked_at": "<ISO timestamp>"
 *   }
 *
 * HTTP status:
 *   200 — all checks passed
 *   207 — partial failure (some checks failed, non-critical)
 *   503 — critical checks failed (platform inoperable)
 *
 * "Install Anywhere" Gap Fix — Specification: Health Check requirement
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, handleCORS } from '../_shared/auth.ts';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CheckResult {
  ok: boolean;
  detail: string;
  critical: boolean;
}

interface HealthReport {
  healthy: boolean;
  checks: Record<string, CheckResult>;
  summary: string;
  checked_at: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Individual checks
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Validates all required Edge Function environment variables. */
function checkEnvVars(): CheckResult {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'GOOGLE_GEMINI_API_KEY',
  ];
  const missing = required.filter((key) => !Deno.env.get(key)?.trim());

  // Anthropic key is optional (fallback only)
  const hasAnthropicKey = Boolean(Deno.env.get('ANTHROPIC_API_KEY')?.trim());

  if (missing.length > 0) {
    return {
      ok: false,
      critical: true,
      detail: `Missing required secrets: ${missing.join(', ')}. ` +
        `Run: supabase secrets set ${missing.join('=<value> ')}=<value>`,
    };
  }

  return {
    ok: true,
    critical: true,
    detail: hasAnthropicKey
      ? 'GOOGLE_GEMINI_API_KEY ✓  ANTHROPIC_API_KEY ✓ (fallback configured)'
      : 'GOOGLE_GEMINI_API_KEY ✓  ANTHROPIC_API_KEY — (fallback not configured, AI calls will not fail over)',
  };
}

/** Sends a minimal prompt to the Google Gemini API to verify connectivity. */
async function checkGeminiConnectivity(): Promise<CheckResult> {
  const apiKey = Deno.env.get('GOOGLE_GEMINI_API_KEY');
  if (!apiKey) {
    return { ok: false, critical: true, detail: 'GOOGLE_GEMINI_API_KEY not set — skipping connectivity test' };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 s timeout

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: HEALTHY' }] }],
        generationConfig: { maxOutputTokens: 10, temperature: 0 },
      }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (!resp.ok) {
      const body = await resp.text().catch(() => '(unable to read body)');
      return {
        ok: false,
        critical: true,
        detail: `Gemini API returned ${resp.status}: ${body.substring(0, 200)}`,
      };
    }

    const json = await resp.json();
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '(no text in response)';

    return {
      ok: true,
      critical: true,
      detail: `Gemini responded in < 8 s. Sample: "${text.trim().substring(0, 50)}"`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes('aborted') || message.includes('timeout');
    return {
      ok: false,
      critical: true,
      detail: isTimeout
        ? 'Gemini API timed out (> 8 s). Check network egress from Supabase region.'
        : `Gemini connectivity error: ${message}`,
    };
  }
}

/** Checks that the Anthropic API key is present and the API is reachable. */
async function checkAnthropicConnectivity(): Promise<CheckResult> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return {
      ok: true, // Not critical — fallback is optional
      critical: false,
      detail: 'ANTHROPIC_API_KEY not set. AI requests will not fail over if Gemini is unavailable.',
    };
  }

  try {
    // Use the lightweight models list endpoint (no tokens consumed)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const resp = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (resp.status === 401) {
      return { ok: false, critical: false, detail: 'ANTHROPIC_API_KEY is invalid (401 Unauthorized).' };
    }
    if (!resp.ok) {
      return { ok: false, critical: false, detail: `Anthropic API returned ${resp.status}.` };
    }

    return { ok: true, critical: false, detail: 'Anthropic API key valid and reachable ✓' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, critical: false, detail: `Anthropic connectivity error: ${message}` };
  }
}

/** Queries the database to confirm pg_net is enabled and app settings are configured. */
async function checkDatabaseConfig(): Promise<CheckResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !anonKey) {
    return { ok: false, critical: true, detail: 'Cannot connect — SUPABASE_URL or SUPABASE_ANON_KEY not set.' };
  }

  try {
    // Use service role key if available (gives access to storage.buckets view)
    // Fall back to anon key — health check still works, bucket check may be skipped
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? anonKey;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Query the app_health_check view created by 008_app_settings.sql
    const { data, error } = await supabase
      .from('app_health_check')
      .select('*')
      .single();

    if (error) {
      // View may not exist yet if migration hasn't run
      return {
        ok: false,
        critical: true,
        detail: `app_health_check view not found. Did you run 008_app_settings.sql migration? Error: ${error.message}`,
      };
    }

    const issues: string[] = [];
    if (!data.pg_net_enabled)           issues.push('pg_net extension NOT enabled');
    if (!data.edge_function_url_set)    issues.push('app.edge_function_url NOT configured');
    if (!data.anon_key_set)             issues.push('app.supabase_anon_key NOT configured');
    if (!data.bucket_project_documents) issues.push('Storage bucket "project-documents" missing');
    if (!data.bucket_report_exports)    issues.push('Storage bucket "report-exports" missing');

    if (issues.length > 0) {
      return {
        ok: false,
        critical: true,
        detail: issues.join('; ') + '. Run: SELECT set_app_runtime_config(...) in your DB.',
      };
    }

    return {
      ok: true,
      critical: true,
      detail: `pg_net ✓  edge_function_url ✓  anon_key ✓  buckets ✓  (url: ${data.edge_function_url_preview})`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, critical: true, detail: `Database check failed: ${message}` };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Handler
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Deno.serve(async (req: Request) => {
  // CORS preflight
  const corsResponse = handleCORS(req);
  if (corsResponse) return corsResponse;

  // Only allow GET
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed. Use GET.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // Run all checks in parallel for speed
  const [envResult, geminiResult, anthropicResult, dbResult] = await Promise.all([
    Promise.resolve(checkEnvVars()),
    checkGeminiConnectivity(),
    checkAnthropicConnectivity(),
    checkDatabaseConfig(),
  ]);

  const checks: Record<string, CheckResult> = {
    env_vars:             envResult,
    gemini_connectivity:  geminiResult,
    anthropic_key:        anthropicResult,
    database_config:      dbResult,
  };

  const totalChecks = Object.keys(checks).length;
  const passedChecks = Object.values(checks).filter((c) => c.ok).length;
  const criticalFailed = Object.values(checks).some((c) => !c.ok && c.critical);
  const anyFailed = Object.values(checks).some((c) => !c.ok);
  const allPassed = passedChecks === totalChecks;

  const report: HealthReport = {
    healthy: allPassed,
    checks,
    summary: `${passedChecks}/${totalChecks} checks passed`,
    checked_at: new Date().toISOString(),
  };

  // Determine HTTP status:
  // 200 — fully healthy
  // 207 — partial (non-critical failures only)
  // 503 — critical failure (platform likely inoperable)
  const status = allPassed ? 200 : criticalFailed ? 503 : 207;

  console.log(`[health-check] ${report.summary} — status ${status}`);

  return new Response(JSON.stringify(report, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(),
    },
  });
});
