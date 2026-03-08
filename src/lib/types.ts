/**
 * Full TypeScript Interface Reference for Operia
 *
 * This file defines all shared domain types used across the frontend.
 * Types align exactly with the database schema and Edge Function contracts.
 *
 * Specification: Section 16 — Appendix: Full TypeScript Interface Reference
 * Amendment: OPERIA-AMD-001 (Human Editorial Control System)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ENUMS & CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export enum WorkflowStep {
  KNOWLEDGE_INGESTION   = 'knowledge_ingestion',
  HYPOTHESIS_GENERATION = 'hypothesis_generation',
  INTERVIEW_ARCHITECT   = 'interview_architect',
  HUMAN_BREAKPOINT      = 'human_breakpoint',
  GAP_ANALYSIS          = 'gap_analysis',
  SOLUTION_ARCHITECT    = 'solution_architect',
  REPORTING             = 'reporting',
}

export const STEP_ORDER: WorkflowStep[] = [
  WorkflowStep.KNOWLEDGE_INGESTION,
  WorkflowStep.HYPOTHESIS_GENERATION,
  WorkflowStep.INTERVIEW_ARCHITECT,
  WorkflowStep.HUMAN_BREAKPOINT,
  WorkflowStep.GAP_ANALYSIS,
  WorkflowStep.SOLUTION_ARCHITECT,
  WorkflowStep.REPORTING,
];

export type StepStatus =
  | 'locked'
  | 'unlocked'
  | 'running'
  | 'awaiting_evaluation'
  | 'evaluating'
  | 'complete'
  | 'needs_review'
  | 'failed';

export type SupportedLanguage = 'fr' | 'en' | 'nl';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATABASE ENTITIES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ConsultingProject {
  id: string;
  owner_id: string;
  name: string;
  client_name: string;
  industry: string;
  country: string;
  language: SupportedLanguage;
  context_summary: string | null;
  status: 'active' | 'archived' | 'completed';
  current_step: WorkflowStep;
  sme_profile: SMEProfile | null;
  domain_template_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DomainTemplate {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  focus_areas: string[] | null;
  default_questions: string[] | null;
  typical_bottlenecks: string[] | null;
  prompt_injection_context: string | null;
  created_at: string;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  uploaded_by: string;
  storage_path: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: 'uploaded' | 'ingested' | 'failed';
  created_at: string;
}

export interface WorkflowNode<
  TInput = Record<string, unknown>,
  TOutput = Record<string, unknown>
> {
  id: string;
  project_id: string;
  step_type: WorkflowStep;
  version: number;
  superseded_by: string | null;
  execution_status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying';
  retry_count: number;
  idempotency_key: string | null;
  /** Provenance: was this node created by AI or human editing? (Amendment OPERIA-AMD-001) */
  edit_source: 'ai_generated' | 'human_edit';
  input_data: TInput | null;
  output_data: TOutput | null;
  /** Step 7 only: keyed by section name (e.g., 'executive_summary') */
  human_overrides: Record<string, string> | null;
  error_message: string | null;
  triggered_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIQualityGate {
  id: string;
  node_id: string;
  project_id: string;
  pragmatism_score: number | null;
  roi_focus_score: number | null;
  rationale: string | null;
  status: 'pending' | 'passed' | 'failed' | 'overridden';
  evaluation_status: 'pending' | 'evaluating' | 'completed' | 'skipped';
  evaluated_async: boolean;
  overridden_by: string | null;
  override_reason: string | null;
  evaluated_at: string | null;
  created_at: string;
}

export interface PipelineExecution {
  id: string;
  project_id: string;
  triggered_by: string | null;
  step_type: WorkflowStep;
  status: 'queued' | 'running' | 'completed' | 'failed';
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  node_id: string | null;
  retry_of: string | null;
}

/** Audit trail for scoped AI re-process calls (Amendment OPERIA-AMD-001) */
export interface TargetedReprocessCall {
  id: string;
  project_id: string;
  source_node_id: string;
  step_type: WorkflowStep;
  triggered_by: string;
  item_type: ItemType;
  item_id: string;
  instruction: string | null;
  input_snapshot: unknown;
  ai_response: unknown;
  applied: boolean;
  applied_to_node: string | null;
  model_metadata: ModelCallMetadata | null;
  created_at: string;
}

export type ItemType =
  | 'bottleneck'
  | 'question'
  | 'gap_finding'
  | 'solution'
  | 'report_section';

/** Provenance tag on every list item — tracks how this item was produced */
export type ItemOrigin =
  | 'ai_generated'   // Original AI output
  | 'human_edit'     // Modified inline by editor
  | 'ai_reprocessed' // Revised via targeted AI re-process
  | 'human_added';   // Manually created by editor

export interface ProjectCollaborator {
  id: string;
  project_id: string;
  user_id: string | null;
  email: string;
  role: 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'revoked';
  invited_by: string;
  invited_at: string;
  accepted_at: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED DOMAIN TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ModelCallMetadata {
  provider: 'google' | 'anthropic' | 'openai' | 'lovable_gateway';
  model_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  called_at: string;
}

export interface SMEProfile {
  industry: string;
  employee_count: number;
  annual_revenue_eur?: number;
  country: string;
  primary_language: SupportedLanguage;
}

export interface OperationalBottleneck {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  affected_processes: string[];
  automation_potential: 'low' | 'medium' | 'high';
  evidence_basis?: string;
  /** Provenance tracking (Amendment OPERIA-AMD-001) */
  origin: ItemOrigin;
}

export interface GapFinding {
  id: string;
  bottleneck_id: string;
  confirmed: boolean;
  discrepancy_description: string | null;
  evidence_quote: string;
  revised_severity: 'low' | 'medium' | 'high' | 'eliminated';
  /** Free-text note added by editor, passed forward to Step 6 (FR-S5-HEC-04) */
  consultant_annotation?: string;
  origin: ItemOrigin;
}

export interface AutomationSolution {
  id: string;
  title: string;
  description: string;
  target_bottleneck_id: string;
  technology_stack: string[];
  implementation_complexity: 'low' | 'medium' | 'high';
  estimated_roi: ROIEstimate;
  /** Whether this solution is included in the active roadmap (FR-S6-HEC-04) */
  included_in_roadmap: boolean;
  /** Free-text note added by editor for the final report (FR-S6-HEC-08) */
  consultant_annotation?: string;
  origin: ItemOrigin;
}

export interface ROIEstimate {
  time_saved_hours_per_month: number;
  cost_reduction_eur_per_year: number;
  payback_period_months: number;
  confidence: 'low' | 'medium' | 'high';
  assumptions: string[];
}

export interface RoadmapPhase {
  phase: number;
  title: string;
  solution_ids: string[];
  duration_weeks: number;
  dependencies: number[];
}

export interface InterviewQuestion {
  id: string;
  question: string;
  intent: string;
  linked_bottleneck_id: string;
  expected_answer_type: 'qualitative' | 'quantitative' | 'both';
  /** Supports drag-and-drop reordering (FR-S3-HEC-03) */
  sort_order: number;
  origin: ItemOrigin;
}

export interface ReportConfig {
  language: SupportedLanguage;
  client_name: string;
  consultant_name: string;
  include_appendix: boolean;
  branding?: {
    logo_storage_path?: string;
    primary_color?: string;
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STEP-SPECIFIC INPUT/OUTPUT INTERFACES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface Step1InputData {
  document_paths: string[];
  context_summary: string;
  language: SupportedLanguage;
}
export interface Step1OutputData {
  document_chunks: Array<{ path: string; chunk_count: number; token_count: number }>;
  total_tokens: number;
  ingestion_completed_at: string;
  /** Mandatory context summary (FR-S1-06) */
  context_summary?: string;
}

export interface Step2InputData { knowledge_node_id: string; }
export interface Step2OutputData {
  bottlenecks: OperationalBottleneck[];
  executive_summary: string;
  total_impact_score: number;
  model_metadata: ModelCallMetadata;
}

export interface Step3InputData {
  hypothesis_node_id: string;
  target_stakeholder_roles: string[];
}
export interface Step3OutputData {
  interview_guide_title: string;
  introduction_script: string;
  questions: InterviewQuestion[];
  closing_script: string;
  estimated_duration_minutes: number;
  model_metadata: ModelCallMetadata;
}

export interface Step4InputData {
  transcript_paths: string[];
  interview_date: string;
  stakeholders_interviewed: string[];
  notes?: string;
}
export interface Step4OutputData {
  transcript_storage_path: string;
  word_count: number;
  processing_method: 'manual_text' | 'audio_transcription';
  uploaded_at: string;
}

export interface Step5InputData {
  hypothesis_node_id: string;
  human_breakpoint_node_id: string;
}
export interface Step5OutputData {
  gap_findings: GapFinding[];
  new_bottlenecks: OperationalBottleneck[];
  overall_alignment_score: number;
  analyst_summary: string;
  model_metadata: ModelCallMetadata;
}

export interface Step6InputData {
  gap_analysis_node_id: string;
  sme_profile: SMEProfile;
}
export interface Step6OutputData {
  solutions: AutomationSolution[];
  executive_summary: string;
  total_estimated_roi_eur_per_year: number;
  implementation_roadmap: RoadmapPhase[];
  model_metadata: ModelCallMetadata;
}

export interface Step7InputData {
  solution_architect_node_id: string;
  report_config: ReportConfig;
}

/**
 * A single item in the implementation roadmap (Step 7 report output).
 * The `id` field is required for targeted AI reprocessing (FR-S7-HEC-02).
 */
export interface RoadmapItem {
  /** Unique identifier — used as item_id in targeted-reprocess calls */
  id?: string;
  title: string;
  timeline?: string;
  expected_roi_eur?: number;
  solution_id?: string;
}

export interface Step7OutputData {
  executive_summary: string;
  key_findings: string[];
  solution_overview: string;
  detailed_roadmap_markdown: string;
  methodology_note?: string;
  /** Roadmap items for display in the report (FR-S7-HEC-02: each may have an id for targeted reprocess) */
  roadmap_items?: RoadmapItem[];
  /** Storage path for the generated PDF in the 'report-exports' bucket */
  report_storage_path?: string;
  /** Optional human-authored closing note (FR-S7-HEC-06) */
  closing_note?: string;
  /** Optional human-authored section (FR-S7-HEC-06) */
  consultant_commentary?: string;
  total_roi_summary: {
    total_cost_reduction_eur: number;
    total_hours_saved_per_month: number;
    top_priority_solution_id: string;
  };
  export_formats_available: ('pdf' | 'docx' | 'html')[];
  generated_at: string;
  model_metadata: ModelCallMetadata;
}

/**
 * Report section keys used in human_overrides map (Amendment OPERIA-AMD-001).
 * effectiveSection = human_overrides?.[key] ?? output_data[key]
 */
export type ReportSectionKey =
  | 'executive_summary'
  | 'key_findings'
  | 'solution_overview'
  | 'detailed_roadmap_markdown'
  | 'consultant_commentary';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPED NODE ALIASES & DISCRIMINATED UNION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type Step1Node = WorkflowNode<Step1InputData, Step1OutputData>;
export type Step2Node = WorkflowNode<Step2InputData, Step2OutputData>;
export type Step3Node = WorkflowNode<Step3InputData, Step3OutputData>;
export type Step4Node = WorkflowNode<Step4InputData, Step4OutputData>;
export type Step5Node = WorkflowNode<Step5InputData, Step5OutputData>;
export type Step6Node = WorkflowNode<Step6InputData, Step6OutputData>;
export type Step7Node = WorkflowNode<Step7InputData, Step7OutputData>;

export type AnyWorkflowNode =
  | (Step1Node & { step_type: WorkflowStep.KNOWLEDGE_INGESTION })
  | (Step2Node & { step_type: WorkflowStep.HYPOTHESIS_GENERATION })
  | (Step3Node & { step_type: WorkflowStep.INTERVIEW_ARCHITECT })
  | (Step4Node & { step_type: WorkflowStep.HUMAN_BREAKPOINT })
  | (Step5Node & { step_type: WorkflowStep.GAP_ANALYSIS })
  | (Step6Node & { step_type: WorkflowStep.SOLUTION_ARCHITECT })
  | (Step7Node & { step_type: WorkflowStep.REPORTING });

export function isStep<T extends WorkflowStep>(
  node: AnyWorkflowNode,
  step: T
): node is Extract<AnyWorkflowNode, { step_type: T }> {
  return node.step_type === step;
}

export function getActiveNode<T extends WorkflowStep>(
  nodes: AnyWorkflowNode[],
  step: T
): Extract<AnyWorkflowNode, { step_type: T }> | undefined {
  return nodes
    .filter((n): n is Extract<AnyWorkflowNode, { step_type: T }> =>
      n.step_type === step && n.execution_status === 'completed'
    )
    .sort((a, b) => b.version - a.version)[0];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOOK RETURN TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UseStepEditorReturn<T> {
  draft: T;
  isDirty: boolean;
  dirtyItems: Set<string>;
  isSaving: boolean;
  /** Mutates an item inside an array field. For array-based steps (2, 3, 5, 6). */
  updateItem: (itemId: string, patch: Partial<unknown>) => void;
  /**
   * Patches top-level scalar fields directly onto the draft.
   * Required for Step 7 report sections that are not array items.
   * Uses sentinel dirty key '__root__' so isDirty stays truthful.
   */
  updateRoot: (patch: Partial<T>) => void;
  addItem: (newItem: unknown) => void;
  deleteItem: (itemId: string) => void;
  applyReprocessResult: (itemId: string, revisedItem: unknown, callId: string) => void;
  /** Optional human_overrides for Step 7 section-level overrides (BUG-04) */
  save: (human_overrides?: Record<string, string>) => Promise<{ node_id: string }>;
  discard: () => void;
}

export interface ReprocessRequest {
  step_type: WorkflowStep;
  item_type: ItemType;
  item_id: string;
  instruction?: string;
}

export interface ReprocessResult {
  call_id: string;
  revised_item: unknown;
}

export interface UseTargetedReprocessReturn {
  reprocess: (params: ReprocessRequest) => Promise<ReprocessResult>;
  isReprocessing: Record<string, boolean>;
  pendingCallIds: string[];
  clearPendingCalls: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FORM TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface CreateProjectForm {
  name: string;
  client_name: string;
  industry: string;
  country: string;
  language: SupportedLanguage;
  context_summary?: string;
  sme_profile?: Partial<SMEProfile>;
}

export interface InviteCollaboratorForm {
  email: string;
  role: 'editor' | 'viewer';
}
