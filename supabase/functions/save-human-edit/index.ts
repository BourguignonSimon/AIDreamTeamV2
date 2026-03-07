/**
 * save-human-edit — Persists Human-Edited Step Content
 *
 * Called when a consultant saves their edited version of a step's output.
 * Creates a new versioned workflow_node via insert_human_edit_node RPC.
 * Marks targeted_reprocess_calls records as applied if provided.
 *
 * Specification: Section 9.6, Amendment OPERIA-AMD-001
 */

import { createUserClient } from '../_shared/supabase.ts';
import { verifyJWT, handleCORS, errorResponse, jsonResponse, AuthError } from '../_shared/auth.ts';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCORS(req);
  if (corsResponse) return corsResponse;

  try {
    const user = await verifyJWT(req);

    const body = await req.json() as {
      project_id: string;
      step_type: string;
      source_node_id: string;
      output_data: Record<string, unknown>;
      human_overrides?: Record<string, string>;  // Only for Step 7 section overrides
      applied_call_ids?: string[];               // targeted_reprocess_calls to mark applied
    };

    const {
      project_id,
      step_type,
      source_node_id,
      output_data,
      human_overrides,
      applied_call_ids,
    } = body;

    if (!project_id || !step_type || !source_node_id || !output_data) {
      return errorResponse('project_id, step_type, source_node_id, and output_data are required', 400);
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createUserClient(authHeader);

    // 1. Verify editor authorization
    const { data: isEditor } = await supabase.rpc('is_project_editor', {
      p_project_id: project_id,
      p_user_id: user.id,
    });
    if (!isEditor) return errorResponse('Editor access required', 403);

    // 2. Retrieve source node's input_data (new node inherits same upstream references)
    const { data: sourceNode, error: nodeError } = await supabase
      .from('workflow_nodes')
      .select('input_data, step_type')
      .eq('id', source_node_id)
      .single();

    if (nodeError || !sourceNode) {
      return errorResponse('Source node not found', 404);
    }

    if (sourceNode.step_type !== step_type) {
      return errorResponse(
        `Source node step_type mismatch: expected ${step_type}, got ${sourceNode.step_type}`,
        400
      );
    }

    // 3. Write new human-edit versioned node via SECURITY DEFINER RPC
    const { data: newNodeId, error: rpcError } = await supabase.rpc('insert_human_edit_node', {
      p_project_id:      project_id,
      p_step_type:       step_type,
      p_input_data:      sourceNode.input_data,
      p_output_data:     output_data,
      p_human_overrides: human_overrides ?? null,
      p_triggered_by:    user.id,
    });

    if (rpcError || !newNodeId) {
      console.error('[save-human-edit] RPC error:', rpcError);
      return errorResponse('Failed to save human edit', 500);
    }

    // 4. Mark applied targeted_reprocess_calls records
    if (applied_call_ids && applied_call_ids.length > 0) {
      const { error: updateError } = await supabase
        .from('targeted_reprocess_calls')
        .update({
          applied:         true,
          applied_to_node: newNodeId,
        })
        .in('id', applied_call_ids);

      if (updateError) {
        // Non-critical — log but don't fail the save
        console.warn('[save-human-edit] Failed to mark reprocess calls as applied:', updateError.message);
      }
    }

    console.log(`[save-human-edit] Saved ${step_type} edit. New node: ${newNodeId}. Project: ${project_id}`);

    return jsonResponse({ node_id: newNodeId }, 201);

  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[save-human-edit] Error:', errorMessage);
    return errorResponse(errorMessage, 500);
  }
});
