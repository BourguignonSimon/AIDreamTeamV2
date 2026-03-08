/**
 * assistant-analysis — Scoped AI Assistance for Consultants
 *
 * Provides on-demand AI analysis of human-authored content (e.g., transcripts).
 * Unlike pipeline steps, this does not produce a versioned node; it returns
 * text analysis that the consultant can choose to incorporate as notes.
 *
 * FR-S4-HEC-04 [P1]
 */

import { createUserClient } from '../_shared/supabase.ts';
import { callAIWithFallback } from '../_shared/ai-provider/factory.ts';
import { verifyJWT, handleCORS, errorResponse, jsonResponse, AuthError } from '../_shared/auth.ts';

Deno.serve(async (req: Request) => {
  const corsResponse = handleCORS(req);
  if (corsResponse) return corsResponse;

  try {
    const user = await verifyJWT(req);
    const { project_id, content, task, instruction } = await req.json();

    if (!project_id || !content || !task) {
      return errorResponse('project_id, content, and task are required', 400);
    }

    const authHeader = req.headers.get('Authorization')!;
    const supabase = createUserClient(authHeader);

    // 1. Verify editor authorization
    const { data: isEditor } = await supabase.rpc('is_project_editor', {
      p_project_id: project_id,
      p_user_id: user.id,
    });
    if (!isEditor) return errorResponse('Editor access required', 403);

    // 2. Build the prompt based on the task
    const systemPrompts: Record<string, string> = {
      summarize: 'You are a consulting analyst. Summarize the following interview transcript, highlighting the most critical pain points and stakeholder concerns.',
      extract_actions: 'You are a consulting analyst. Extract all specific action items, commitments, and next steps mentioned in the following transcript.',
      identify_risks: 'You are a consulting analyst. Identify all risks, blockers, or red flags mentioned in the following transcript regarding automation adoption.',
    };

    const prompt = {
      system: systemPrompts[task] || 'You are a consulting analyst helping a senior consultant analyze interview data.',
      messages: [
        {
          role: 'user',
          content: `Transcript Content:\n${content}\n\nAdditional Instruction: ${instruction || 'None'}\n\nProvide the analysis in clear, professional bullet points.`,
        },
      ],
      temperature: 0.2,
    };

    // 3. Call AI
    const aiResponse = await callAIWithFallback(prompt);

    console.log(`[assistant-analysis] Task: ${task} completed for Project: ${project_id}`);

    return jsonResponse({
      analysis: aiResponse.content,
      task,
    });

  } catch (error) {
    if (error instanceof AuthError) return errorResponse(error.message, error.status);
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[assistant-analysis] Error:', errorMessage);
    return errorResponse(errorMessage, 500);
  }
});
