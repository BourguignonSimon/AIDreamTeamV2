/**
 * useStepGating — Step Unlock and Quality Gate Logic
 *
 * Pure computed hook: derives step status from node and gate state.
 * Contains NO Supabase calls and NO internal state.
 * Uses useMemo to avoid re-computation on unrelated renders.
 *
 * Spec: Section 8.3
 *
 * Must NOT:
 * - Make any Supabase calls
 * - Maintain any internal state (pure derived computation)
 * - Have any knowledge of UI concerns
 */

import { useMemo } from 'react';
import type { AnyWorkflowNode, AIQualityGate, StepStatus } from '@/lib/types';
import { WorkflowStep, STEP_ORDER } from '@/lib/types';
import {
  AI_DRIVEN_STEPS,
  QUALITY_GATE_PASS_THRESHOLD,
  QUALITY_GATE_REVIEW_THRESHOLD,
} from '@/lib/constants';

export interface UseStepGatingReturn {
  /** Get the computed status for a step */
  getStepStatus: (step: WorkflowStep) => StepStatus;
  /** Returns true if a step can be triggered */
  isStepUnlocked: (step: WorkflowStep) => boolean;
  /** The computed status map for all 7 steps */
  stepStatuses: Record<WorkflowStep, StepStatus>;
}

export function useStepGating(
  nodes: AnyWorkflowNode[],
  gates: AIQualityGate[]
): UseStepGatingReturn {
  const stepStatuses = useMemo<Record<WorkflowStep, StepStatus>>(() => {
    const result = {} as Record<WorkflowStep, StepStatus>;

    // Index nodes by step_type (latest version first for each step)
    const nodesByStep: Partial<Record<WorkflowStep, AnyWorkflowNode>> = {};
    for (const node of nodes) {
      const existing = nodesByStep[node.step_type];
      if (!existing || node.version > existing.version) {
        nodesByStep[node.step_type] = node;
      }
    }

    // Index gates by node_id
    const gatesByNodeId: Record<string, AIQualityGate> = {};
    for (const gate of gates) {
      gatesByNodeId[gate.node_id] = gate;
    }

    for (let i = 0; i < STEP_ORDER.length; i++) {
      const step = STEP_ORDER[i];
      const node = nodesByStep[step];
      const prevStep = i > 0 ? STEP_ORDER[i - 1] : null;
      const prevNode = prevStep ? nodesByStep[prevStep] : null;

      // Step 1 is always available if no document has been uploaded yet
      if (step === WorkflowStep.KNOWLEDGE_INGESTION) {
        if (!node || node.execution_status !== 'completed') {
          result[step] = 'unlocked';
        } else {
          result[step] = 'complete';
        }
        continue;
      }

      // All other steps require the previous step to be complete
      if (!prevNode || prevNode.execution_status !== 'completed') {
        result[step] = 'locked';
        continue;
      }

      // Check if previous AI step's quality gate has passed (if applicable)
      if (prevStep && AI_DRIVEN_STEPS.has(prevStep) && prevNode) {
        const prevGate = gatesByNodeId[prevNode.id];
        if (prevGate) {
          if (prevGate.status === 'failed' && prevGate.evaluation_status === 'completed') {
            const minScore = Math.min(
              prevGate.pragmatism_score ?? 0,
              prevGate.roi_focus_score ?? 0
            );
            if (minScore < QUALITY_GATE_REVIEW_THRESHOLD) {
              // Red threshold: current step is locked until re-run or override
              result[step] = 'locked';
              continue;
            }
          }
          // needs_review (amber) allows advancing with acknowledgment
        }
      }

      // Determine this step's own status
      if (!node) {
        result[step] = 'unlocked';
        continue;
      }

      switch (node.execution_status) {
        case 'running':
          result[step] = 'running';
          break;
        case 'failed':
          result[step] = 'failed';
          break;
        case 'retrying':
          result[step] = 'running';
          break;
        case 'completed': {
          // Check quality gate for this step if it's an AI step
          if (AI_DRIVEN_STEPS.has(step)) {
            const gate = gatesByNodeId[node.id];
            if (!gate || gate.evaluation_status === 'pending') {
              result[step] = 'awaiting_evaluation';
            } else if (gate.evaluation_status === 'evaluating') {
              result[step] = 'evaluating';
            } else if (gate.status === 'passed' || gate.status === 'overridden' || gate.evaluation_status === 'skipped') {
              result[step] = 'complete';
            } else if (gate.status === 'failed') {
              const minScore = Math.min(
                gate.pragmatism_score ?? 0,
                gate.roi_focus_score ?? 0
              );
              result[step] = minScore >= QUALITY_GATE_REVIEW_THRESHOLD ? 'needs_review' : 'failed';
            } else {
              result[step] = 'complete';
            }
          } else {
            result[step] = 'complete';
          }
          break;
        }
        default:
          result[step] = 'locked';
      }
    }

    return result;
  }, [nodes, gates]);

  const getStepStatus = useMemo(
    () => (step: WorkflowStep): StepStatus => stepStatuses[step] ?? 'locked',
    [stepStatuses]
  );

  const isStepUnlocked = useMemo(
    () => (step: WorkflowStep): boolean => {
      const status = stepStatuses[step];
      return status === 'unlocked' || status === 'complete' || status === 'needs_review' || status === 'failed';
    },
    [stepStatuses]
  );

  return { getStepStatus, isStepUnlocked, stepStatuses };
}
