/**
 * Step7Reporting — Report Generation and Export Panel
 *
 * Generates the final diagnostic report with executive summary,
 * findings, and roadmap. Export as PDF via storage-signer signed URL.
 * Full HEC support on all editable report sections.
 *
 * Spec: Section 3.3, FR-S7-01 through FR-S7-07, INT-EXPORT-01/02
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Download, Loader2, FileText, CheckCircle } from 'lucide-react';
import type {
  ConsultingProject,
  AnyWorkflowNode,
  AIQualityGate,
  PipelineExecution,
  StepStatus,
  Step7OutputData,
} from '@/lib/types';
import { WorkflowStep, getActiveNode } from '@/lib/types';
import { PIPELINE_ACTIONS } from '@/lib/constants';
import { usePipelineAdvance } from '@/hooks/usePipelineAdvance';
import { useStepEditor } from '@/hooks/useStepEditor';
import { supabase } from '@/lib/supabase';
import AIQualityBadge from '../AIQualityBadge';
import SaveEditBar from '../editorial/SaveEditBar';

interface Step7Props {
  project: ConsultingProject;
  nodes: AnyWorkflowNode[];
  gates: AIQualityGate[];
  executions: PipelineExecution[];
  isEditor: boolean;
  stepStatus: StepStatus;
}

export default function Step7Reporting({
  project,
  nodes,
  gates,
  executions,
  isEditor,
  stepStatus,
}: Step7Props) {
  const { t } = useTranslation();
  const { advance, isAdvancing } = usePipelineAdvance();
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const activeNode = getActiveNode(nodes as AnyWorkflowNode[], WorkflowStep.REPORTING);
  const gate = activeNode ? gates.find((g) => g.node_id === activeNode.id) : null;

  const editor = useStepEditor<Step7OutputData>(
    WorkflowStep.REPORTING,
    activeNode as AnyWorkflowNode | null
  );

  const isRunning = stepStatus === 'running';
  const hasOutput = activeNode?.execution_status === 'completed' && editor.draft?.executive_summary;

  async function handleTrigger() {
    await advance({ project_id: project.id, action: PIPELINE_ACTIONS.GENERATE_REPORT });
  }

  /**
   * INT-EXPORT-01/02: Download final report via storage-signer signed URL.
   * storage_path is the path within 'report-exports' bucket.
   */
  async function handleExport() {
    if (!editor.draft?.report_storage_path) return;
    setIsExporting(true);
    setExportError(null);

    try {
      const { data, error } = await supabase.functions.invoke('storage-signer', {
        body: {
          bucket: 'report-exports',
          storage_path: editor.draft.report_storage_path,
          project_id: project.id,
        },
      });

      if (error || !data?.signed_url) {
        throw new Error(error?.message ?? 'Failed to generate download link');
      }

      // Open signed URL in new tab for download
      window.open(data.signed_url as string, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('step7.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('step7.description')}</p>
        </div>
        {gate && <AIQualityBadge gate={gate} showScores />}
      </div>

      {!hasOutput && !isRunning && isEditor && (
        <button
          onClick={handleTrigger}
          disabled={isAdvancing}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isAdvancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {t('step7.trigger')}
        </button>
      )}

      {isRunning && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-blue-800">Generating diagnostic report...</p>
        </div>
      )}

      {hasOutput && (
        <div className="space-y-6">
          {/* Report ready banner */}
          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">{t('step7.report_ready')}</p>
                {editor.draft.generated_at && (
                  <p className="text-xs text-green-600 mt-0.5">
                    Generated {new Date(editor.draft.generated_at).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
            {editor.draft.report_storage_path && (
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60 transition-colors"
              >
                {isExporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {t('step7.download_pdf')}
              </button>
            )}
          </div>

          {exportError && (
            <p className="text-sm text-destructive">{exportError}</p>
          )}

          {/* Executive Summary */}
          <ReportSection
            title={t('step7.executive_summary')}
            content={editor.draft.executive_summary}
            isEditor={isEditor}
            onChange={(val) => editor.updateItem('root', { executive_summary: val })}
          />

          {/* Methodology */}
          {editor.draft.methodology_note && (
            <ReportSection
              title={t('step7.methodology')}
              content={editor.draft.methodology_note}
              isEditor={isEditor}
              onChange={(val) => editor.updateItem('root', { methodology_note: val })}
            />
          )}

          {/* Key Findings */}
          {editor.draft.key_findings && editor.draft.key_findings.length > 0 && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium mb-3">{t('step7.key_findings')}</h3>
              <ul className="space-y-2">
                {editor.draft.key_findings.map((finding, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Roadmap */}
          {editor.draft.roadmap_items && editor.draft.roadmap_items.length > 0 && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium mb-3">{t('step7.roadmap')}</h3>
              <div className="space-y-3">
                {editor.draft.roadmap_items.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <span className="flex-shrink-0 rounded-full bg-primary/10 text-primary text-xs font-bold w-6 h-6 flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium">{item.title}</p>
                      {item.timeline && (
                        <p className="text-xs text-muted-foreground">{item.timeline}</p>
                      )}
                      {item.expected_roi_eur && (
                        <p className="text-xs text-green-600">
                          €{item.expected_roi_eur.toLocaleString()} expected annual value
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Consultant closing note */}
          {isEditor && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium mb-2">{t('step7.closing_note')}</h3>
              <textarea
                value={editor.draft.closing_note ?? ''}
                onChange={(e) => editor.updateItem('root', { closing_note: e.target.value })}
                rows={4}
                placeholder="Add a personalized closing note for the client..."
                className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}
          {!isEditor && editor.draft.closing_note && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium mb-2">{t('step7.closing_note')}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {editor.draft.closing_note}
              </p>
            </div>
          )}
        </div>
      )}

      {isEditor && (
        <SaveEditBar
          isDirty={editor.isDirty}
          isSaving={editor.isSaving}
          dirtyCount={editor.dirtyItems.size}
          onSave={() => void editor.save()}
          onDiscard={editor.discard}
        />
      )}
    </div>
  );
}

function ReportSection({
  title,
  content,
  isEditor,
  onChange,
}: {
  title: string;
  content: string;
  isEditor: boolean;
  onChange: (val: string) => void;
}) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-sm font-medium mb-2">{title}</h3>
      {isEditor ? (
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      ) : (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</p>
      )}
    </div>
  );
}
