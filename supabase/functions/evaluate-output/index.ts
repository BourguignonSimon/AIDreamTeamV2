/**
 * evaluate-output — Async AI Quality Gate Evaluation
 *
 * Triggered via pg_net HTTP call from the insert_workflow_node RPC.
 * Runs completely in the background — never blocks pipeline step completion.
 * Scores output on Pragmatism (0-100) and ROI Focus (0-100). (AR-04)
 *
 * Specification: Section 3.4, Section 6.3 (Quality Evaluation Prompt), FR-QG-01 to FR-QG-05
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { callAIWithFallback } from '../_shared/ai-provider/factory.ts';
import { buildQualityEvaluationPrompt } from '../_shared/prompts.ts';
import { jsonResponse, errorResponse } from '../_shared/auth.ts';

// Steps that require quality gate evaluation (Step 1 and 4 are not AI steps)
const AI_STEPS = new Set([
  'hypothesis_generation',
  'interview_architect',
  'gap_analysis',
  'solution_architect',
  'reporting',
]);

// Score thresholds (Section 6.6)
const PASS_THRESHOLD = 60;
const NEEDS_REVIEW_THRESHOLD = 40;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const supabase = createServiceClient();

  // Parse body once — Request body stream can only be consumed once in Deno (BUG-01)
  let body: { node_id: string; project_id: string };
  try {
    body = await req.json() as { node_id: string; project_id: string };
  } catch {
    return errorResponse('Invalid JSON body', 400);
  }

  const { node_id, project_id } = body;

  try {

    if (!node_id || !project_id) {
      return errorResponse('node_id and project_id are required', 422);
    }

    // 1. Fetch the node to evaluate
    const { data: node } = await supabase
      .from('workflow_nodes')
      .select('id, step_type, output_data, edit_source')
      .eq('id', node_id)
      .single();

    if (!node) {
      console.warn(`[evaluate-output] Node not found: ${node_id}`);
      return jsonResponse({ status: 'skipped', reason: 'node_not_found' });
    }

    // 2. Skip evaluation for non-AI steps and human-edited nodes
    if (!AI_STEPS.has(node.step_type)) {
      console.log(`[evaluate-output] Skipping non-AI step: ${node.step_type}`);
      return jsonResponse({ status: 'skipped', reason: 'non_ai_step' });
    }

    if (node.edit_source === 'human_edit') {
      console.log(`[evaluate-output] Skipping human-edit node: ${node_id}`);
      return jsonResponse({ status: 'skipped', reason: 'human_edit' });
    }

    // 3. Create a pending quality gate record
    const { data: gate, error: gateError } = await supabase
      .from('ai_quality_gates')
      .insert({
        node_id,
        project_id,
        status:             'pending',
        evaluation_status:  'evaluating',
        evaluated_async:    true,
      })
      .select()
      .single();

    if (gateError) {
      // Gate may already exist (idempotent evaluation trigger)
      console.warn(`[evaluate-output] Gate insert failed (may already exist):`, gateError.message);

      // Check if gate already evaluated
      const { data: existingGate } = await supabase
        .from('ai_quality_gates')
        .select('evaluation_status')
        .eq('node_id', node_id)
        .single();

      if (existingGate?.evaluation_status === 'completed') {
        return jsonResponse({ status: 'already_evaluated' });
      }
    }

    // 4. Build evaluation prompt
    const outputContent = JSON.stringify(node.output_data).slice(0, 8000);
    const prompt = buildQualityEvaluationPrompt({
      stepType: node.step_type,
      outputContent,
    });

    // 5. Call AI for evaluation
    const aiResponse = await callAIWithFallback(prompt);

    let scores: { pragmatism_score: number; roi_focus_score: number; rationale: string; status: string };
    try {
      scores = JSON.parse(aiResponse.content);
    } catch {
      throw new Error(`Quality evaluator returned invalid JSON: ${aiResponse.content.slice(0, 200)}`);
    }

    // 6. Determine gate status based on thresholds (Section 6.6)
    let gateStatus: string;
    const minScore = Math.min(scores.pragmatism_score, scores.roi_focus_score);

    if (minScore >= PASS_THRESHOLD) {
      gateStatus = 'passed';
    } else if (minScore >= NEEDS_REVIEW_THRESHOLD) {
      gateStatus = 'failed'; // UI shows 'needs_review' badge for 40-59 range
    } else {
      gateStatus = 'failed';
    }

    // 7. Update quality gate record
    const { error: updateError } = await supabase
      .from('ai_quality_gates')
      .update({
        pragmatism_score:  scores.pragmatism_score,
        roi_focus_score:   scores.roi_focus_score,
        rationale:         scores.rationale,
        status:            gateStatus,
        evaluation_status: 'completed',
        evaluated_at:      new Date().toISOString(),
      })
      .eq('node_id', node_id);

    if (updateError) {
      throw new Error(`Failed to update quality gate: ${updateError.message}`);
    }

    console.log(
      `[evaluate-output] Step: ${node.step_type}. Pragmatism: ${scores.pragmatism_score}. ROI: ${scores.roi_focus_score}. Status: ${gateStatus}`
    );

    return jsonResponse({
      status: 'evaluated',
      gate_status: gateStatus,
      pragmatism_score: scores.pragmatism_score,
      roi_focus_score: scores.roi_focus_score,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[evaluate-output] Error:', errorMessage);

    // Best-effort update of gate to reflect failure — use already-parsed node_id (BUG-01)
    if (node_id) {
      await supabase.from('ai_quality_gates')
        .update({ evaluation_status: 'completed', status: 'failed' })
        .eq('node_id', node_id);
    }

    return errorResponse(errorMessage, 500);
  }
});
