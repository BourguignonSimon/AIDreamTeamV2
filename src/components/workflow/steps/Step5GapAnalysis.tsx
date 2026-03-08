/**
 * Step5GapAnalysis — Hypothesis vs. Reality Gap Analysis Panel
 *
 * Compares AI hypotheses against interview transcript findings.
 * Full HEC support: edit, add, delete, annotate, targeted reprocess.
 *
 * Spec: Section 3.3, FR-S5-01 through FR-S5-HEC-07
 */

import React, { useState, ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2, Plus, CheckCircle, XCircle } from 'lucide-react';
import type { ConsultingProject, AnyWorkflowNode, AIQualityGate, PipelineExecution, GapFinding, StepStatus, Step5OutputData } from '@/lib/types';
import { WorkflowStep, getActiveNode } from '@/lib/types';
import { PIPELINE_ACTIONS } from '@/lib/constants';
import { usePipelineAdvance } from '@/hooks/usePipelineAdvance';
import { useStepEditor } from '@/hooks/useStepEditor';
import { useTargetedReprocess } from '@/hooks/useTargetedReprocess';
import AIQualityBadge from '../AIQualityBadge';
import EditableItem from '../editorial/EditableItem';
import SaveEditBar from '../editorial/SaveEditBar';
import ReprocessPanel from '../editorial/ReprocessPanel';

interface Step5Props {
  project: ConsultingProject;
  nodes: AnyWorkflowNode[];
  gates: AIQualityGate[];
  executions: PipelineExecution[];
  isEditor: boolean;
  stepStatus: StepStatus;
}

export default function Step5GapAnalysis({
  project,
  nodes,
  gates,
  executions,
  isEditor,
  stepStatus,
}: Step5Props) {
  const { t } = useTranslation();
  const { advance, isAdvancing } = usePipelineAdvance();

  const activeNode = getActiveNode(nodes, WorkflowStep.GAP_ANALYSIS) as any;
  const gate = activeNode ? gates.find((g) => g.node_id === activeNode.id) : null;

  const editor = useStepEditor<Step5OutputData>(
    WorkflowStep.GAP_ANALYSIS,
    activeNode
  );
  
  const reprocessHook = useTargetedReprocess(project.id, activeNode?.id ?? '');
  const [openReprocessId, setOpenReprocessId] = useState<string | null>(null);
  const [pendingRevisions, setPendingRevisions] = useState<Record<string, unknown>>({});

  const isRunning = stepStatus === 'running';
  const hasOutput = activeNode?.execution_status === 'completed' && editor.draft?.gap_findings;

  async function handleTrigger() {
    await advance({ project_id: project.id, action: PIPELINE_ACTIONS.ANALYZE_GAPS });
  }

  async function handleReprocessItem(itemId: string, instruction?: string) {
    setOpenReprocessId(itemId);
    setPendingRevisions((prev: Record<string, unknown>) => ({ ...prev, [itemId]: undefined }));
    
    const result = await reprocessHook.reprocess({
      step_type: WorkflowStep.GAP_ANALYSIS,
      item_type: 'gap_finding',
      item_id: itemId,
      instruction,
    });

    if (result?.revised_item) {
      setPendingRevisions((prev: Record<string, unknown>) => ({ ...prev, [itemId]: { ...result, item: result.revised_item } }));
    }
  }

  function handleAcceptRevision(itemId: string) {
    const revision = pendingRevisions[itemId] as { item: any, callId: string } | undefined;
    if (revision) {
      editor.applyReprocessResult(itemId, revision.item, revision.callId);
    }
    handleRejectRevision(itemId);
  }

  function handleRejectRevision(itemId: string) {
    setPendingRevisions((prev: Record<string, unknown>) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setOpenReprocessId(null);
  }

  const findings = (editor.draft?.gap_findings ?? []) as GapFinding[];
  const confirmedCount = findings.filter((f) => f.confirmed).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('step5.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('step5.description')}</p>
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
            {hasOutput ? t('common.rerun_ai') : t('step5.trigger')}
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
          <p className="text-sm font-medium text-blue-800">Running gap analysis...</p>
        </div>
      )}

      {hasOutput && (
        <div className="space-y-6">
          {/* Alignment score */}
          <div className="rounded-lg border p-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">{t('step5.alignment_score')}</h3>
              <p className="text-2xl font-bold mt-1">{editor.draft.overall_alignment_score}%</p>
              <p className="text-xs text-muted-foreground">{confirmedCount}/{findings.length} hypotheses confirmed</p>
            </div>
          </div>

          {/* Analyst summary */}
          {editor.draft.analyst_summary && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium mb-2">Analyst Summary</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{editor.draft.analyst_summary}</p>
            </div>
          )}

          {/* Gap findings */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">{t('step5.findings')} ({findings.length})</h3>
              {isEditor && (
                <button
                  onClick={() => editor.addItem({
                    id: `gf_human_${Date.now()}`,
                    bottleneck_id: '',
                    confirmed: true,
                    discrepancy_description: null,
                    evidence_quote: '',
                    revised_severity: 'medium',
                    origin: 'human_added',
                  })}
                  className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('step5.add_finding')}
                </button>
              )}
            </div>

            <div className="space-y-3">
              {findings.map((finding) => (
                <EditableItem
                  key={finding.id}
                  itemId={finding.id}
                  origin={finding.origin}
                  canEdit={isEditor}
                  onDelete={() => editor.deleteItem(finding.id)}
                  onReprocess={() => setOpenReprocessId(openReprocessId === finding.id ? null : finding.id)}
                  isReprocessing={!!reprocessHook.isReprocessing[finding.id]}
                  editChildren={
                    <GapFindingEditForm
                      finding={finding}
                      onChange={(patch) => editor.updateItem(finding.id, patch)}
                    />
                  }
                >
                  <GapFindingView finding={finding} />
                  
                  {openReprocessId === finding.id && (
                    <div className="mt-4 pt-4 border-t border-muted">
                      <ReprocessPanel
                        itemId={finding.id}
                        isLoading={!!reprocessHook.isReprocessing[finding.id]}
                        revisedItem={(pendingRevisions[finding.id] as any)?.item}
                        onSubmit={(instruction) => void handleReprocessItem(finding.id, instruction)}
                        onAccept={() => handleAcceptRevision(finding.id)}
                        onReject={() => handleRejectRevision(finding.id)}
                      />
                    </div>
                  )}
                </EditableItem>
              ))}
            </div>
          </div>
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

function GapFindingView({ finding }: { finding: GapFinding }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {finding.confirmed ? (
          <CheckCircle className="h-4 w-4 text-green-600" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500" />
        )}
        <span className="text-sm font-medium">
          {finding.confirmed ? 'Confirmed' : 'Unconfirmed'}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          finding.revised_severity === 'eliminated' ? 'bg-gray-100 text-gray-600' :
          finding.revised_severity === 'high' ? 'bg-red-50 text-red-700' :
          finding.revised_severity === 'medium' ? 'bg-amber-50 text-amber-700' :
          'bg-green-50 text-green-700'
        }`}>
          {finding.revised_severity}
        </span>
      </div>
      {finding.discrepancy_description && (
        <p className="text-sm text-muted-foreground">{finding.discrepancy_description}</p>
      )}
      {finding.evidence_quote && (
        <blockquote className="border-l-2 border-muted pl-3 text-xs text-muted-foreground italic">
          "{finding.evidence_quote}"
        </blockquote>
      )}
      {finding.consultant_annotation && (
        <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-medium">Annotation: </span>{finding.consultant_annotation}
        </div>
      )}
    </div>
  );
}

function GapFindingEditForm({ finding, onChange }: {
  finding: GapFinding;
  onChange: (patch: Partial<GapFinding>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={finding.confirmed}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ confirmed: e.target.checked })}
          />
          Confirmed
        </label>
        <select
          value={finding.revised_severity}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange({ revised_severity: e.target.value as GapFinding['revised_severity'] })}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="eliminated">Eliminated</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Evidence Quote</label>
        <textarea
          value={finding.evidence_quote}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange({ evidence_quote: e.target.value })}
          rows={2}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Consultant Annotation</label>
        <textarea
          value={finding.consultant_annotation ?? ''}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange({ consultant_annotation: e.target.value })}
          rows={2}
          placeholder="Add supplementary context for Step 6..."
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
    </div>
  );
}
