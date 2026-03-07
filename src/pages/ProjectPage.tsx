/**
 * ProjectPage — Main Workspace
 *
 * Loads project data and wires up the full workflow experience:
 * - Realtime state via useWorkflowState
 * - Step gating via useStepGating
 * - WorkflowStepper sidebar + active step panel
 * - Document upload panel in step 1
 * - Collaborator management in settings drawer
 *
 * Spec: Section 3.2, AR-07 (Realtime-driven UI), FR-PROJ-01 through FR-PROJ-05
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Settings, ChevronLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ConsultingProject } from '@/lib/types';
import { WorkflowStep } from '@/lib/types';
import { useWorkflowState } from '@/hooks/useWorkflowState';
import { useStepGating } from '@/hooks/useStepGating';
import AppHeader from '@/components/layout/AppHeader';
import WorkflowStepper from '@/components/workflow/WorkflowStepper';
import CollaboratorManager from '@/components/projects/CollaboratorManager';

// Step panel lazy imports — each panel is independent
import Step1KnowledgeIngestion from '@/components/workflow/steps/Step1KnowledgeIngestion';
import Step2HypothesisGeneration from '@/components/workflow/steps/Step2HypothesisGeneration';
import Step3InterviewArchitect from '@/components/workflow/steps/Step3InterviewArchitect';
import Step4HumanBreakpoint from '@/components/workflow/steps/Step4HumanBreakpoint';
import Step5GapAnalysis from '@/components/workflow/steps/Step5GapAnalysis';
import Step6SolutionArchitect from '@/components/workflow/steps/Step6SolutionArchitect';
import Step7Reporting from '@/components/workflow/steps/Step7Reporting';

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [project, setProject] = useState<ConsultingProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'owner' | 'editor' | 'viewer' | null>(null);
  const [activeStep, setActiveStep] = useState<WorkflowStep>(WorkflowStep.KNOWLEDGE_INGESTION);
  const [showSettings, setShowSettings] = useState(false);

  const { state: workflowState } = useWorkflowState(projectId ?? '');
  const stepStatuses = useStepGating(
    workflowState.nodes,
    workflowState.gates,
    workflowState.executions
  );

  const isEditor = userRole === 'owner' || userRole === 'editor';

  useEffect(() => {
    if (!projectId) return;

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate('/auth'); return; }
      setCurrentUserId(user.id);

      // Load project
      const { data: proj, error: projErr } = await supabase
        .from('consulting_projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (projErr || !proj) { navigate('/'); return; }
      setProject(proj as ConsultingProject);

      // Load user role
      const { data: collab } = await supabase
        .from('project_collaborators')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .single();

      if (!collab) { navigate('/'); return; } // Not a member — deny access
      setUserRole(collab.role as 'owner' | 'editor' | 'viewer');

      // Set active step to project's current step
      if (proj.current_step) {
        setActiveStep(proj.current_step as WorkflowStep);
      }

      setIsLoading(false);
    }

    void load();
  }, [projectId, navigate]);

  const renderActiveStep = useCallback(() => {
    if (!project) return null;
    const commonProps = {
      project,
      nodes: workflowState.nodes,
      gates: workflowState.gates,
      executions: workflowState.executions,
      isEditor,
    };

    switch (activeStep) {
      case WorkflowStep.KNOWLEDGE_INGESTION:
        return (
          <Step1KnowledgeIngestion
            {...commonProps}
            stepStatus={stepStatuses[WorkflowStep.KNOWLEDGE_INGESTION]}
            onDocumentAdded={workflowState.addDocument}
            onDocumentRemoved={workflowState.removeDocument}
          />
        );
      case WorkflowStep.HYPOTHESIS_GENERATION:
        return (
          <Step2HypothesisGeneration
            {...commonProps}
            stepStatus={stepStatuses[WorkflowStep.HYPOTHESIS_GENERATION]}
          />
        );
      case WorkflowStep.INTERVIEW_ARCHITECT:
        return (
          <Step3InterviewArchitect
            {...commonProps}
            stepStatus={stepStatuses[WorkflowStep.INTERVIEW_ARCHITECT]}
          />
        );
      case WorkflowStep.HUMAN_BREAKPOINT:
        return (
          <Step4HumanBreakpoint
            {...commonProps}
            stepStatus={stepStatuses[WorkflowStep.HUMAN_BREAKPOINT]}
          />
        );
      case WorkflowStep.GAP_ANALYSIS:
        return (
          <Step5GapAnalysis
            {...commonProps}
            stepStatus={stepStatuses[WorkflowStep.GAP_ANALYSIS]}
          />
        );
      case WorkflowStep.SOLUTION_ARCHITECT:
        return (
          <Step6SolutionArchitect
            {...commonProps}
            stepStatus={stepStatuses[WorkflowStep.SOLUTION_ARCHITECT]}
          />
        );
      case WorkflowStep.REPORTING:
        return (
          <Step7Reporting
            {...commonProps}
            stepStatus={stepStatuses[WorkflowStep.REPORTING]}
          />
        );
      default:
        return null;
    }
  }, [project, activeStep, workflowState, stepStatuses, isEditor]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="min-h-screen flex flex-col bg-muted/10">
      <AppHeader
        title={project.name}
        subtitle={project.client_name ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t('common.back')}
            </button>
            {isEditor && (
              <button
                onClick={() => setShowSettings(true)}
                className="rounded-lg border p-1.5 hover:bg-muted transition-colors"
                title={t('common.settings')}
              >
                <Settings className="h-4 w-4" />
              </button>
            )}
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden max-w-7xl mx-auto w-full px-4 py-6 gap-6">
        {/* Left sidebar — step navigator */}
        <aside className="w-56 flex-shrink-0">
          <WorkflowStepper
            activeStep={activeStep}
            stepStatuses={stepStatuses}
            onStepSelect={setActiveStep}
          />
        </aside>

        {/* Main content area */}
        <main className="flex-1 min-w-0 rounded-xl border bg-background p-6 overflow-auto">
          {renderActiveStep()}
        </main>
      </div>

      {/* Settings drawer — Collaborator management */}
      {showSettings && currentUserId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          />
          <aside className="relative z-10 w-full max-w-md bg-background border-l h-full overflow-y-auto p-6 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-lg">{t('common.settings')}</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="rounded p-1 hover:bg-muted transition-colors text-muted-foreground"
              >
                ×
              </button>
            </div>
            <CollaboratorManager project={project} currentUserId={currentUserId} />
          </aside>
        </div>
      )}
    </div>
  );
}
