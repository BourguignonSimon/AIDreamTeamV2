/**
 * Step7Reporting — Report Generation and Export Panel
 *
 * Generates the final diagnostic report with executive summary,
 * findings, and roadmap. Export as PDF via storage-signer signed URL.
 * Full HEC support on all editable report sections.
 *
 * - FR-S7-HEC-01 [P0]: Inline editing via editor.updateRoot() for scalar sections
 * - FR-S7-HEC-02 [P0]: Targeted AI reprocess per section (executive_summary,
 *   methodology_note) and per roadmap item
 *
 * Spec: Section 3.3, FR-S7-01 through FR-S7-07, INT-EXPORT-01/02
 * Amendment OPERIA-AMD-001: Section 9.5 (Targeted Reprocess)
 */

import React, { useState, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, FileText, Download, CheckCircle, Loader2, RefreshCw } from 'lucide-react';
import type {
  ConsultingProject,
  AnyWorkflowNode,
  AIQualityGate,
  PipelineExecution,
  StepStatus,
  Step7OutputData,
  RoadmapItem,
} from '@/lib/types';
import { WorkflowStep, getActiveNode } from '@/lib/types';
import { PIPELINE_ACTIONS } from '@/lib/constants';
import { usePipelineAdvance } from '@/hooks/usePipelineAdvance';
import { useStepEditor } from '@/hooks/useStepEditor';
import { useTargetedReprocess } from '@/hooks/useTargetedReprocess';
import { supabase } from '@/lib/supabase';
import AIQualityBadge from '../AIQualityBadge';
import SaveEditBar from '../editorial/SaveEditBar';
import ReprocessPanel from '../editorial/ReprocessPanel';

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

  // FR-S7-HEC-02: Track which section's reprocess panel is open and any pending result
  const [openReprocessPanel, setOpenReprocessPanel] = useState<string | null>(null);
  const [pendingRevisions, setPendingRevisions] = useState<Record<string, unknown>>({});

  const activeNode = getActiveNode(nodes as AnyWorkflowNode[], WorkflowStep.REPORTING) as any;
  const gate = activeNode ? gates.find((g) => g.node_id === activeNode.id) : null;

  const editor = useStepEditor<Step7OutputData>(
    WorkflowStep.REPORTING,
    activeNode as import('@/lib/types').WorkflowNode<unknown, Step7OutputData> | null
  );

  const reprocessHook = useTargetedReprocess(project.id, activeNode?.id ?? '');

  const isRunning = stepStatus === 'running';
  const hasOutput = activeNode?.execution_status === 'completed' && editor.draft?.executive_summary;

  async function handleTrigger() {
    await advance({ project_id: project.id, action: PIPELINE_ACTIONS.GENERATE_REPORT });
  }

  /**
   * INT-EXPORT-01/02: Download final report via storage-signer signed URL.
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

      window.open(data.signed_url as string, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }

  /**
   * FR-S7-HEC-02: Trigger a targeted AI reprocess call for a report section.
   * item_id is the section key (e.g. 'executive_summary') for scalar sections,
   * or the item's unique id for roadmap items.
   */
  async function handleReprocess(itemId: string, instruction?: string) {
    setOpenReprocessPanel(itemId);
    setPendingRevisions((prev: Record<string, unknown>) => ({ ...prev, [itemId]: undefined }));

    const result = await reprocessHook.reprocess({
      step_type: WorkflowStep.REPORTING,
      item_type: 'report_section',
      item_id: itemId,
      instruction,
    });

    if (result?.revised_item) {
      setPendingRevisions((prev: Record<string, unknown>) => ({ 
        ...prev, 
        [itemId]: { ...result, item: result.revised_item } 
      }));
    }
  }

  /**
   * Accept an AI-suggested revision for a scalar root field.
   * The revised value comes back as a string for text sections.
   */
  function handleAcceptScalar(fieldKey: keyof Step7OutputData, itemId: string) {
    const revision = pendingRevisions[itemId] as { item: string | object, callId: string } | undefined;
    if (revision) {
      const newVal = typeof revision.item === 'string' ? revision.item : JSON.stringify(revision.item);
      editor.updateRoot({ [fieldKey]: newVal } as Partial<Step7OutputData>);
    }
    handleRejectRevision(itemId);
  }

  /**
   * Accept an AI-suggested revision for a roadmap item (array element).
   */
  function handleAcceptRoadmapItem(itemId: string) {
    const revision = pendingRevisions[itemId] as { item: RoadmapItem, callId: string } | undefined;
    if (revision && typeof revision.item === 'object' && revision.item !== null) {
      editor.applyReprocessResult(itemId, revision.item, revision.callId);
    }
    handleRejectRevision(itemId);
  }

  function handleRejectRevision(itemId: string) {
    setPendingRevisions((prev: Record<string, unknown>) => { const n = { ...prev }; delete n[itemId]; return n; });
    setOpenReprocessPanel(null);
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

      {isEditor && !isRunning && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleTrigger}
            disabled={isAdvancing}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {isAdvancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {hasOutput ? t('common.rerun_ai') : t('step7.trigger')}
          </button>
          {hasOutput && (
            <span className="text-xs text-muted-foreground italic">
              {t('common.rerun_hint')}
            </span>
          )}
        </div>
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

          {/* ── Executive Summary ─────────────────────────────────────── */}
          <ReprocessableSection
            sectionId="executive_summary"
            title={t('step7.executive_summary')}
            content={editor.draft.executive_summary}
            isEditor={isEditor}
            isReprocessing={!!reprocessHook.isReprocessing['executive_summary']}
            isReprocessPanelOpen={openReprocessPanel === 'executive_summary'}
            pendingRevision={(pendingRevisions['executive_summary'] as { item: string } | undefined)?.item}
            onChange={(val) => editor.updateRoot({ executive_summary: val })}
            onRequestReprocess={(instruction) =>
              void handleReprocess('executive_summary', instruction)
            }
            onAccept={() => handleAcceptScalar('executive_summary', 'executive_summary')}
            onReject={() => handleRejectRevision('executive_summary')}
          />

          {/* ── Methodology ───────────────────────────────────────────── */}
          {editor.draft.methodology_note && (
            <ReprocessableSection
              sectionId="methodology_note"
              title={t('step7.methodology')}
              content={editor.draft.methodology_note}
              isEditor={isEditor}
              isReprocessing={!!reprocessHook.isReprocessing['methodology_note']}
              isReprocessPanelOpen={openReprocessPanel === 'methodology_note'}
              pendingRevision={(pendingRevisions['methodology_note'] as { item: string } | undefined)?.item}
              onChange={(val) => editor.updateRoot({ methodology_note: val })}
              onRequestReprocess={(instruction) =>
                void handleReprocess('methodology_note', instruction)
              }
              onAccept={() => handleAcceptScalar('methodology_note', 'methodology_note')}
              onReject={() => handleRejectRevision('methodology_note')}
            />
          )}

          {/* ── Key Findings (read-only list) ─────────────────────────── */}
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

          {/* ── Roadmap Items ─────────────────────────────────────────── */}
          {editor.draft.roadmap_items && editor.draft.roadmap_items.length > 0 && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium mb-3">{t('step7.roadmap')}</h3>
              <div className="space-y-4">
                {editor.draft.roadmap_items.map((item, idx) => (
                  <div key={item.id ?? idx} className="space-y-2">
                    <div className="flex items-start gap-3">
                      <span className="flex-shrink-0 rounded-full bg-primary/10 text-primary text-xs font-bold w-6 h-6 flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
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
                      {/* FR-S7-HEC-02: Reprocess button per roadmap item */}
                      {isEditor && item.id && (
                        <button
                          onClick={() =>
                            openReprocessPanel === item.id
                              ? setOpenReprocessPanel(null)
                              : setOpenReprocessPanel(item.id!)
                          }
                          disabled={!!reprocessHook.isReprocessing[item.id]}
                          title="Ask AI to revise this roadmap item"
                          className="flex-shrink-0 inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-60"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${reprocessHook.isReprocessing[item.id] ? 'animate-spin' : ''}`}
                          />
                          {reprocessHook.isReprocessing[item.id] ? 'Revising...' : t('editorial.reprocess')}
                        </button>
                      )}
                    </div>

                    {/* Roadmap item reprocess panel */}
                    {isEditor && item.id && openReprocessPanel === item.id && (
                      <div className="ml-9">
                        <ReprocessPanel
                          itemId={item.id}
                          isLoading={!!reprocessHook.isReprocessing[item.id]}
                          revisedItem={(pendingRevisions[item.id] as { item: RoadmapItem } | undefined)?.item}
                          onSubmit={(instruction) =>
                            void handleReprocess(item.id!, instruction)
                          }
                          onAccept={() => handleAcceptRoadmapItem(item.id!)}
                          onReject={() => handleRejectRevision(item.id!)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Consultant closing note ───────────────────────────────── */}
          {isEditor && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium mb-2">{t('step7.closing_note')}</h3>
              <textarea
                value={editor.draft.closing_note ?? ''}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                  editor.updateRoot({ closing_note: e.target.value })
                }
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub-components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ReprocessableSection — Editable text section with targeted reprocess support.
 *
 * Used for executive_summary and methodology_note.
 * Shows a textarea (editor mode) or read-only text (viewer mode).
 * When isEditor, also shows a "Reprocess" button that opens the ReprocessPanel.
 */
function ReprocessableSection({
  sectionId,
  title,
  content,
  isEditor,
  isReprocessing,
  isReprocessPanelOpen,
  pendingRevision,
  onChange,
  onRequestReprocess,
  onAccept,
  onReject,
}: {
  sectionId: string;
  title: string;
  content: string;
  isEditor: boolean;
  isReprocessing: boolean;
  isReprocessPanelOpen: boolean;
  pendingRevision: unknown;
  onChange: (val: string) => void;
  onRequestReprocess: (instruction?: string) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      {/* Section header with optional reprocess button */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        {isEditor && (
          <button
            onClick={() => isReprocessPanelOpen ? onReject() : onRequestReprocess(undefined)}
            disabled={isReprocessing}
            title="Ask AI to revise this section"
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${isReprocessing ? 'animate-spin' : ''}`} />
            {isReprocessing ? 'Revising...' : 'Reprocess'}
          </button>
        )}
      </div>

      {/* Editable content */}
      {isEditor ? (
        <textarea
          value={content}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          rows={5}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      ) : (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</p>
      )}

      {/* Reprocess panel (instruction + accept/reject) */}
      {isEditor && isReprocessPanelOpen && (
        <ReprocessPanel
          itemId={sectionId}
          isLoading={isReprocessing}
          revisedItem={pendingRevision}
          onSubmit={onRequestReprocess}
          onAccept={onAccept}
          onReject={onReject}
        />
      )}
    </div>
  );
}
