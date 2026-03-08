/**
 * Step6SolutionArchitect — Solution Architecture Panel
 *
 * Presents AI-generated automation solutions with ROI projections.
 * Full HEC support: edit, add, delete, annotate, targeted reprocess.
 * Roadmap inclusion toggle per solution (FR-S6-HEC-04).
 * Real-time total ROI calculation (FR-S6-HEC-09).
 *
 * Spec: Section 3.3, FR-S6-01 through FR-S6-HEC-09
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Loader2, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import type { ChangeEvent } from 'react';
import type {
  ConsultingProject,
  AnyWorkflowNode,
  AIQualityGate,
  PipelineExecution,
  AutomationSolution,
  StepStatus,
  Step6OutputData,
} from '@/lib/types';
import { WorkflowStep, getActiveNode } from '@/lib/types';
import { PIPELINE_ACTIONS } from '@/lib/constants';
import { usePipelineAdvance } from '@/hooks/usePipelineAdvance';
import { useStepEditor } from '@/hooks/useStepEditor';
import { useTargetedReprocess } from '@/hooks/useTargetedReprocess';
import AIQualityBadge from '../AIQualityBadge';
import EditableItem from '../editorial/EditableItem';
import SaveEditBar from '../editorial/SaveEditBar';
import ReprocessPanel from '../editorial/ReprocessPanel';

interface Step6Props {
  project: ConsultingProject;
  nodes: AnyWorkflowNode[];
  gates: AIQualityGate[];
  executions: PipelineExecution[];
  isEditor: boolean;
  stepStatus: StepStatus;
}

export default function Step6SolutionArchitect({
  project,
  nodes,
  gates,
  executions,
  isEditor,
  stepStatus,
}: Step6Props) {
  const { t } = useTranslation();
  const { advance, isAdvancing } = usePipelineAdvance();

  const activeNode = getActiveNode(nodes, WorkflowStep.SOLUTION_ARCHITECT) as any;
  const gate = activeNode ? gates.find((g) => g.node_id === activeNode.id) : null;

  const editor = useStepEditor<Step6OutputData>(
    WorkflowStep.SOLUTION_ARCHITECT,
    activeNode as import('@/lib/types').WorkflowNode<unknown, Step6OutputData> | null
  );
  
  const reprocessHook = useTargetedReprocess(project.id, activeNode?.id ?? '');
  const [openReprocessId, setOpenReprocessId] = useState<string | null>(null);
  const [pendingRevisions, setPendingRevisions] = useState<Record<string, unknown>>({});

  const isRunning = stepStatus === 'running';
  const hasOutput = activeNode?.execution_status === 'completed' && editor.draft?.solutions;

  async function handleTrigger() {
    await advance({ project_id: project.id, action: PIPELINE_ACTIONS.GENERATE_SOLUTIONS });
  }

  async function handleReprocessItem(itemId: string, instruction?: string) {
    setOpenReprocessId(itemId);
    setPendingRevisions((prev: Record<string, unknown>) => ({ ...prev, [itemId]: undefined }));
    
    const result = await reprocessHook.reprocess({
      step_type: WorkflowStep.SOLUTION_ARCHITECT,
      item_type: 'solution',
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

  const solutions = (editor.draft?.solutions ?? []) as AutomationSolution[];

  // FR-S6-HEC-09: Real-time total ROI across included solutions
  const totalRoi = useMemo(() => {
    return solutions
      .filter((s) => s.included_in_roadmap !== false)
      .reduce((acc, s) => acc + (s.estimated_roi?.cost_reduction_eur_per_year ?? 0), 0);
  }, [solutions]);

  const totalHours = useMemo(() => {
    return solutions
      .filter((s) => s.included_in_roadmap !== false)
      .reduce((acc, s) => acc + (s.estimated_roi?.time_saved_hours_per_month ?? 0), 0);
  }, [solutions]);

  function handleToggleRoadmap(solutionId: string, current: boolean) {
    editor.updateItem(solutionId, { included_in_roadmap: !current });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('step6.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('step6.description')}</p>
        </div>
        {gate && <AIQualityBadge gate={gate} showScores />}
      </div>

      {!isRunning && isEditor && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleTrigger}
            disabled={isAdvancing}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {isAdvancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {hasOutput ? t('common.rerun_ai') : t('step6.trigger')}
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
          <p className="text-sm font-medium text-blue-800">Designing solution architecture...</p>
        </div>
      )}

      {hasOutput && (
        <div className="space-y-6">
          {/* ROI summary (FR-S6-HEC-09) */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('step6.solutions_included')}</p>
              <p className="text-2xl font-bold mt-1">{solutions.filter(s => s.included_in_roadmap !== false).length}</p>
              <p className="text-xs text-muted-foreground">of {solutions.length} total</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('step6.total_annual_value')}</p>
              <p className="text-2xl font-bold mt-1">
                €{totalRoi.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">per year</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('step6.total_time_saved')}</p>
              <p className="text-2xl font-bold mt-1">{totalHours}</p>
              <p className="text-xs text-muted-foreground">hours/month</p>
            </div>
          </div>

          {/* Executive summary */}
          {editor.draft.executive_summary && (
            <div className="rounded-lg border p-4">
              <h3 className="text-sm font-medium mb-2">{t('step6.executive_summary')}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {editor.draft.executive_summary}
              </p>
            </div>
          )}

          {/* Solutions list */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">
                {t('step6.solutions')} ({solutions.length})
              </h3>
              {isEditor && (
                <button
                  onClick={() =>
                    editor.addItem({
                      id: `sol_human_${Date.now()}`,
                      bottleneck_id: '',
                      title: '',
                      description: '',
                      implementation_complexity: 'medium',
                      estimated_roi: {
                        cost_reduction_eur_per_year: 0,
                        time_saved_hours_per_month: 0,
                        payback_period_months: 0,
                      },
                      technology_stack: [],
                      included_in_roadmap: true,
                      origin: 'human_added',
                    })
                  }
                  className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('step6.add_solution')}
                </button>
              )}
            </div>

            <div className="space-y-3">
              {solutions.map((solution) => (
                <EditableItem
                  key={solution.id}
                  itemId={solution.id}
                  origin={solution.origin}
                  canEdit={isEditor}
                  onDelete={() => editor.deleteItem(solution.id)}
                  onReprocess={() => setOpenReprocessId(openReprocessId === solution.id ? null : solution.id)}
                  isReprocessing={!!reprocessHook.isReprocessing[solution.id]}
                  editChildren={
                    <SolutionEditForm
                      solution={solution}
                      onChange={(patch) => editor.updateItem(solution.id, patch)}
                    />
                  }
                >
                  <SolutionView
                    solution={solution}
                    isEditor={isEditor}
                    onToggleRoadmap={() =>
                      handleToggleRoadmap(solution.id, solution.included_in_roadmap !== false)
                    }
                  />

                  {openReprocessId === solution.id && (
                    <div className="mt-4 pt-4 border-t border-muted">
                      <ReprocessPanel
                        itemId={solution.id}
                        isLoading={!!reprocessHook.isReprocessing[solution.id]}
                        revisedItem={(pendingRevisions[solution.id] as any)?.item}
                        onSubmit={(instruction) => void handleReprocessItem(solution.id, instruction)}
                        onAccept={() => handleAcceptRevision(solution.id)}
                        onReject={() => handleRejectRevision(solution.id)}
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

function SolutionView({
  solution,
  isEditor,
  onToggleRoadmap,
}: {
  solution: AutomationSolution;
  isEditor: boolean;
  onToggleRoadmap: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
            {solution.title}
          </h4>
          <p className="text-sm text-muted-foreground mt-1">{solution.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Value (Annual)
          </p>
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            €{solution.estimated_roi?.cost_reduction_eur_per_year?.toLocaleString()}
          </p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Time Saved
          </p>
          <p className="text-sm font-medium">
            {solution.estimated_roi?.time_saved_hours_per_month}h/mo
          </p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Payback
          </p>
          <p className="text-sm font-medium">{solution.estimated_roi?.payback_period_months} mo</p>
        </div>
        <div className="bg-muted/30 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Complexity
          </p>
          <p className="text-sm font-medium capitalize">{solution.implementation_complexity}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {solution.technology_stack?.map((tech) => (
          <span
            key={tech}
            className="px-2 py-0.5 rounded-full bg-primary/5 text-primary text-[10px] font-medium border border-primary/10"
          >
            {tech}
          </span>
        ))}
      </div>

      {isEditor && (
        <div className="flex items-center justify-between pt-2 border-t border-muted/50">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Include in Roadmap</span>
            <button
              onClick={onToggleRoadmap}
              className="text-primary hover:text-primary-hover transition-colors"
            >
              {solution.included_in_roadmap !== false ? (
                <ToggleRight className="w-8 h-8" />
              ) : (
                <ToggleLeft className="w-8 h-8 text-muted-foreground" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SolutionEditForm({
  solution,
  onChange,
}: {
  solution: AutomationSolution;
  onChange: (patch: Partial<AutomationSolution>) => void;
}) {
  return (
    <div className="space-y-4 pt-4 border-t border-muted/20">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Solution Title</label>
          <input
            type="text"
            value={solution.title}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ title: e.target.value })}
            className="w-full bg-muted/40 border-none rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Value (€/Year)</label>
          <input
            type="number"
            value={solution.estimated_roi?.cost_reduction_eur_per_year ?? 0}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({
                estimated_roi: {
                  ...solution.estimated_roi!,
                  cost_reduction_eur_per_year: Number(e.target.value),
                },
              })
            }
            className="w-full bg-muted/40 border-none rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>

        <div className="space-y-2 col-span-2">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <textarea
            value={solution.description}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange({ description: e.target.value })}
            rows={2}
            className="w-full bg-muted/40 border-none rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none transition-all resize-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Complexity</label>
          <select
            value={solution.implementation_complexity}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              onChange({ implementation_complexity: e.target.value as 'low' | 'medium' | 'high' })
            }
            className="w-full bg-muted/40 border-none rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none transition-all"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Payback (Months)</label>
          <input
            type="number"
            value={solution.estimated_roi?.payback_period_months ?? 0}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              onChange({
                estimated_roi: {
                  ...solution.estimated_roi!,
                  payback_period_months: Number(e.target.value),
                },
              })
            }
            className="w-full bg-muted/40 border-none rounded-md px-3 py-2 text-sm focus:ring-1 focus:ring-primary outline-none transition-all"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Consultant Annotation</label>
        <textarea
          value={solution.consultant_annotation ?? ''}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange({ consultant_annotation: e.target.value })}
          placeholder="Add supplementary context for the report..."
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
    </div>
  );
}
