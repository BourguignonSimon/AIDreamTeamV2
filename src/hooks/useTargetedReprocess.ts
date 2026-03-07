/**
 * useTargetedReprocess — Scoped AI Re-process Calls
 *
 * Manages targeted AI re-process calls and their pending results.
 * Each call targets a single item within a step's output. (AR-10, Amendment OPERIA-AMD-001)
 *
 * The hook tracks per-item loading state so multiple items can be reprocessing
 * simultaneously without blocking each other.
 *
 * Spec: Section 8.3
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type {
  ReprocessRequest,
  ReprocessResult,
  UseTargetedReprocessReturn,
  WorkflowStep,
} from '@/lib/types';

export function useTargetedReprocess(
  projectId: string,
  sourceNodeId: string
): UseTargetedReprocessReturn {
  const [isReprocessing, setIsReprocessing] = useState<Record<string, boolean>>({});
  const [pendingCallIds, setPendingCallIds] = useState<string[]>([]);

  const reprocess = useCallback(
    async (params: ReprocessRequest): Promise<ReprocessResult> => {
      const { item_id, step_type, item_type, instruction } = params;

      setIsReprocessing((prev) => ({ ...prev, [item_id]: true }));

      try {
        const { data, error } = await supabase.functions.invoke('targeted-reprocess', {
          body: {
            project_id:     projectId,
            source_node_id: sourceNodeId,
            step_type,
            item_type,
            item_id,
            instruction:    instruction ?? null,
          },
        });

        if (error) {
          throw new Error(error.message ?? 'Reprocess call failed');
        }

        const result = data as ReprocessResult;
        setPendingCallIds((prev) => [...prev, result.call_id]);

        return result;
      } finally {
        setIsReprocessing((prev) => ({ ...prev, [item_id]: false }));
      }
    },
    [projectId, sourceNodeId]
  );

  const clearPendingCalls = useCallback(() => {
    setPendingCallIds([]);
  }, []);

  return {
    reprocess,
    isReprocessing,
    pendingCallIds,
    clearPendingCalls,
  };
}
