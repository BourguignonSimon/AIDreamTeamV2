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

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Plus, Loader2, TrendingUp, ToggleLeft, ToggleRight } from 'lucide-react';
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

  const activeNode = getActiveNode(nodes as AnyWorkflowNode[], WorkflowStep.SOLUTION_ARCHITECT);
  const gate = activeNode ? gates.find((g) => g.node_id === activeNode.id) : null;

  const editor = useStepEditor<Step6OutputData>(
    WorkflowStep.SOLUTION_ARCHITECT,
    activeNode as AnyWorkflowNode | null
  );
  const reprocessHook = useTargetedReprocess(project.id, activeNode?.id ?? '');

  const isRunning = stepStatus === 'running';
  const hasOutput = activeNode?.execution_status === 'completed' && editor.draft?.solutions;

  async function handleTrigger() {
    await advance({ project_id: project.id, action: PIPELINE_ACTIONS.ARCHITECT_SOLUTIONS });
  }

  const solutions = (editor.draft?.solutions ?? []) as AutomationSolution[];

  // FR-S6-HEC-09: Real-time total ROI across included solutions
  const roiSummary = useMemo(() => {
    const included = solutions.filter((s) => s.include_in_roadmap !== false);
    const totalAnnualValue = included.reduce((acc, s) => acc + (s.estimated_annual_value_eur ?? 0), 0);
    const totalEffortDays = included.reduce((acc, s) => acc + (s.implementation_effort_days ?? 0), 0);
    return { count: included.length, totalAnnualValue, totalEffortDays };
  }, [solutions]);

  function handleToggleRoadmap(solutionId: string, current: boolean) {
    editor.updateItem(solutionId, { include_in_roadmap: !current });
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

      {!hasOutput && !isRunning && isEditor && (
        <button
          onClick={handleTrigger}
          disabled={isAdvancing}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isAdvancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {t('step6.trigger')}
        </button>
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
              <p className="text-2xl font-bold mt-1">{roiSummary.count}</p>
              <p className="text-xs text-muted-foreground">of {solutions.length} total</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('step6.total_annual_value')}</p>
              <p className="text-2xl font-bold mt-1">
                €{roiSummary.totalAnnualValue.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">per year</p>
            </div>
            <div className="rounded-lg border p-4 text-center">
              <p className="text-xs text-muted-foreground">{t('step6.total_effort')}</p>
              <p className="text-2xl font-bold mt-1">{roiSummary.totalEffortDays}</p>
              <p className="text-xs text-muted-foreground">person-days</p>
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
                      automation_type: 'rpa',
                      complexity: 'medium',
                      estimated_annual_value_eur: 0,
                      implementation_effort_days: 0,
                      priority_score: 50,
                      include_in_roadmap: true,
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
                  onReprocess={() =>
                    reprocessHook.reprocess({
                      step_type: WorkflowStep.SOLUTION_ARCHITECT,
                      item_type: 'solution',
                      item_id: solution.id,
                    })
                  }
                  isReprocessing={reprocessHook.isReprocessing[solution.id]}
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
                      handleToggleRoadmap(solution.id, solution.include_in_roadmap !== false)
                    }
                  />
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
  const complexityColor =
    solution.complexity === 'high'
      ? 'bg-red-50 text-red-700'
      : solution.complexity === 'medium'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-green-50 text-green-700';

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-sm font-semibold">{solution.title || 'Untitled Solution'}</h4>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${complexityColor}`}>
              {solution.complexity}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {solution.automation_type}
            </span>
          </div>
          {solution.description && (
            <p className="text-sm text-muted-foreground mt-1">{solution.description}</p>
          )}
        </div>

        {/* FR-S6-HEC-04: Roadmap toggle */}
        {isEditor && (
          <button
            onClick={onToggleRoadmap}
            title={solution.include_in_roadmap !== false ? 'Remove from roadmap' : 'Add to roadmap'}
            className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            {solution.include_in_roadmap !== false ? (
              <ToggleRight className="h-5 w-5 text-primary" />
            ) : (
              <ToggleLeft className="h-5 w-5" />
            )}
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-green-600" />
          €{(solution.estimated_annual_value_eur ?? 0).toLocaleString()}/yr
        </span>
        <span>{solution.implementation_effort_days ?? 0} person-days</span>
        <span>Priority: {solution.priority_score}/100</span>
        {solution.include_in_roadmap === false && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">Excluded from roadmap</span>
        )}
      </div>

      {solution.consultant_annotation && (
        <div className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-medium">Annotation: </span>
          {solution.consultant_annotation}
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
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium mb-1">Title</label>
        <input
          type="text"
          value={solution.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Description</label>
        <textarea
          value={solution.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Automation Type</label>
          <select
            value={solution.automation_type}
            onChange={(e) =>
              onChange({ automation_type: e.target.value as AutomationSolution['automation_type'] })
            }
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            <option value="rpa">RPA</option>
            <option value="ai_ml">AI/ML</option>
            <option value="integration">Integration</option>
            <option value="workflow">Workflow</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Complexity</label>
          <select
            value={solution.complexity}
            onChange={(e) =>
              onChange({ complexity: e.target.value as AutomationSolution['complexity'] })
            }
            className="w-full rounded border px-2 py-1.5 text-sm"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Annual Value (EUR)</label>
          <input
            type="number"
            value={solution.estimated_annual_value_eur ?? 0}
            onChange={(e) => onChange({ estimated_annual_value_eur: Number(e.target.value) })}
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Effort (person-days)</label>
          <input
            type="number"
            value={solution.implementation_effort_days ?? 0}
            onChange={(e) => onChange({ implementation_effort_days: Number(e.target.value) })}
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Consultant Annotation</label>
        <textarea
          value={solution.consultant_annotation ?? ''}
          onChange={(e) => onChange({ consultant_annotation: e.target.value })}
          rows={2}
          placeholder="Add supplementary context for the report..."
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
    </div>
  );
}
