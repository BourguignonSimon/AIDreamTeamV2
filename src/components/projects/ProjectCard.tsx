/**
 * ProjectCard — Dashboard project tile
 *
 * Displays project metadata, current pipeline step, and collaborator count.
 * Links to the project workspace page.
 *
 * Spec: Section 3.1, FR-DASH-01 through FR-DASH-04
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users, Calendar, ArrowRight } from 'lucide-react';
import type { ConsultingProject } from '@/lib/types';
import { WorkflowStep } from '@/lib/types';

interface ProjectCardProps {
  project: ConsultingProject;
  collaboratorCount?: number;
}

const STEP_LABELS: Record<WorkflowStep, string> = {
  [WorkflowStep.KNOWLEDGE_INGESTION]: 'Knowledge Ingestion',
  [WorkflowStep.HYPOTHESIS_GENERATION]: 'Hypothesis Generation',
  [WorkflowStep.INTERVIEW_ARCHITECT]: 'Interview Architect',
  [WorkflowStep.HUMAN_BREAKPOINT]: 'Human Breakpoint',
  [WorkflowStep.GAP_ANALYSIS]: 'Gap Analysis',
  [WorkflowStep.SOLUTION_ARCHITECT]: 'Solution Architect',
  [WorkflowStep.REPORTING]: 'Reporting',
};

const STEP_PROGRESS: Record<WorkflowStep, number> = {
  [WorkflowStep.KNOWLEDGE_INGESTION]: 14,
  [WorkflowStep.HYPOTHESIS_GENERATION]: 28,
  [WorkflowStep.INTERVIEW_ARCHITECT]: 42,
  [WorkflowStep.HUMAN_BREAKPOINT]: 57,
  [WorkflowStep.GAP_ANALYSIS]: 71,
  [WorkflowStep.SOLUTION_ARCHITECT]: 85,
  [WorkflowStep.REPORTING]: 100,
};

export default function ProjectCard({ project, collaboratorCount = 1 }: ProjectCardProps) {
  const { t } = useTranslation();
  const currentStep = project.current_step as WorkflowStep;
  const progressPct = STEP_PROGRESS[currentStep] ?? 0;

  const createdAt = new Date(project.created_at);
  const formattedDate = createdAt.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Link
      to={`/projects/${project.id}`}
      className="group block rounded-xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate group-hover:text-primary transition-colors">
            {project.name}
          </h3>
          {project.client_name && (
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{project.client_name}</p>
          )}
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0 mt-0.5" />
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>{STEP_LABELS[currentStep] ?? currentStep}</span>
          <span>{progressPct}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Metadata row */}
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formattedDate}
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3 w-3" />
          {collaboratorCount} {t('common.collaborator', { count: collaboratorCount })}
        </span>
        {project.language && (
          <span className="uppercase font-medium">{project.language}</span>
        )}
      </div>
    </Link>
  );
}
