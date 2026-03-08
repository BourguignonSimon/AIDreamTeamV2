/**
 * generate-hypothesis — Step 2: AI Hypothesis Generation
 *
 * Triggered internally by pipeline-orchestrator via pipeline_executions.
 * Analyzes uploaded SME documents and identifies operational bottlenecks.
 *
 * Implements hierarchical summarization for large document sets (Section 6.5).
 * Uses the generic AI step template (Section 9.3).
 */

import { createServiceClient } from '../_shared/supabase.ts';
import { callAIWithFallback } from '../_shared/ai-provider/factory.ts';
import { buildHypothesisPrompt } from '../_shared/prompts.ts';
import { sanitizeDocumentContent, validateDocumentChunks, estimateTokens, TOKEN_BUDGETS, chunkText } from '../_shared/sanitize.ts';
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

    // Mark execution as running
    await supabase.from('pipeline_executions')
      .update({ status: 'running', started_at: new Date().toISOString() })
      .eq('id', executionId);

    // 1. Fetch project metadata
    const { data: project, error: projectError } = await supabase
      .from('consulting_projects')
      .select('id, client_name, industry, country, language, context_summary, domain_template:domain_template_id(*)')
      .eq('id', project_id)
      .single();

    if (projectError || !project) {
      throw new Error(`Project not found: ${project_id}`);
    }

    // 2. Fetch the active Step 1 node (knowledge ingestion output)
    const { data: step1Node } = await supabase
      .from('active_workflow_nodes')
      .select('id, output_data')
      .eq('project_id', project_id)
      .eq('step_type', 'knowledge_ingestion')
      .single();

    if (!step1Node) {
      throw new Error('Knowledge ingestion step has not been completed');
    }

    // 3. Fetch uploaded documents and read content
    const { data: documents } = await supabase
      .from('project_documents')
      .select('storage_path, filename')
      .eq('project_id', project_id)
      .eq('status', 'uploaded');

    if (!documents || documents.length === 0) {
      throw new Error('No documents found for hypothesis generation');
    }

    // 4. Read document content from storage (via signed URLs or direct storage access)
    const documentTexts: string[] = [];
    for (const doc of documents) {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('project-documents')
        .download(doc.storage_path);

      if (downloadError || !fileData) {
        // BUG-06: Warn per document rather than silently skipping
        console.warn(`[generate-hypothesis] Failed to download document "${doc.filename}": ${downloadError?.message ?? 'no data'}`);
        continue;
      }

      const text = await fileData.text();
      documentTexts.push(`[Document: ${doc.filename}]\n${text}`);
    }

    // BUG-06: Hard-fail if every document download failed — an empty context will hallucinate
    if (documentTexts.length === 0) {
      throw new Error('All document downloads failed; cannot generate hypothesis without document content');
    }

    // 5. Validate for prompt injection
    validateDocumentChunks(documentTexts);

    // 6. Token budget management — chunk large document sets
    const budget = TOKEN_BUDGETS.hypothesis_generation;
    const allText = documentTexts.join('\n\n---\n\n');
    const totalTokens = estimateTokens(allText);

    let documentContent: string;
    let modelMetadata;

    if (totalTokens > budget.max_context_tokens) {
      // Hierarchical summarization: summarize each doc, then synthesize
      console.log(`[generate-hypothesis] Large document set (${totalTokens} tokens). Using hierarchical summarization.`);

      const summaries: string[] = [];
      for (const docText of documentTexts) {
        const chunks = chunkText(docText, budget.chunk_size_tokens, budget.overlap_tokens);
        const sanitized = sanitizeDocumentContent(chunks);

        const summarizePrompt = {
          system: `You are a business analyst. Extract key operational facts, processes, and pain points from this document excerpt. Be concise and specific. Respond in ${project.language}.`,
          messages: [{ role: 'user' as const, content: sanitized }],
          max_tokens: 1024,
          temperature: 0.2,
        };

        const summaryResponse = await callAIWithFallback(summarizePrompt);
        summaries.push(summaryResponse.content);
        modelMetadata = summaryResponse;
      }

      documentContent = sanitizeDocumentContent(summaries);
    } else {
      const chunks = chunkText(allText, budget.chunk_size_tokens, budget.overlap_tokens);
      documentContent = sanitizeDocumentContent(chunks);
    }

    // 7. Build and execute hypothesis prompt
    const prompt = buildHypothesisPrompt({
      clientName: project.client_name,
      industry: project.industry,
      country: project.country,
      language: project.language,
      documentContent,
      contextSummary: project.context_summary ?? undefined,
      domainContext: (project as any).domain_template?.prompt_injection_context ?? undefined,
    });

    const aiResponse = await callAIWithFallback(prompt);

    // 8. Parse and validate AI output
    let parsedOutput: Record<string, unknown>;
    try {
      parsedOutput = JSON.parse(aiResponse.content);
    } catch {
      throw new Error(`AI returned invalid JSON: ${aiResponse.content.slice(0, 200)}`);
    }

    if (!parsedOutput.bottlenecks || !Array.isArray(parsedOutput.bottlenecks)) {
      throw new Error('AI output missing required bottlenecks array');
    }

    // 9. Write node via idempotent SECURITY DEFINER RPC
    const idempotencyKey = `${project_id}:hypothesis_generation:${executionId}`;

    const { data: nodeId, error: rpcError } = await supabase.rpc('insert_workflow_node', {
      p_project_id:       project_id,
      p_step_type:        'hypothesis_generation',
      p_input_data:       { knowledge_node_id: step1Node.id },
      p_output_data:      {
        bottlenecks:           parsedOutput.bottlenecks,
        automation_candidates: parsedOutput.automation_candidates ?? [],
        // BUG-07: include Step2OutputData required fields with safe defaults when AI omits them
        executive_summary:     typeof parsedOutput.executive_summary === 'string'
                                 ? parsedOutput.executive_summary
                                 : '',
        total_impact_score:    typeof parsedOutput.total_impact_score === 'number'
                                 ? parsedOutput.total_impact_score
                                 : 0,
        model_metadata: {
          provider:           aiResponse.provider,
          model_id:           aiResponse.model_id,
          prompt_tokens:      aiResponse.prompt_tokens,
          completion_tokens:  aiResponse.completion_tokens,
          latency_ms:         aiResponse.latency_ms,
          called_at:          aiResponse.called_at,
        },
      },
      p_idempotency_key:  idempotencyKey,
      p_triggered_by:     triggered_by,
    });

    if (rpcError) {
      throw new Error(`Failed to write workflow node: ${rpcError.message}`);
    }

    // 10. Mark execution completed
    await supabase.from('pipeline_executions')
      .update({
        status:       'completed',
        completed_at: new Date().toISOString(),
        node_id:      nodeId,
      })
      .eq('id', executionId);

    console.log(`[generate-hypothesis] Completed. Node: ${nodeId}. Project: ${project_id}`);

    return jsonResponse({ status: 'completed', node_id: nodeId });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[generate-hypothesis] Error:`, errorMessage);

    if (executionId) {
      const supabase = createServiceClient();
      await supabase.from('pipeline_executions')
        .update({
          status:        'failed',
          error_message: errorMessage,
          completed_at:  new Date().toISOString(),
        })
        .eq('id', executionId);
    }

    return errorResponse(errorMessage, 500);
  }
});
