/**
 * pipeline-orchestrator — Single client entry point for all pipeline advancement
 *
 * This is the ONLY Edge Function that clients can call to advance the pipeline.
 * No client code shall invoke AI step functions directly. (AR-01)
 *
 * Responsibilities:
 * - Verifies user JWT (SEC-AUTH-01)
 * - Checks editor authorization (SEC-AUTH-02)
 * - Prevents double-triggering (idempotency check)
 * - Queues the correct next step in pipeline_executions
 * - Invokes the step Edge Function asynchronously (non-blocking)
 *
 * Specification: Section 9.2
 */

import { createUserClient } from '../_shared/supabase.ts';
import { verifyJWT, handleCORS, errorResponse, jsonResponse, AuthError } from '../_shared/auth.ts';

// Maps workflow step types to their Edge Function names
const STEP_FUNCTION_MAP: Record<string, string> = {
  hypothesis_generation: 'generate-hypothesis',
  interview_architect:  'generate-interview',
  human_breakpoint:     'complete-human-breakpoint',
  gap_analysis:         'analyze-gaps',
  solution_architect:   'generate-solutions',
  reporting:            'generate-report',
};

// Step prerequisite chain — each step requires the previous to be completed
const STEP_PREREQUISITES: Record<string, string | null> = {
  knowledge_ingestion:  null,                // No prerequisite
  hypothesis_generation: 'knowledge_ingestion',
  interview_architect:  'hypothesis_generation',
  human_breakpoint:     'interview_architect',
  gap_analysis:         'human_breakpoint',
  solution_architect:   'gap_analysis',
  reporting:            'solution_architect',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
// ROB-02: Internal function-to-function calls use the service role key so that
// step functions can write directly to tables without RLS contention. Falls back
// to the anon key if the service role key is not set (local dev without secrets).
const INTERNAL_INVOKE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? SUPABASE_ANON_KEY;

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCORS(req);
  if (corsResponse) return corsResponse;

  try {
    // 1. Verify JWT
    const user = await verifyJWT(req);

    // 2. Parse request body
    const body = await req.json();
    const { project_id, action, payload } = body as {
      project_id: string;
      action: string;
      payload?: any;
    };

    if (!project_id || !action) {
      return errorResponse('project_id and action are required', 400);
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createUserClient(authHeader);

    // 3. Verify editor authorization
    const { data: isEditor, error: authError } = await supabase.rpc('is_project_editor', {
      p_project_id: project_id,
      p_user_id: user.id,
    });

    if (authError || !isEditor) {
      return errorResponse('You do not have editor access to this project', 403);
    }

    // 4. Determine the next step to execute based on the action
    const nextStep = resolveNextStep(action);
    if (!nextStep) {
      return errorResponse(`Unknown action: ${action}`, 400);
    }

    // 5. Verify the prerequisite step is completed
    const prerequisite = STEP_PREREQUISITES[nextStep];
    if (prerequisite) {
      const { data: prereqNode } = await supabase
        .from('active_workflow_nodes')
        .select('id, execution_status')
        .eq('project_id', project_id)
        .eq('step_type', prerequisite)
        .single();

      if (!prereqNode) {
        return errorResponse(
          `Cannot trigger ${nextStep}: prerequisite step ${prerequisite} has not been completed`,
          422
        );
      }
    }

    // 6. Check for in-flight execution to prevent double-triggering
    // (except for human steps which can be re-completed)
    if (nextStep !== 'human_breakpoint') {
      const { data: existingExecution } = await supabase
        .from('pipeline_executions')
        .select('id, status')
        .eq('project_id', project_id)
        .eq('step_type', nextStep)
        .in('status', ['queued', 'running'])
        .maybeSingle();

      if (existingExecution) {
        return jsonResponse({
          status: 'already_queued',
          step: nextStep,
          execution_id: existingExecution.id,
        });
      }
    }

    // 7. Queue the execution record
    const { data: execution, error: insertError } = await supabase
      .from('pipeline_executions')
      .insert({
        project_id,
        step_type: nextStep,
        triggered_by: user.id,
        status: 'queued',
      })
      .select()
      .single();

    if (insertError || !execution) {
      console.error('[orchestrator] Failed to insert execution:', insertError);
      return errorResponse('Failed to queue pipeline execution', 500);
    }

    // 8. Invoke the step function asynchronously (non-blocking — client disconnection safe)
    const stepFunctionName = STEP_FUNCTION_MAP[nextStep];
    if (stepFunctionName) {
      // Use EdgeRuntime.waitUntil to continue after response is sent
      const invokePromise = fetch(
        `${SUPABASE_URL}/functions/v1/${stepFunctionName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${INTERNAL_INVOKE_KEY}`,
          },
          body: JSON.stringify({
            execution_id: execution.id,
            project_id,
            triggered_by: user.id,
            payload: payload ?? null,
          }),
        }
      ).catch((err) => {
        console.error(`[orchestrator] Failed to invoke ${stepFunctionName}:`, err);
      });

      // @ts-ignore Deno EdgeRuntime API
      if (typeof EdgeRuntime !== 'undefined') {
        // @ts-ignore
        EdgeRuntime.waitUntil(invokePromise);
      }
    }

    console.log(`[orchestrator] Queued ${nextStep} as execution ${execution.id} for project ${project_id}${payload ? ' with payload' : ''}`);

    return jsonResponse(
      { status: 'queued', step: nextStep, execution_id: execution.id },
      202
    );

  } catch (error) {
    if (error instanceof AuthError) {
      return errorResponse(error.message, error.status);
    }
    console.error('[orchestrator] Unhandled error:', error);
    return errorResponse('Internal server error', 500);
  }
});

/**
 * Maps client action strings to step type identifiers.
 * Actions use imperative verbs; step types use noun phrases.
 */
function resolveNextStep(action: string): string | null {
  const actionMap: Record<string, string> = {
    'generate_hypothesis':    'hypothesis_generation',
    'generate_interview':     'interview_architect',
    'complete_human_breakpoint': 'human_breakpoint',
    'analyze_gaps':           'gap_analysis',
    'generate_solutions':     'solution_architect',
    'generate_report':        'reporting',
  };
  return actionMap[action] ?? null;
}
