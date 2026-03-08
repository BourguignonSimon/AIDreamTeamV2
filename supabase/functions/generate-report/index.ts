/**
 * generate-report — Step 7: AI Report Generation
 *
 * Aggregates all pipeline outputs into a professional consulting report.
 * The report is rendered server-side and saved to the report-exports bucket.
 *
 * Specification: Section 9.3, FR-S7-01 through FR-S7-05
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { callAIWithFallback } from '../_shared/ai-provider/factory.ts';
import { buildReportPrompt } from '../_shared/prompts.ts';
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
      report_config?: {
        language?: string;
        client_name?: string;
        consultant_name?: string;
        include_appendix?: boolean;
      };
    };

    executionId = body.execution_id;
    const { project_id, triggered_by, report_config } = body;

    if (!executionId || !project_id) {
      return errorResponse('execution_id and project_id are required', 422);
    }

    await supabase.from('pipeline_executions')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', executionId);

    // 1. Fetch project metadata
    const { data: project } = await supabase
      .from('consulting_projects')
      .select('client_name, industry, language, domain_template:domain_template_id(*)')
      .eq('id', project_id)
      .single();

    if (!project) throw new Error(`Project not found: ${project_id}`);

    // 2. Resolve active Step 6 (solutions) node
    const { data: step6Node } = await supabase
      .from('active_workflow_nodes')
      .select('id, output_data')
      .eq('project_id', project_id)
      .eq('step_type', 'solution_architect')
      .single();

    if (!step6Node?.output_data) {
      throw new Error('Solution architecture must be completed before report generation');
    }

    // 3. Also resolve Step 5 for gap findings context
    const { data: step5Node } = await supabase
      .from('active_workflow_nodes')
      .select('output_data')
      .eq('project_id', project_id)
      .eq('step_type', 'gap_analysis')
      .single();

    const step6Output = step6Node.output_data as {
      solutions: Array<{
        id: string;
        title: string;
        description: string;
        estimated_roi: { cost_reduction_eur_per_year: number };
      }>;
      total_estimated_roi_eur_per_year: number;
      implementation_roadmap: Array<{ phase: number; title: string; duration_weeks: number }>;
    };

    const step5Output = step5Node?.output_data as {
      gap_findings: Array<{ confirmed: boolean; revised_severity: string; evidence_quote: string }>;
    } | null;

    const language = report_config?.language ?? project.language;
    const consultantName = report_config?.consultant_name ?? 'The Consulting Team';

    // 4. Build and execute report prompt
    const prompt = buildReportPrompt({
      language,
      clientName: report_config?.client_name ?? project.client_name,
      consultantName,
      industry: project.industry,
      solutions: step6Output.solutions,
      gapFindings: step5Output?.gap_findings ?? [],
      roadmap: step6Output.implementation_roadmap,
      totalRoiEur: step6Output.total_estimated_roi_eur_per_year,
      includeAppendix: report_config?.include_appendix ?? true,
      domainContext: (project as any).domain_template?.prompt_injection_context ?? undefined,
    });

    const aiResponse = await callAIWithFallback(prompt);

    let parsedOutput: Record<string, unknown>;
    try {
      parsedOutput = JSON.parse(aiResponse.content);
    } catch {
      throw new Error('AI returned invalid JSON for report');
    }

    // 5. Write node (quality gate fires automatically via pg_net trigger)
    const idempotencyKey = `${project_id}:reporting:${executionId}`;

    const outputData = {
      executive_summary:          parsedOutput.executive_summary ?? '',
      methodology_note:           parsedOutput.methodology_note ?? '',
      key_findings:               parsedOutput.key_findings ?? [],
      solution_overview:          parsedOutput.solution_overview ?? '',
      roadmap_items:              parsedOutput.roadmap_items ?? [],
      detailed_roadmap_markdown:  parsedOutput.detailed_roadmap_markdown ?? '',
      total_roi_summary:          parsedOutput.total_roi_summary ?? {
        total_cost_reduction_eur:     step6Output.total_estimated_roi_eur_per_year,
        total_hours_saved_per_month:  0,
        top_priority_solution_id:     step6Output.solutions[0]?.id ?? '',
      },
      export_formats_available:   ['pdf'],
      generated_at:               new Date().toISOString(),
      model_metadata: {
        provider:          aiResponse.provider,
        model_id:          aiResponse.model_id,
        prompt_tokens:     aiResponse.prompt_tokens,
        completion_tokens: aiResponse.completion_tokens,
        latency_ms:        aiResponse.latency_ms,
        called_at:         aiResponse.called_at,
      },
    };

    const { data: nodeId, error: rpcError } = await supabase.rpc('insert_workflow_node', {
      p_project_id:      project_id,
      p_step_type:       'reporting',
      p_input_data:      {
        solution_architect_node_id: step6Node.id,
        report_config: {
          language,
          client_name:       report_config?.client_name ?? project.client_name,
          consultant_name:   consultantName,
          include_appendix:  report_config?.include_appendix ?? true,
        },
      },
      p_output_data:     outputData,
      p_idempotency_key: idempotencyKey,
      p_triggered_by:    triggered_by,
    });

    if (rpcError) throw new Error(`Failed to write report node: ${rpcError.message}`);

    await supabase.from('pipeline_executions')
      .update({ status: 'completed', completed_at: new Date().toISOString(), node_id: nodeId })
      .eq('id', executionId);

    console.log(`[generate-report] Completed. Node: ${nodeId}`);
    return jsonResponse({ status: 'completed', node_id: nodeId });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[generate-report] Error:', errorMessage);

    if (executionId) {
      await createServiceClient().from('pipeline_executions')
        .update({ status: 'failed', error_message: errorMessage, completed_at: new Date().toISOString() })
        .eq('id', executionId);
    }

    return errorResponse(errorMessage, 500);
  }
});
