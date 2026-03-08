/**
 * generate-solutions — Step 6: AI Solution Architecture
 *
 * Generates automation solutions with ROI estimates from validated gap findings.
 * SME profile is used to ensure solution appropriateness for the client's scale.
 *
 * Specification: Section 9.3, FR-S6-01 through FR-S6-04
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { callAIWithFallback } from '../_shared/ai-provider/factory.ts';
import { buildSolutionsPrompt } from '../_shared/prompts.ts';
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

    // 1. Fetch project + SME profile
    const { data: project } = await supabase
      .from('consulting_projects')
      .select('language, sme_profile, industry, country, domain_template:domain_template_id(*)')
      .eq('id', project_id)
      .single();

    if (!project) throw new Error(`Project not found: ${project_id}`);

    const smeProfile = project.sme_profile ?? {
      industry: project.industry,
      employee_count: 50,
      country: project.country,
    };

    // 2. Resolve active Step 5 (gap analysis) node
    const { data: step5Node } = await supabase
      .from('active_workflow_nodes')
      .select('id, output_data, input_data')
      .eq('project_id', project_id)
      .eq('step_type', 'gap_analysis')
      .single();

    if (!step5Node?.output_data) {
      throw new Error('Gap analysis must be completed before solution architecture');
    }

    // 3. Also resolve Step 2 bottlenecks for reference context
    const { data: step2Node } = await supabase
      .from('active_workflow_nodes')
      .select('output_data')
      .eq('project_id', project_id)
      .eq('step_type', 'hypothesis_generation')
      .single();

    const step5Output = step5Node.output_data as {
      gap_findings: Array<{
        id: string;
        bottleneck_id: string;
        confirmed: boolean;
        revised_severity: string;
        evidence_quote: string;
      }>;
    };

    const step2Output = step2Node?.output_data as {
      bottlenecks: Array<{ id: string; title: string; description: string }>;
    } | null;

    // 4. Build and execute solutions prompt
    const prompt = buildSolutionsPrompt({
      language: project.language,
      smeProfile,
      gapFindings: step5Output.gap_findings,
      bottlenecks: step2Output?.bottlenecks ?? [],
      domainContext: (project as any).domain_template?.prompt_injection_context ?? undefined,
    });

    const aiResponse = await callAIWithFallback(prompt);

    let parsedOutput: Record<string, unknown>;
    try {
      parsedOutput = JSON.parse(aiResponse.content);
    } catch {
      throw new Error('AI returned invalid JSON for solutions');
    }

    if (!parsedOutput.solutions || !Array.isArray(parsedOutput.solutions)) {
      throw new Error('AI output missing required solutions array');
    }

    // 5. Write node
    const idempotencyKey = `${project_id}:solution_architect:${executionId}`;

    const { data: nodeId, error: rpcError } = await supabase.rpc('insert_workflow_node', {
      p_project_id:      project_id,
      p_step_type:       'solution_architect',
      p_input_data:      {
        gap_analysis_node_id: step5Node.id,
        sme_profile:          smeProfile,
      },
      p_output_data:     {
        solutions:                   parsedOutput.solutions,
        total_estimated_roi_eur_per_year: parsedOutput.total_estimated_roi_eur_per_year ?? 0,
        implementation_roadmap:      parsedOutput.implementation_roadmap ?? [],
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

    if (rpcError) throw new Error(`Failed to write solutions node: ${rpcError.message}`);

    await supabase.from('pipeline_executions')
      .update({ status: 'completed', completed_at: new Date().toISOString(), node_id: nodeId })
      .eq('id', executionId);

    console.log(`[generate-solutions] Completed. Node: ${nodeId}`);
    return jsonResponse({ status: 'completed', node_id: nodeId });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[generate-solutions] Error:', errorMessage);

    if (executionId) {
      await createServiceClient().from('pipeline_executions')
        .update({ status: 'failed', error_message: errorMessage, completed_at: new Date().toISOString() })
        .eq('id', executionId);
    }

    return errorResponse(errorMessage, 500);
  }
});
