/**
 * Step3InterviewArchitect — Interview Guide Generation Panel
 *
 * Generates a structured interview guide from the active bottleneck list.
 * Supports question editing, reordering, and targeted AI re-processing.
 *
 * Spec: Section 3.3, FR-S3-01 through FR-S3-HEC-08
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Plus, Loader2, GripVertical } from 'lucide-react';
import type { ConsultingProject, AnyWorkflowNode, AIQualityGate, PipelineExecution, InterviewQuestion, StepStatus, Step3OutputData } from '@/lib/types';
import { WorkflowStep, getActiveNode } from '@/lib/types';
import { PIPELINE_ACTIONS } from '@/lib/constants';
import { usePipelineAdvance } from '@/hooks/usePipelineAdvance';
import { useStepEditor } from '@/hooks/useStepEditor';
import { useTargetedReprocess } from '@/hooks/useTargetedReprocess';
import AIQualityBadge from '../AIQualityBadge';
import EditableItem from '../editorial/EditableItem';
import SaveEditBar from '../editorial/SaveEditBar';

interface Step3Props {
  project: ConsultingProject;
  nodes: AnyWorkflowNode[];
  gates: AIQualityGate[];
  executions: PipelineExecution[];
  isEditor: boolean;
  stepStatus: StepStatus;
}

export default function Step3InterviewArchitect({
  project,
  nodes,
  gates,
  executions,
  isEditor,
  stepStatus,
}: Step3Props) {
  const { t } = useTranslation();
  const { advance, isAdvancing } = usePipelineAdvance();
  const [stakeholderRoles, setStakeholderRoles] = useState('');

  const activeNode = getActiveNode(nodes as AnyWorkflowNode[], WorkflowStep.INTERVIEW_ARCHITECT);
  const gate = activeNode ? gates.find((g) => g.node_id === activeNode.id) : null;

  const editor = useStepEditor<Step3OutputData>(
    WorkflowStep.INTERVIEW_ARCHITECT,
    activeNode as AnyWorkflowNode | null
  );

  const reprocessHook = useTargetedReprocess(project.id, activeNode?.id ?? '');
  const isRunning = stepStatus === 'running';
  const hasOutput = activeNode?.execution_status === 'completed' && editor.draft?.questions;

  async function handleTrigger() {
    await advance({
      project_id: project.id,
      action: PIPELINE_ACTIONS.GENERATE_INTERVIEW,
      metadata: { stakeholder_roles: stakeholderRoles.split(',').map((r) => r.trim()).filter(Boolean) },
    });
  }

  const questions = ((editor.draft?.questions ?? []) as InterviewQuestion[])
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">{t('step3.title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('step3.description')}</p>
        </div>
        {gate && <AIQualityBadge gate={gate} showScores />}
      </div>

      {!hasOutput && !isRunning && isEditor && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">{t('step3.stakeholder_roles')}</label>
            <input
              type="text"
              value={stakeholderRoles}
              onChange={(e) => setStakeholderRoles(e.target.value)}
              placeholder={t('step3.stakeholder_placeholder')}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            onClick={handleTrigger}
            disabled={isAdvancing}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {isAdvancing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {t('step3.trigger')}
          </button>
        </div>
      )}

      {isRunning && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <p className="text-sm font-medium text-blue-800">Generating interview guide...</p>
        </div>
      )}

      {hasOutput && (
        <div className="space-y-6">
          {/* Introduction script */}
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-2">Introduction Script</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {editor.draft.introduction_script}
            </p>
          </div>

          {/* Questions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">{t('step3.questions')} ({questions.length})</h3>
              {isEditor && (
                <button
                  onClick={() => editor.addItem({
                    id: `q_human_${Date.now()}`,
                    question: 'New question?',
                    intent: '',
                    linked_bottleneck_id: '',
                    expected_answer_type: 'qualitative',
                    sort_order: questions.length + 1,
                    origin: 'human_added',
                  })}
                  className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('step3.add_question')}
                </button>
              )}
            </div>

            <div className="space-y-3">
              {questions.map((question, idx) => (
                <EditableItem
                  key={question.id}
                  itemId={question.id}
                  origin={question.origin}
                  canEdit={isEditor}
                  onDelete={() => editor.deleteItem(question.id)}
                  onReprocess={() => reprocessHook.reprocess({
                    step_type: WorkflowStep.INTERVIEW_ARCHITECT,
                    item_type: 'question',
                    item_id: question.id,
                  })}
                  isReprocessing={reprocessHook.isReprocessing[question.id]}
                  editChildren={
                    <QuestionEditForm
                      question={question}
                      onChange={(patch) => editor.updateItem(question.id, patch)}
                    />
                  }
                >
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 text-xs text-muted-foreground font-mono pt-0.5">Q{idx + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{question.question}</p>
                      <p className="text-xs text-muted-foreground mt-1">{question.intent}</p>
                      <span className="text-xs text-blue-600 mt-1 inline-block">{question.expected_answer_type}</span>
                    </div>
                  </div>
                </EditableItem>
              ))}
            </div>
          </div>

          {/* Closing script */}
          <div className="rounded-lg border p-4">
            <h3 className="text-sm font-medium mb-2">Closing Script</h3>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{editor.draft.closing_script}</p>
          </div>

          <div className="text-sm text-muted-foreground">
            Estimated duration: {editor.draft.estimated_duration_minutes} minutes
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

function QuestionEditForm({ question, onChange }: {
  question: InterviewQuestion;
  onChange: (patch: Partial<InterviewQuestion>) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium mb-1">Question</label>
        <textarea
          value={question.question}
          onChange={(e) => onChange({ question: e.target.value })}
          rows={2}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Intent</label>
        <input
          type="text"
          value={question.intent}
          onChange={(e) => onChange({ intent: e.target.value })}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Expected Answer Type</label>
        <select
          value={question.expected_answer_type}
          onChange={(e) => onChange({ expected_answer_type: e.target.value as InterviewQuestion['expected_answer_type'] })}
          className="rounded border px-2 py-1.5 text-sm"
        >
          <option value="qualitative">Qualitative</option>
          <option value="quantitative">Quantitative</option>
          <option value="both">Both</option>
        </select>
      </div>
    </div>
  );
}
