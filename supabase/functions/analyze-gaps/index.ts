/**
 * analyze-gaps — Step 5: AI Gap Analysis
 *
 * Compares AI-generated hypotheses against interview transcript findings.
 * The transcript is ground truth — hypotheses not supported by it are marked unconfirmed.
 *
 * Specification: Section 9.3, FR-S5-01 through FR-S5-04
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { callAIWithFallback } from '../_shared/ai-provider/factory.ts';
import { buildGapAnalysisPrompt } from '../_shared/prompts.ts';
import { sanitizeTranscriptContent, validateTranscript } from '../_shared/sanitize.ts';
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
    };

    executionId = body.execution_id;
    const { project_id, triggered_by } = body;

    if (!executionId || !project_id) {
      return errorResponse('execution_id and project_id are required', 422);
    }

    await supabase.from('pipeline_executions')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', executionId);

    // 1. Fetch project language
    const { data: project } = await supabase
      .from('consulting_projects')
      .select('language, domain_template:domain_template_id(*)')
      .eq('id', project_id)
      .single();

    if (!project) throw new Error(`Project not found: ${project_id}`);

    // 2. Resolve active Step 2 (hypothesis) node
    const { data: step2Node } = await supabase
      .from('active_workflow_nodes')
      .select('id, output_data')
      .eq('project_id', project_id)
      .eq('step_type', 'hypothesis_generation')
      .single();

    if (!step2Node?.output_data) {
      throw new Error('Hypothesis generation must be completed before gap analysis');
    }

    // 3. Resolve active Step 4 (human breakpoint) node
    const { data: step4Node } = await supabase
      .from('active_workflow_nodes')
      .select('id, output_data, input_data')
      .eq('project_id', project_id)
      .eq('step_type', 'human_breakpoint')
      .single();

    if (!step4Node?.output_data) {
      throw new Error('Interview transcript (Human Breakpoint step) must be submitted before gap analysis');
    }

    // 4. Read transcript content from storage
    const step4Output = step4Node.output_data as { transcript_storage_path: string };
    const { data: transcriptFile } = await supabase.storage
      .from('project-documents')
      .download(step4Output.transcript_storage_path);

    if (!transcriptFile) {
      throw new Error('Could not retrieve transcript file from storage');
    }

    const transcriptText = await transcriptFile.text();

    // 5. Validate and sanitize transcript
    validateTranscript(transcriptText);
    const sanitizedTranscript = sanitizeTranscriptContent(transcriptText);

    // 6. Build and execute gap analysis prompt
    const step2Output = step2Node.output_data as {
      bottlenecks: Array<{
        id: string;
        title: string;
        description: string;
        evidence_basis?: string;
      }>;
    };

    const prompt = buildGapAnalysisPrompt({
      language: project.language,
      bottlenecks: step2Output.bottlenecks,
      transcriptContent: sanitizedTranscript,
      domainContext: (project as any).domain_template?.prompt_injection_context ?? undefined,
    });

    const aiResponse = await callAIWithFallback(prompt);

    let parsedOutput: Record<string, unknown>;
    try {
      parsedOutput = JSON.parse(aiResponse.content);
    } catch {
      throw new Error('AI returned invalid JSON for gap analysis');
    }

    if (!parsedOutput.gap_findings || !Array.isArray(parsedOutput.gap_findings)) {
      throw new Error('AI output missing required gap_findings array');
    }

    // 7. Write node
    const idempotencyKey = `${project_id}:gap_analysis:${executionId}`;

    const { data: nodeId, error: rpcError } = await supabase.rpc('insert_workflow_node', {
      p_project_id:      project_id,
      p_step_type:       'gap_analysis',
      p_input_data:      {
        hypothesis_node_id:       step2Node.id,
        human_breakpoint_node_id: step4Node.id,
      },
      p_output_data:     {
        gap_findings:            parsedOutput.gap_findings,
        new_bottlenecks:         parsedOutput.new_bottlenecks ?? [],
        overall_alignment_score: parsedOutput.overall_alignment_score ?? 0,
        analyst_summary:         parsedOutput.analyst_summary ?? '',
        model_metadata: {
          provider:          aiResponse.provider,
          model_id:          aiResponse.model_id,
          prompt_tokens:     aiResponse.prompt_tokens,
          completion_tokens: aiResponse.completion_tokens,
          latency_ms:        aiResponse.latency_ms,
          called_at:         aiResponse.called_at,
        },
      },
      p_idempotency_key: idempotencyKey,
      p_triggered_by:    triggered_by,
    });

    if (rpcError) throw new Error(`Failed to write gap analysis node: ${rpcError.message}`);

    await supabase.from('pipeline_executions')
      .update({ status: 'completed', completed_at: new Date().toISOString(), node_id: nodeId })
      .eq('id', executionId);

    console.log(`[analyze-gaps] Completed. Node: ${nodeId}`);
    return jsonResponse({ status: 'completed', node_id: nodeId });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[analyze-gaps] Error:', errorMessage);

    if (executionId) {
      await createServiceClient().from('pipeline_executions')
        .update({ status: 'failed', error_message: errorMessage, completed_at: new Date().toISOString() })
        .eq('id', executionId);
    }

    return errorResponse(errorMessage, 500);
  }
});
