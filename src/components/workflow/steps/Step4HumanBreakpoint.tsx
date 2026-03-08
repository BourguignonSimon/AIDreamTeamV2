/**
 * Step4HumanBreakpoint — Interview Transcript Submission Panel
 *
 * The non-automatable human step. Requires explicit consultant action.
 * Accepts transcript upload or paste. Supports transcript editing after submission.
 *
 * This step cannot be bypassed or automated — SG-02, FR-S4-01
 *
 * Spec: Section 3.3, FR-S4-01 through FR-S4-HEC-06
 */

import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, CheckCircle, Sparkles, Shield, Edit, Upload, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ConsultingProject, AnyWorkflowNode, StepStatus, Step4OutputData, Step4InputData } from '@/lib/types';
import { WorkflowStep, getActiveNode } from '@/lib/types';
import { useStepEditor } from '@/hooks/useStepEditor';


interface Step4Props {
  project: ConsultingProject;
  nodes: AnyWorkflowNode[];
  isEditor: boolean;
  stepStatus: StepStatus;
  onSubmitted: () => void;
}

export default function Step4HumanBreakpoint({
  project,
  nodes,
  isEditor,
  stepStatus,
  onSubmitted,
}: Step4Props) {
  const { t } = useTranslation();

  const activeNode = getActiveNode(nodes as AnyWorkflowNode[], WorkflowStep.HUMAN_BREAKPOINT) as any;

  const [transcriptText, setTranscriptText] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [stakeholders, setStakeholders] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [analyzingAI, setAnalyzingAI] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [activeAnalysisTask, setActiveAnalysisTask] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useStepEditor<Step4OutputData>(
    WorkflowStep.HUMAN_BREAKPOINT,
    activeNode
  );

  /**
   * FR-S4-HEC-01 [P0]: Pre-populate the edit form from the previously
   * submitted node data before toggling the editing state.
   *
   * Metadata (date, stakeholders, notes) comes from activeNode.input_data.
   * Transcript text is fetched from Supabase Storage via the path in output_data.
   */
  const handleStartEditing = useCallback(async () => {
    const inputData = activeNode?.input_data as Step4InputData | null;
    const outputData = activeNode?.output_data as Step4OutputData | null;

    // Seed metadata fields immediately from input_data
    if (inputData) {
      setInterviewDate(inputData.interview_date ?? '');
      setStakeholders((inputData.stakeholders_interviewed ?? []).join(', '));
      setNotes(inputData.notes ?? '');
    }

    // Fetch transcript text from storage (async)
    const storagePath = outputData?.transcript_storage_path;
    if (storagePath) {
      setIsLoadingTranscript(true);
      try {
        const { data, error } = await supabase.storage
          .from('project-documents')
          .download(storagePath);
        if (!error && data) {
          setTranscriptText(await data.text());
        }
      } catch {
        // Non-fatal: user can re-paste the transcript
      } finally {
        setIsLoadingTranscript(false);
      }
    }

    setIsEditing(true);
  }, [activeNode]);

  const isCompleted = stepStatus === 'complete';

  /**
   * FR-S4-HEC-04 [P1]: Assistive AI call on the transcript.
   */
  const handleRequestAIAnalysis = useCallback(async (task: string) => {
    if (!transcriptText.trim()) return;
    setAnalyzingAI(true);
    setSubmitError(null);
    setActiveAnalysisTask(task);

    try {
      const { data, error } = await supabase.functions.invoke('assistant-analysis', {
        body: {
          project_id: project.id,
          content: transcriptText,
          task,
        }
      });

      if (error) throw error;
      setAiAnalysisResult(data.analysis);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'AI Analysis failed');
    } finally {
      setAnalyzingAI(false);
    }
  }, [transcriptText, project.id]);

  async function handleFileUpload(files: FileList | null) {
    if (!files?.[0]) return;
    const text = await files[0].text();
    setTranscriptText(text);
  }

  async function handleSubmit() {
    if (!transcriptText.trim()) {
      setSubmitError('Transcript text is required');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Upload transcript to storage
      const storagePath = `${project.id}/transcript-${Date.now()}.txt`;
      const { error: storageError } = await supabase.storage
        .from('project-documents')
        .upload(storagePath, new Blob([transcriptText], { type: 'text/plain' }));

      if (storageError) throw new Error(storageError.message);

      const input_data: Step4InputData = {
        interview_date: interviewDate,
        stakeholders_interviewed: stakeholders.split(',').map((s: string) => s.trim()).filter(Boolean),
        notes,
        transcript_paths: [storagePath],
      };

      const output_data: Step4OutputData = {
        transcript_storage_path: storagePath,
        word_count: transcriptText.split(/\s+/).length,
        processing_method: 'manual_text',
        uploaded_at: new Date().toISOString(),
      };

      if (isEditing && activeNode) {
        // FR-S4-HEC-02: Use save-human-edit for corrections
        const { error: saveError } = await supabase.functions.invoke('save-human-edit', {
          body: {
            project_id: project.id,
            step_type: WorkflowStep.HUMAN_BREAKPOINT,
            source_node_id: activeNode.id,
            output_data,
          }
        });
        if (saveError) throw new Error(saveError.message);
        
        setIsEditing(false);
      } else {
        // Initial submission triggers via pipeline-orchestrator (AR-01)
        const { error: orchError } = await supabase.functions.invoke('pipeline-orchestrator', {
          body: {
            project_id: project.id,
            action: 'complete_human_breakpoint',
            payload: { input_data, output_data }
          }
        });
        if (orchError) throw new Error(orchError.message);
      }

      onSubmitted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Human Breakpoint Banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">{t('step4.badge')}</h3>
            <p className="text-sm text-amber-700 mt-0.5">{t('step4.badge_desc')}</p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold">{t('step4.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t('step4.description')}</p>
      </div>

      {/* Completed state */}
      {isCompleted && !isEditing && (
        <div className="rounded-lg border bg-green-50 border-green-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm font-medium text-green-800">Transcript submitted</span>
            </div>
            {isEditor && (
              <button
                onClick={() => void handleStartEditing()}
                disabled={isLoadingTranscript}
                className="flex items-center gap-1.5 text-sm text-green-700 hover:text-green-900 disabled:opacity-60"
              >
                {isLoadingTranscript
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Edit className="h-4 w-4" />}
                {isLoadingTranscript ? 'Loading...' : t('step4.edit_transcript')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Submission form */}
      {(!isCompleted || isEditing) && isEditor && (
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('step4.interview_date')}</label>
            <input
              type="date"
              value={interviewDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInterviewDate(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('step4.stakeholders')}</label>
            <input
              type="text"
              value={stakeholders}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStakeholders(e.target.value)}
              placeholder={t('step4.stakeholders_placeholder')}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Upload or paste transcript */}
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('step4.paste_transcript')}</label>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <Upload className="h-4 w-4" />
                {t('step4.upload_transcript')}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".txt,.docx"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => void handleFileUpload(e.target.files)}
              />
              <textarea
                value={transcriptText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setTranscriptText(e.target.value)}
                placeholder={t('step4.transcript_placeholder')}
                rows={12}
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('step4.notes')}</label>
            <textarea
              value={notes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              placeholder={t('step4.notes_placeholder')}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* FR-S4-HEC-04: Assistive AI Integration */}
          <div className="rounded-lg border bg-slate-50 p-4 border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-purple-600" />
              <h4 className="text-sm font-semibold text-slate-900">{t('step4.ai_assistant')}</h4>
            </div>
            
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'summarize', label: t('step4.tasks.summarize') },
                { id: 'extract_actions', label: t('step4.tasks.actions') },
                { id: 'identify_risks', label: t('step4.tasks.risks') }
              ].map(task => (
                <button
                  key={task.id}
                  onClick={() => void handleRequestAIAnalysis(task.id)}
                  disabled={analyzingAI || !transcriptText.trim()}
                  className="px-3 py-1.5 rounded-full border bg-white text-xs font-medium hover:border-purple-300 hover:text-purple-700 transition-all disabled:opacity-50"
                >
                  {analyzingAI && activeAnalysisTask === task.id ? (
                    <Loader2 className="h-3 w-3 animate-spin inline mr-1" />
                  ) : null}
                  {task.label}
                </button>
              ))}
            </div>

            {aiAnalysisResult && (
              <div className="mt-4 space-y-3">
                <div className="rounded-md bg-white border p-3 text-xs leading-relaxed text-slate-700 whitespace-pre-wrap">
                  {aiAnalysisResult}
                </div>
                <button
                  onClick={() => {
                    const separator = notes ? '\n\n' : '';
                    setNotes(`${notes}${separator}-- AI Analysis (${activeAnalysisTask}) --\n${aiAnalysisResult}`);
                    setAiAnalysisResult(null);
                    setActiveAnalysisTask(null);
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium text-purple-700 hover:text-purple-900"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('step4.append_to_notes')}
                </button>
              </div>
            )}
          </div>

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting || !transcriptText.trim()}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('step4.submitting')}
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  {isEditing ? t('common.save_changes') : t('step4.submit')}
                </>
              )}
            </button>
            {isEditing && (
              <button
                onClick={() => setIsEditing(false)}
                disabled={submitting}
                className="px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
