/**
 * targeted-reprocess — Scoped AI Re-process for Individual Items
 *
 * Handles targeted AI refinement of a single item within a step's output.
 * Called directly by the client (NOT through pipeline-orchestrator). (AR-10)
 *
 * Returns a revised version of the targeted item only — does NOT write to workflow_nodes.
 * The client merges the result into the draft and saves via save-human-edit.
 *
 * Specification: Section 9.5, Amendment OPERIA-AMD-001
 */

import { createUserClient } from '../_shared/supabase.ts';
import { callAIWithFallback } from '../_shared/ai-provider/factory.ts';
import { verifyJWT, handleCORS, errorResponse, jsonResponse, AuthError } from '../_shared/auth.ts';
import type { AIPrompt } from '../_shared/ai-provider/types.ts';

type ItemType = 'bottleneck' | 'question' | 'gap_finding' | 'solution' | 'report_section';

interface ReprocessRequest {
  project_id: string;
  source_node_id: string;
  step_type: string;
  item_type: ItemType;
  item_id: string;
  instruction?: string;
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCORS(req);
  if (corsResponse) return corsResponse;

  try {
    const user = await verifyJWT(req);
    const body = await req.json() as ReprocessRequest;

    const { project_id, source_node_id, step_type, item_type, item_id, instruction } = body;

    if (!project_id || !source_node_id || !step_type || !item_type || !item_id) {
      return errorResponse('project_id, source_node_id, step_type, item_type, and item_id are required', 400);
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createUserClient(authHeader);

    // 1. Verify editor authorization
    const { data: isEditor } = await supabase.rpc('is_project_editor', {
      p_project_id: project_id,
      p_user_id: user.id,
    });
    if (!isEditor) return errorResponse('Editor access required', 403);

    // 2. Fetch the source node
    const { data: sourceNode } = await supabase
      .from('workflow_nodes')
      .select('output_data, input_data, step_type')
      .eq('id', source_node_id)
      .single();

    if (!sourceNode) return errorResponse('Source node not found', 404);

    // 3. Resolve the specific item from output_data
    const currentItem = resolveItemById(sourceNode.output_data, item_type, item_id);
    if (!currentItem) return errorResponse(`Item ${item_id} not found in node output`, 404);

    // 4. Resolve supporting context for the re-process call
    const context = await resolveReprocessContext(supabase, project_id, step_type, sourceNode.input_data);

    // 5. Build targeted prompt
    const prompt = buildTargetedReprocessPrompt({
      step_type,
      item_type,
      item_id,
      currentItem,
      context,
      instruction,
    });

    // 6. Call AI with fallback
    const aiResponse = await callAIWithFallback(prompt);

    let revisedItem: unknown;
    if (item_type === 'report_section') {
      revisedItem = aiResponse.content; // Plain text for report sections
    } else {
      try {
        revisedItem = JSON.parse(aiResponse.content);
        // Preserve the item id and mark as ai_reprocessed
        if (typeof revisedItem === 'object' && revisedItem !== null) {
          (revisedItem as Record<string, unknown>).id = item_id;
          (revisedItem as Record<string, unknown>).origin = 'ai_reprocessed';
        }
      } catch {
        return errorResponse('AI returned invalid JSON for reprocessed item', 500);
      }
    }

    // 7. Log the call for audit trail
    const { data: callRecord } = await supabase
      .from('targeted_reprocess_calls')
      .insert({
        project_id,
        source_node_id,
        step_type,
        triggered_by:   user.id,
        item_type,
        item_id,
        instruction:    instruction ?? null,
        input_snapshot: currentItem,
        ai_response:    revisedItem,
        model_metadata: {
          provider:          aiResponse.provider,
          model_id:          aiResponse.model_id,
          prompt_tokens:     aiResponse.prompt_tokens,
          completion_tokens: aiResponse.completion_tokens,
          latency_ms:        aiResponse.latency_ms,
          called_at:         aiResponse.called_at,
        },
        applied: false,
      })
      .select('id')
      .single();

    console.log(`[targeted-reprocess] ${item_type} ${item_id} reprocessed. Call ID: ${callRecord?.id}`);

    // 8. Return revised item + call ID (client uses call_id when saving via save-human-edit)
    return jsonResponse({
      call_id:      callRecord?.id,
      revised_item: revisedItem,
    });

  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[targeted-reprocess] Error:', errorMessage);
    return errorResponse(errorMessage, 500);
  }
});

/**
 * Finds an item by its id field within the output_data structure.
 */
function resolveItemById(
  outputData: Record<string, unknown>,
  itemType: ItemType,
  itemId: string
): unknown | null {
  const arrayKeys: Record<ItemType, string> = {
    bottleneck:     'bottlenecks',
    question:       'questions',
    gap_finding:    'gap_findings',
    solution:       'solutions',
    report_section: 'sections',
  };

  if (itemType === 'report_section') {
    // Report sections are keyed directly in output_data
    return outputData[itemId] ?? null;
  }

  const arrayKey = arrayKeys[itemType];
  const array = outputData[arrayKey];
  if (!Array.isArray(array)) return null;

  return array.find((item: Record<string, unknown>) => item.id === itemId) ?? null;
}

/**
 * Builds context needed for the targeted re-process prompt based on step type.
 */
async function resolveReprocessContext(
  supabase: ReturnType<typeof createUserClient>,
  projectId: string,
  stepType: string,
  inputData: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const context: Record<string, unknown> = {};

  if (stepType === 'interview_architect' || stepType === 'hypothesis_generation') {
    // Provide bottleneck list for question re-processing
    const { data: step2Node } = await supabase
      .from('active_workflow_nodes')
      .select('output_data')
      .eq('project_id', projectId)
      .eq('step_type', 'hypothesis_generation')
      .single();

    context.bottlenecks = (step2Node?.output_data as Record<string, unknown>)?.bottlenecks ?? [];
  }

  if (stepType === 'gap_analysis') {
    context.linkedBottleneck = inputData?.hypothesis_node_id ? 'Available from hypothesis' : null;
    context.transcriptExcerpt = 'Available from human breakpoint node';
  }

  if (stepType === 'solution_architect') {
    const { data: project } = await supabase
      .from('consulting_projects')
      .select('sme_profile')
      .eq('id', projectId)
      .single();
    context.smeProfile = project?.sme_profile;
  }

  if (stepType === 'reporting') {
    const { data: project } = await supabase
      .from('consulting_projects')
      .select('client_name, industry, language')
      .eq('id', projectId)
      .single();
    context.reportContext = project;
    context.language = project?.language;
  }

  return context;
}

/**
 * Builds the targeted prompt for a specific item type (Section 9.5).
 */
function buildTargetedReprocessPrompt(params: {
  step_type: string;
  item_type: ItemType;
  item_id: string;
  currentItem: unknown;
  context: Record<string, unknown>;
  instruction?: string;
}): AIPrompt {
  const instructionClause = params.instruction
    ? `\n\nEditor instruction: "${params.instruction}"`
    : '';

  const prompts: Record<ItemType, AIPrompt> = {
    bottleneck: {
      system: `You are revising a single operational bottleneck identified during an SME diagnostic.
Return ONLY a revised JSON object for this one bottleneck, maintaining its id field and setting origin to "ai_reprocessed".
Respond with nothing else — no preamble, no explanation.`,
      messages: [{
        role: 'user',
        content: `Current bottleneck:\n${JSON.stringify(params.currentItem, null, 2)}

Supporting context:\n${JSON.stringify(params.context.bottlenecks)}${instructionClause}

Return the revised bottleneck as a JSON object with the same schema.`,
      }],
      response_format: 'json',
    },

    question: {
      system: `You are revising a single interview question for an SME stakeholder interview guide.
Return ONLY the revised JSON object for this one question, maintaining its id field and setting origin to "ai_reprocessed".`,
      messages: [{
        role: 'user',
        content: `Current question:\n${JSON.stringify(params.currentItem, null, 2)}

Available bottlenecks:\n${JSON.stringify(params.context.bottlenecks)}${instructionClause}

Return the revised question as a JSON object with the same schema.`,
      }],
      response_format: 'json',
    },

    gap_finding: {
      system: `You are revising a single gap finding from a consulting gap analysis.
Return ONLY the revised JSON object for this one finding, maintaining its id field and setting origin to "ai_reprocessed".`,
      messages: [{
        role: 'user',
        content: `Current finding:\n${JSON.stringify(params.currentItem, null, 2)}${instructionClause}

Return the revised finding as a JSON object with the same schema.`,
      }],
      response_format: 'json',
    },

    solution: {
      system: `You are revising a single automation solution recommendation for an SME client.
Return ONLY the revised JSON object for this one solution, maintaining its id field and setting origin to "ai_reprocessed".`,
      messages: [{
        role: 'user',
        content: `Current solution:\n${JSON.stringify(params.currentItem, null, 2)}

SME profile:\n${JSON.stringify(params.context.smeProfile)}${instructionClause}

Return the revised solution as a JSON object with the same schema.`,
      }],
      response_format: 'json',
    },

    report_section: {
      system: `You are revising a single section of a consulting report for an SME client.
Return ONLY the revised text content for this section — no JSON wrapper, just the text.`,
      messages: [{
        role: 'user',
        content: `Section name: ${params.item_id}

Current content:\n${params.currentItem}

Project context:\n${JSON.stringify(params.context.reportContext)}${instructionClause}

Return the revised section text in ${params.context.language ?? 'English'}.`,
      }],
      response_format: 'text',
    },
  };

  return prompts[params.item_type];
}
