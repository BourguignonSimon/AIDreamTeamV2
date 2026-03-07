/**
 * WorkflowStepper — Presentational Pipeline Orchestrator UI
 *
 * Renders the 7-step workflow pipeline with step panels.
 * Consumes state from useWorkflowState and useStepGating — no direct server calls.
 * Presentational only: all server state lives in hooks. (AR-08)
 *
 * Spec: Section 8.2, AR-08
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConsultingProject } from '@/lib/types';
import { WorkflowStep, STEP_ORDER, getActiveNode } from '@/lib/types';
import { STEP_NUMBER, STEP_I18N_KEYS } from '@/lib/constants';
import { useWorkflowState } from '@/hooks/useWorkflowState';
import { useStepGating } from '@/hooks/useStepGating';
import StepStatusIndicator from './StepStatusIndicator';
import Step1KnowledgeIngestion from './steps/Step1KnowledgeIngestion';
import Step2HypothesisGeneration from './steps/Step2HypothesisGeneration';
import Step3InterviewArchitect from './steps/Step3InterviewArchitect';
import Step4HumanBreakpoint from './steps/Step4HumanBreakpoint';
import Step5GapAnalysis from './steps/Step5GapAnalysis';
import Step6SolutionArchitect from './steps/Step6SolutionArchitect';
import Step7Reporting from './steps/Step7Reporting';
import { cn } from '@/lib/utils';

interface WorkflowStepperProps {
  project: ConsultingProject;
  userRole: 'owner' | 'editor' | 'viewer' | null;
}

export default function WorkflowStepper({ project, userRole }: WorkflowStepperProps) {
  const { t } = useTranslation();
  const [activeStep, setActiveStep] = useState<WorkflowStep>(WorkflowStep.KNOWLEDGE_INGESTION);

  const { nodes, gates, executions, documents, isLoading, addDocument, removeDocument } =
    useWorkflowState(project.id);

  const { getStepStatus, isStepUnlocked, stepStatuses } = useStepGating(nodes, gates);

  const isEditor = userRole === 'owner' || userRole === 'editor';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex gap-6">
      {/* Step Navigator Sidebar */}
      <div className="w-56 shrink-0">
        <nav className="sticky top-8 space-y-1">
          {STEP_ORDER.map((step) => {
            const status = getStepStatus(step);
            const number = STEP_NUMBER[step];
            const isActive = activeStep === step;
            const canClick = status !== 'locked';

            return (
              <button
                key={step}
                onClick={() => canClick && setActiveStep(step)}
                disabled={!canClick}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-all',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : canClick
                    ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    : 'text-muted-foreground/50 cursor-not-allowed'
                )}
              >
                <StepStatusIndicator
                  status={status}
                  stepNumber={number}
                  isActive={isActive}
                  className="h-6 w-6 text-xs"
                />
                <span className="truncate">{t(STEP_I18N_KEYS[step])}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Step Content Panel */}
      <div className="flex-1 min-w-0">
        {activeStep === WorkflowStep.KNOWLEDGE_INGESTION && (
          <Step1KnowledgeIngestion
            project={project}
            nodes={nodes}
            documents={documents}
            isEditor={isEditor}
            onDocumentAdded={addDocument}
            onDocumentRemoved={removeDocument}
            onCompleted={() => setActiveStep(WorkflowStep.HYPOTHESIS_GENERATION)}
          />
        )}
        {activeStep === WorkflowStep.HYPOTHESIS_GENERATION && (
          <Step2HypothesisGeneration
            project={project}
            nodes={nodes}
            gates={gates}
            executions={executions}
            isEditor={isEditor}
            stepStatus={getStepStatus(WorkflowStep.HYPOTHESIS_GENERATION)}
          />
        )}
        {activeStep === WorkflowStep.INTERVIEW_ARCHITECT && (
          <Step3InterviewArchitect
            project={project}
            nodes={nodes}
            gates={gates}
            executions={executions}
            isEditor={isEditor}
            stepStatus={getStepStatus(WorkflowStep.INTERVIEW_ARCHITECT)}
          />
        )}
        {activeStep === WorkflowStep.HUMAN_BREAKPOINT && (
          <Step4HumanBreakpoint
            project={project}
            nodes={nodes}
            isEditor={isEditor}
            stepStatus={getStepStatus(WorkflowStep.HUMAN_BREAKPOINT)}
            onSubmitted={() => setActiveStep(WorkflowStep.GAP_ANALYSIS)}
          />
        )}
        {activeStep === WorkflowStep.GAP_ANALYSIS && (
          <Step5GapAnalysis
            project={project}
            nodes={nodes}
            gates={gates}
            executions={executions}
            isEditor={isEditor}
            stepStatus={getStepStatus(WorkflowStep.GAP_ANALYSIS)}
          />
        )}
        {activeStep === WorkflowStep.SOLUTION_ARCHITECT && (
          <Step6SolutionArchitect
            project={project}
            nodes={nodes}
            gates={gates}
            executions={executions}
            isEditor={isEditor}
            stepStatus={getStepStatus(WorkflowStep.SOLUTION_ARCHITECT)}
          />
        )}
        {activeStep === WorkflowStep.REPORTING && (
          <Step7Reporting
            project={project}
            nodes={nodes}
            gates={gates}
            executions={executions}
            isEditor={isEditor}
            stepStatus={getStepStatus(WorkflowStep.REPORTING)}
          />
        )}
      </div>
    </div>
  );
}
