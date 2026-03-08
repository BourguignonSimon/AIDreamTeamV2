/**
 * complete-human-breakpoint — Step 4: Human Transcript Submission
 *
 * Persists the manual interview metadata and storage path for the
 * transcript uploaded by the consultant.
 *
 * This function is invoked by pipeline-orchestrator to ensure
 * audit logging in pipeline_executions. (AR-01)
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { jsonResponse, errorResponse } from '../_shared/auth.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const supabase = createServiceClient();
  let executionId: string | undefined;

  try {
    const body = await req.json() as {
      execution_id: string;
      project_id: string;
      triggered_by: string;
      payload: {
        input_data: {
          interview_date: string;
          stakeholders_interviewed: string[];
          notes: string;
          transcript_paths: string[];
        };
        output_data: {
          transcript_storage_path: string;
          word_count: number;
          processing_method: string;
          uploaded_at: string;
        };
      };
    };

    executionId = body.execution_id;
    const { project_id, triggered_by, payload } = body;

    if (!executionId || !project_id || !payload) {
      return errorResponse('execution_id, project_id, and payload are required', 422);
    }

    // Mark as running
    await supabase.from('pipeline_executions')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', executionId);

    // 1. Write node via SECURITY DEFINER RPC
    // Use the provided payload directly.
    const idempotencyKey = `${project_id}:human_breakpoint:${executionId}`;

    const { data: nodeId, error: rpcError } = await supabase.rpc('insert_workflow_node', {
      p_project_id:      project_id,
      p_step_type:       'human_breakpoint',
      p_input_data:      payload.input_data,
      p_output_data:     payload.output_data,
      p_idempotency_key: idempotencyKey,
      p_triggered_by:    triggered_by,
    });

    if (rpcError) throw new Error(`Failed to write human-breakpoint node: ${rpcError.message}`);

    // 2. Mark execution as completed
    await supabase.from('pipeline_executions')
      .update({ status: 'completed', completed_at: new Date().toISOString(), node_id: nodeId })
      .eq('id', executionId);

    console.log(`[complete-human-breakpoint] Completed. Node: ${nodeId} for Project: ${project_id}`);
    return jsonResponse({ status: 'completed', node_id: nodeId });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[complete-human-breakpoint] Error:', errorMessage);

    if (executionId) {
      await createServiceClient().from('pipeline_executions')
        .update({ status: 'failed', error_message: errorMessage, completed_at: new Date().toISOString() })
        .eq('id', executionId);
    }

    return errorResponse(errorMessage, 500);
  }
});
