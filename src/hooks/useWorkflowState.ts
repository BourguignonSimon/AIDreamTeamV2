/**
 * useWorkflowState — Server State + Realtime Subscriptions
 *
 * Owns all workflow-related server state for a project.
 * Subscribes to Supabase Realtime on workflow_nodes, ai_quality_gates,
 * and pipeline_executions — the UI never polls (AR-07).
 *
 * Spec: Section 8.3
 *
 * Must NOT:
 * - Contain step unlock logic (that lives in useStepGating)
 * - Contain any UI rendering
 * - Hold a reference to setActiveStep or any presentational state
 */

import { useEffect, useReducer, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  AnyWorkflowNode,
  AIQualityGate,
  PipelineExecution,
  ProjectDocument,
} from '@/lib/types';
import { REALTIME_CHANNELS } from '@/lib/constants';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface WorkflowState {
  nodes: AnyWorkflowNode[];
  gates: AIQualityGate[];
  executions: PipelineExecution[];
  documents: ProjectDocument[];
  isLoading: boolean;
  error: string | null;
}

type WorkflowAction =
  | { type: 'LOADED'; nodes: AnyWorkflowNode[]; gates: AIQualityGate[]; executions: PipelineExecution[]; documents: ProjectDocument[] }
  | { type: 'NODE_UPSERT'; node: AnyWorkflowNode }
  | { type: 'GATE_UPSERT'; gate: AIQualityGate }
  | { type: 'EXECUTION_UPSERT'; execution: PipelineExecution }
  | { type: 'DOCUMENT_ADDED'; document: ProjectDocument }
  | { type: 'DOCUMENT_REMOVED'; documentId: string }
  | { type: 'ERROR'; message: string };

function reducer(state: WorkflowState, action: WorkflowAction): WorkflowState {
  switch (action.type) {
    case 'LOADED':
      return {
        ...state,
        nodes: action.nodes,
        gates: action.gates,
        executions: action.executions,
        documents: action.documents,
        isLoading: false,
        error: null,
      };

    case 'NODE_UPSERT': {
      const existing = state.nodes.findIndex((n) => n.id === action.node.id);
      const nodes = existing >= 0
        ? state.nodes.map((n, i) => (i === existing ? action.node : n))
        : [...state.nodes, action.node];
      return { ...state, nodes };
    }

    case 'GATE_UPSERT': {
      const existing = state.gates.findIndex((g) => g.id === action.gate.id);
      const gates = existing >= 0
        ? state.gates.map((g, i) => (i === existing ? action.gate : g))
        : [...state.gates, action.gate];
      return { ...state, gates };
    }

    case 'EXECUTION_UPSERT': {
      const existing = state.executions.findIndex((e) => e.id === action.execution.id);
      const executions = existing >= 0
        ? state.executions.map((e, i) => (i === existing ? action.execution : e))
        : [...state.executions, action.execution];
      return { ...state, executions };
    }

    case 'DOCUMENT_ADDED':
      return { ...state, documents: [...state.documents, action.document] };

    case 'DOCUMENT_REMOVED':
      return { ...state, documents: state.documents.filter((d) => d.id !== action.documentId) };

    case 'ERROR':
      return { ...state, isLoading: false, error: action.message };

    default:
      return state;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOOK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface UseWorkflowStateReturn {
  nodes: AnyWorkflowNode[];
  gates: AIQualityGate[];
  executions: PipelineExecution[];
  documents: ProjectDocument[];
  isLoading: boolean;
  error: string | null;
  addDocument: (document: ProjectDocument) => void;
  removeDocument: (documentId: string) => void;
}

const initialState: WorkflowState = {
  nodes: [],
  gates: [],
  executions: [],
  documents: [],
  isLoading: true,
  error: null,
};

export function useWorkflowState(projectId: string): UseWorkflowStateReturn {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Initial data fetch
  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;

    async function loadInitialData() {
      const [nodesResult, gatesResult, executionsResult, documentsResult] = await Promise.all([
        supabase
          .from('workflow_nodes')
          .select('*')
          .eq('project_id', projectId)
          .order('version', { ascending: false }),
        supabase
          .from('ai_quality_gates')
          .select('*')
          .eq('project_id', projectId),
        supabase
          .from('pipeline_executions')
          .select('*')
          .eq('project_id', projectId)
          .order('queued_at', { ascending: false })
          .limit(50),
        supabase
          .from('project_documents')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

      if (cancelled) return;

      // Surface the first error encountered across all parallel fetches
      const firstError = nodesResult.error ?? gatesResult.error ?? executionsResult.error ?? documentsResult.error;
      if (firstError) {
        dispatch({ type: 'ERROR', message: firstError.message });
        return;
      }

      dispatch({
        type: 'LOADED',
        nodes: (nodesResult.data ?? []) as unknown as AnyWorkflowNode[],
        gates: gatesResult.data ?? [],
        executions: (executionsResult.data ?? []) as unknown as PipelineExecution[],
        documents: documentsResult.data ?? [],
      });
    }

    void loadInitialData();

    return () => { cancelled = true; };
  }, [projectId]);

  // Realtime subscriptions (AR-07)
  useEffect(() => {
    if (!projectId) return;

    // workflow_nodes: step completions and status transitions
    const nodesChannel = supabase
      .channel(`${REALTIME_CHANNELS.WORKFLOW_NODES}-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workflow_nodes', filter: `project_id=eq.${projectId}` },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            dispatch({ type: 'NODE_UPSERT', node: payload.new as unknown as AnyWorkflowNode });
          }
        }
      )
      .subscribe();

    // ai_quality_gates: async evaluation results (AIQualityBadge updates)
    const gatesChannel = supabase
      .channel(`${REALTIME_CHANNELS.QUALITY_GATES}-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ai_quality_gates', filter: `project_id=eq.${projectId}` },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            dispatch({ type: 'GATE_UPSERT', gate: payload.new as AIQualityGate });
          }
        }
      )
      .subscribe();

    // pipeline_executions: progress indicators while AI steps run
    const executionsChannel = supabase
      .channel(`${REALTIME_CHANNELS.PIPELINE_EXECUTIONS}-${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pipeline_executions', filter: `project_id=eq.${projectId}` },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            dispatch({ type: 'EXECUTION_UPSERT', execution: payload.new as unknown as PipelineExecution });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(nodesChannel);
      void supabase.removeChannel(gatesChannel);
      void supabase.removeChannel(executionsChannel);
    };
  }, [projectId]);

  const addDocument = useCallback((document: ProjectDocument) => {
    dispatch({ type: 'DOCUMENT_ADDED', document });
  }, []);

  const removeDocument = useCallback((documentId: string) => {
    dispatch({ type: 'DOCUMENT_REMOVED', documentId });
  }, []);

  return {
    nodes: state.nodes,
    gates: state.gates,
    executions: state.executions,
    documents: state.documents,
    isLoading: state.isLoading,
    error: state.error,
    addDocument,
    removeDocument,
  };
}
