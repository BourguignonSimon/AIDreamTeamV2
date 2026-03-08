/**
 * generate-interview — Step 3: AI Interview Guide Generation
 *
 * Generates structured interview guides from the validated hypothesis list.
 * The guide is tailored to specified stakeholder roles.
 *
 * Specification: Section 9.3, FR-S3-01, FR-S3-02
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { callAIWithFallback } from '../_shared/ai-provider/factory.ts';
import { buildInterviewPrompt } from '../_shared/prompts.ts';
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

    // Mark as running
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

    // 2. Resolve active Step 2 (hypothesis) node via active_workflow_nodes view
    const { data: step2Node } = await supabase
      .from('active_workflow_nodes')
      .select('id, output_data, input_data')
      .eq('project_id', project_id)
      .eq('step_type', 'hypothesis_generation')
      .single();

    if (!step2Node?.output_data) {
      throw new Error('Hypothesis generation must be completed before interview guide can be created');
    }

    // 3. Fetch step input for stakeholder roles
    // The orchestrator action includes target_stakeholder_roles in the execution record
    const { data: execution } = await supabase
      .from('pipeline_executions')
      .select('*')
      .eq('id', executionId)
      .single();

    // Default stakeholder roles if not specified
    const stakeholderRoles: string[] = ['Operations Manager', 'Team Lead'];

    // 4. Build prompt with bottlenecks from Step 2
    const step2Output = step2Node.output_data as {
      bottlenecks: Array<{ id: string; title: string; description: string; severity: string }>;
    };

    const prompt = buildInterviewPrompt({
      clientName: project.client_name,
      industry: project.industry,
      language: project.language,
      stakeholderRoles,
      bottlenecks: step2Output.bottlenecks,
      domainContext: (project as any).domain_template?.prompt_injection_context ?? undefined,
    });

    // 5. Call AI
    const aiResponse = await callAIWithFallback(prompt);

    let parsedOutput: Record<string, unknown>;
    try {
      parsedOutput = JSON.parse(aiResponse.content);
    } catch {
      throw new Error(`AI returned invalid JSON for interview guide`);
    }

    if (!parsedOutput.questions || !Array.isArray(parsedOutput.questions)) {
      throw new Error('AI output missing required questions array');
    }

    // 6. Write node
    const idempotencyKey = `${project_id}:interview_architect:${executionId}`;

    const { data: nodeId, error: rpcError } = await supabase.rpc('insert_workflow_node', {
      p_project_id:      project_id,
      p_step_type:       'interview_architect',
      p_input_data:      {
        hypothesis_node_id: step2Node.id,
        target_stakeholder_roles: stakeholderRoles,
      },
      p_output_data:     {
        interview_guide_title:    parsedOutput.interview_guide_title,
        introduction_script:      parsedOutput.introduction_script,
        questions:                parsedOutput.questions,
        closing_script:           parsedOutput.closing_script,
        estimated_duration_minutes: parsedOutput.estimated_duration_minutes ?? 60,
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

    if (rpcError) throw new Error(`Failed to write interview node: ${rpcError.message}`);

    await supabase.from('pipeline_executions')
      .update({ status: 'completed', completed_at: new Date().toISOString(), node_id: nodeId })
      .eq('id', executionId);

    console.log(`[generate-interview] Completed. Node: ${nodeId}`);
    return jsonResponse({ status: 'completed', node_id: nodeId });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[generate-interview] Error:', errorMessage);

    if (executionId) {
      await createServiceClient().from('pipeline_executions')
        .update({ status: 'failed', error_message: errorMessage, completed_at: new Date().toISOString() })
        .eq('id', executionId);
    }

    return errorResponse(errorMessage, 500);
  }
});
