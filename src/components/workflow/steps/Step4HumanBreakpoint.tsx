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

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Shield, FileText, Edit, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ConsultingProject, AnyWorkflowNode, StepStatus, Step4OutputData } from '@/lib/types';
import { WorkflowStep, getActiveNode } from '@/lib/types';
import { useStepEditor } from '@/hooks/useStepEditor';
import SaveEditBar from '../editorial/SaveEditBar';

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeNode = getActiveNode(nodes as AnyWorkflowNode[], WorkflowStep.HUMAN_BREAKPOINT);

  const [transcriptText, setTranscriptText] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [stakeholders, setStakeholders] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const editor = useStepEditor<Step4OutputData>(
    WorkflowStep.HUMAN_BREAKPOINT,
    activeNode as AnyWorkflowNode | null
  );

  const isCompleted = stepStatus === 'complete';

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

      // Create Step 4 workflow_node via SECURITY DEFINER RPC
      const { error: rpcError } = await supabase.rpc('insert_workflow_node', {
        p_project_id:      project.id,
        p_step_type:       WorkflowStep.HUMAN_BREAKPOINT,
        p_input_data:      {
          interview_date:          interviewDate,
          stakeholders_interviewed: stakeholders.split(',').map((s) => s.trim()).filter(Boolean),
          notes,
          transcript_paths:        [storagePath],
        },
        p_output_data:     {
          transcript_storage_path: storagePath,
          word_count:              transcriptText.split(/\s+/).length,
          processing_method:       'manual_text',
          uploaded_at:             new Date().toISOString(),
        },
        p_idempotency_key: `${project.id}:human_breakpoint:${Date.now()}`,
        p_triggered_by:    null,
      });

      if (rpcError) throw new Error(rpcError.message);

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
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 text-sm text-green-700 hover:text-green-900"
              >
                <Edit className="h-4 w-4" />
                {t('step4.edit_transcript')}
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
              onChange={(e) => setInterviewDate(e.target.value)}
              className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('step4.stakeholders')}</label>
            <input
              type="text"
              value={stakeholders}
              onChange={(e) => setStakeholders(e.target.value)}
              placeholder={t('step4.stakeholders_placeholder')}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Upload or paste transcript */}
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('step4.paste_transcript')}</label>
            <div className="space-y-2">
              <button
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
                onChange={(e) => void handleFileUpload(e.target.files)}
              />
              <textarea
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
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
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('step4.notes_placeholder')}
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting || !transcriptText.trim()}
            className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
          >
            {submitting ? 'Submitting...' : t('step4.submit')}
          </button>
        </div>
      )}
    </div>
  );
}
