/**
 * Application-wide constants for Operia
 *
 * Specification: Section 8.2 (lib/constants.ts)
 */

import { WorkflowStep, STEP_ORDER } from './types';

// Re-export for convenience
export { STEP_ORDER };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// QUALITY GATE THRESHOLDS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Score at or above this threshold on both dimensions: gate passes (Section 6.6) */
export const QUALITY_GATE_PASS_THRESHOLD = 60;

/** Score between this and PASS_THRESHOLD: needs_review (amber badge) */
export const QUALITY_GATE_REVIEW_THRESHOLD = 40;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE UPLOAD CONSTRAINTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Maximum file size for document uploads: 25 MB (FR-S1-01) */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/** Maximum number of documents per project (FR-S1-01) */
export const MAX_FILES_PER_PROJECT = 20;

/** Accepted MIME types for document uploads (FR-S1-01) */
export const ACCEPTED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

/** Accepted file extensions for display */
export const ACCEPTED_DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.txt'];

/** Maximum context summary length in words (FR-S1-06) */
export const MAX_CONTEXT_SUMMARY_WORDS = 500;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP DISPLAY CONFIGURATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Human-readable step display numbers (1-indexed) */
export const STEP_NUMBER: Record<WorkflowStep, number> = {
  [WorkflowStep.KNOWLEDGE_INGESTION]:   1,
  [WorkflowStep.HYPOTHESIS_GENERATION]: 2,
  [WorkflowStep.INTERVIEW_ARCHITECT]:   3,
  [WorkflowStep.HUMAN_BREAKPOINT]:      4,
  [WorkflowStep.GAP_ANALYSIS]:          5,
  [WorkflowStep.SOLUTION_ARCHITECT]:    6,
  [WorkflowStep.REPORTING]:             7,
};

/** Step translation keys for i18n */
export const STEP_I18N_KEYS: Record<WorkflowStep, string> = {
  [WorkflowStep.KNOWLEDGE_INGESTION]:   'steps.knowledge_ingestion',
  [WorkflowStep.HYPOTHESIS_GENERATION]: 'steps.hypothesis_generation',
  [WorkflowStep.INTERVIEW_ARCHITECT]:   'steps.interview_architect',
  [WorkflowStep.HUMAN_BREAKPOINT]:      'steps.human_breakpoint',
  [WorkflowStep.GAP_ANALYSIS]:          'steps.gap_analysis',
  [WorkflowStep.SOLUTION_ARCHITECT]:    'steps.solution_architect',
  [WorkflowStep.REPORTING]:             'steps.reporting',
};

/** Which steps are AI-driven (qualify for quality gate evaluation) */
export const AI_DRIVEN_STEPS = new Set<WorkflowStep>([
  WorkflowStep.HYPOTHESIS_GENERATION,
  WorkflowStep.INTERVIEW_ARCHITECT,
  WorkflowStep.GAP_ANALYSIS,
  WorkflowStep.SOLUTION_ARCHITECT,
  WorkflowStep.REPORTING,
]);

/** Step 4 requires explicit human action — cannot be triggered automatically */
export const HUMAN_GATED_STEPS = new Set<WorkflowStep>([
  WorkflowStep.HUMAN_BREAKPOINT,
]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PIPELINE ACTIONS
// These action strings map to step types in pipeline-orchestrator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const PIPELINE_ACTIONS = {
  GENERATE_HYPOTHESIS: 'generate_hypothesis',
  GENERATE_INTERVIEW:  'generate_interview',
  ANALYZE_GAPS:        'analyze_gaps',
  GENERATE_SOLUTIONS:  'generate_solutions',
  GENERATE_REPORT:     'generate_report',
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUPPORTED LANGUAGES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SUPPORTED_LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'nl', label: 'Nederlands' },
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INDUSTRY OPTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const INDUSTRIES = [
  'Retail',
  'Manufacturing',
  'Professional Services',
  'Healthcare',
  'Logistics & Distribution',
  'Construction',
  'Food & Beverage',
  'Technology',
  'Finance & Insurance',
  'Real Estate',
  'Education',
  'Agriculture',
  'Hospitality',
  'Other',
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REALTIME CONFIGURATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Supabase Realtime channel names */
export const REALTIME_CHANNELS = {
  WORKFLOW_NODES:     'workflow-nodes',
  QUALITY_GATES:      'quality-gates',
  PIPELINE_EXECUTIONS: 'pipeline-executions',
} as const;
