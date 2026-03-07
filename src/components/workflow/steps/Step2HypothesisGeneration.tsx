/**
 * Step2HypothesisGeneration — Bottleneck Identification Panel
 *
 * Triggers AI hypothesis generation and displays/edits the resulting bottlenecks.
 * Implements full Human Editorial Controls (HEC) per Amendment OPERIA-AMD-001.
 *
 * Spec: Section 3.3, FR-S2-01 through FR-S2-HEC-07
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Plus, Loader2 } from 'lucide-react';
import type { ConsultingProject, AnyWorkflowNode, AIQualityGate, PipelineExecution, OperationalBottleneck, StepStatus } from '@/lib/types';
import { WorkflowStep, getActiveNode } from '@/lib/types';
import { PIPELINE_ACTIONS } from '@/lib/constants';
import { usePipelineAdvance } from '@/hooks/usePipelineAdvance';
import { useStepEditor } from '@/hooks/useStepEditor';
import { useTargetedReprocess } from '@/hooks/useTargetedReprocess';
import type { Step2OutputData } from '@/lib/types';
import AIQualityBadge from '../AIQualityBadge';
import EditableItem from '../editorial/EditableItem';
import ReprocessPanel from '../editorial/ReprocessPanel';
import SaveEditBar from '../editorial/SaveEditBar';
import { supabase } from '@/lib/supabase';

interface Step2Props {
  project: ConsultingProject;
  nodes: AnyWorkflowNode[];
  gates: AIQualityGate[];
  executions: PipelineExecution[];
  isEditor: boolean;
  stepStatus: StepStatus;
}

export default function Step2HypothesisGeneration({
  project,
  nodes,
  gates,
  executions,
  isEditor,
  stepStatus,
}: Step2Props) {
  const { t } = useTranslation();
  const { advance, isAdvancing, advanceError } = usePipelineAdvance();

  const activeNode = getActiveNode(nodes as AnyWorkflowNode[], WorkflowStep.HYPOTHESIS_GENERATION);
  const gate = activeNode ? gates.find((g) => g.node_id === activeNode.id) : null;

  const editor = useStepEditor<Step2OutputData>(
    WorkflowStep.HYPOTHESIS_GENERATION,
    activeNode as AnyWorkflowNode | null
  );

  const reprocessHook = useTargetedReprocess(project.id, activeNode?.id ?? '');
  const [reprocessingItemId, setReprocessingItemId] = useState<string | null>(null);
  const [reprocessResult, setReprocessResult] = useState<{ itemId: string; callId: string; item: unknown } | null>(null);

  const isRunning = stepStatus === 'running';
  const hasOutput = activeNode?.execution_status === 'completed' && editor.draft?.bottlenecks;

  async function handleTrigger() {
    await advance({ project_id: project.id, action: PIPELINE_ACTIONS.GENERATE_HYPOTHESIS });
  }

  async function handleReprocessItem(bottleneck: OperationalBottleneck) {
    setReprocessingItemId(bottleneck.id);
    try {
      const result = await reprocessHook.reprocess({
        step_type: WorkflowStep.HYPOTHESIS_GENERATION,
        item_type: 'bottleneck',
        item_id: bottleneck.id,
      });
      setReprocessResult({ itemId: bottleneck.id, callId: result.call_id, item: result.revised_item });
    } finally {
      setReprocessingItemId(null);
    }
  }

  async function handleOverrideGate(reason: string) {
    if (!gate) return;
    await supabase.from('ai_quality_gates').update({
      status: 'overridden',
      overridden_by: (await supabase.auth.getUser()).data.user?.id,
      override_reason: reason,
    }).eq('id', gate.id);
  }

  const bottlenecks = (editor.draft?.bottlenecks ?? []) as OperationalBottleneck[];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('step2.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('step2.description')}</p>
        </div>
        {gate && <AIQualityBadge gate={gate} showScores onOverride={handleOverrideGate} />}
      </div>

      {/* Trigger button */}
      {isEditor && !hasOutput && !isRunning && (
        <button
          onClick={handleTrigger}
          disabled={isAdvancing}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isAdvancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {t('step2.trigger')}
        </button>
      )}

      {/* Running state */}
      {isRunning && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <div>
            <p className="text-sm font-medium text-blue-800">Generating hypotheses...</p>
            <p className="text-xs text-blue-600">This may take up to 30 seconds. The page will update automatically.</p>
          </div>
        </div>
      )}

      {/* Bottlenecks list */}
      {hasOutput && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">{t('step2.bottlenecks')} ({bottlenecks.length})</h3>
            {isEditor && (
              <div className="flex gap-2">
                <button
                  onClick={() => editor.addItem({
                    id: `b_human_${Date.now()}`,
                    title: 'New Bottleneck',
                    description: '',
                    severity: 'medium',
                    affected_processes: [],
                    automation_potential: 'medium',
                    origin: 'human_added',
                  })}
                  className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('step2.add_bottleneck')}
                </button>
                <button
                  onClick={handleTrigger}
                  disabled={isAdvancing}
                  className="rounded border px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-60"
                >
                  {t('step2.rerun')}
                </button>
              </div>
            )}
          </div>

          {bottlenecks.map((bottleneck) => (
            <EditableItem
              key={bottleneck.id}
              itemId={bottleneck.id}
              origin={bottleneck.origin}
              canEdit={isEditor}
              onDelete={() => editor.deleteItem(bottleneck.id)}
              onReprocess={() => void handleReprocessItem(bottleneck)}
              isReprocessing={reprocessingItemId === bottleneck.id}
              editChildren={
                <BottleneckEditForm
                  bottleneck={bottleneck}
                  onChange={(patch) => editor.updateItem(bottleneck.id, patch)}
                />
              }
            >
              <BottleneckView bottleneck={bottleneck} />
            </EditableItem>
          ))}

          {/* Targeted reprocess result panel */}
          {reprocessResult && (
            <ReprocessPanel
              itemId={reprocessResult.itemId}
              isLoading={false}
              revisedItem={reprocessResult.item}
              onSubmit={() => {}}
              onAccept={() => {
                editor.applyReprocessResult(
                  reprocessResult.itemId,
                  reprocessResult.item,
                  reprocessResult.callId
                );
                setReprocessResult(null);
              }}
              onReject={() => setReprocessResult(null)}
            />
          )}
        </div>
      )}

      {/* Save/discard bar */}
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

function BottleneckView({ bottleneck }: { bottleneck: OperationalBottleneck }) {
  const severityColors = {
    low: 'text-green-600 bg-green-50',
    medium: 'text-amber-600 bg-amber-50',
    high: 'text-red-600 bg-red-50',
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h4 className="font-medium text-sm">{bottleneck.title}</h4>
          <p className="text-sm text-muted-foreground mt-1">{bottleneck.description}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${severityColors[bottleneck.severity]}`}>
          {bottleneck.severity}
        </span>
      </div>
      {bottleneck.evidence_basis && (
        <blockquote className="border-l-2 border-muted pl-3 text-xs text-muted-foreground italic">
          {bottleneck.evidence_basis}
        </blockquote>
      )}
      {bottleneck.affected_processes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {bottleneck.affected_processes.map((p) => (
            <span key={p} className="rounded bg-muted px-2 py-0.5 text-xs">{p}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function BottleneckEditForm({
  bottleneck,
  onChange,
}: {
  bottleneck: OperationalBottleneck;
  onChange: (patch: Partial<OperationalBottleneck>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium mb-1">Title</label>
        <input
          type="text"
          value={bottleneck.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Description</label>
        <textarea
          value={bottleneck.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div className="flex gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Severity</label>
          <select
            value={bottleneck.severity}
            onChange={(e) => onChange({ severity: e.target.value as 'low' | 'medium' | 'high' })}
            className="rounded border px-2 py-1.5 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Automation Potential</label>
          <select
            value={bottleneck.automation_potential}
            onChange={(e) => onChange({ automation_potential: e.target.value as 'low' | 'medium' | 'high' })}
            className="rounded border px-2 py-1.5 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
    </div>
  );
}
