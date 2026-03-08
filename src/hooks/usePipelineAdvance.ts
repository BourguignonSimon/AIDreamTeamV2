/**
 * usePipelineAdvance — Pipeline Orchestrator Invocation
 *
 * Wraps the supabase.functions.invoke('pipeline-orchestrator') call.
 * Manages loading and error state for the invocation.
 *
 * Spec: Section 8.3
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface AdvancePipelineParams {
  project_id: string;
  action: string;
  /** Optional additional data passed to the orchestrator */
  metadata?: Record<string, unknown>;
}

export interface AdvancePipelineResult {
  status: 'queued' | 'already_queued' | 'up_to_date';
  step?: string;
  execution_id?: string;
}

export interface UsePipelineAdvanceReturn {
  advance: (params: AdvancePipelineParams) => Promise<AdvancePipelineResult>;
  isAdvancing: boolean;
  advanceError: string | null;
}

export function usePipelineAdvance(): UsePipelineAdvanceReturn {
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string | null>(null);

  const advance = useCallback(async (params: AdvancePipelineParams): Promise<AdvancePipelineResult> => {
    setIsAdvancing(true);
    setAdvanceError(null);

    try {
      const { data, error } = await supabase.functions.invoke('pipeline-orchestrator', {
        body: {
          project_id: params.project_id,
          action: params.action,
          payload: params.metadata ?? null,
        },
      });

      if (error) {
        throw new Error(error.message ?? 'Pipeline invocation failed');
      }

      return data as AdvancePipelineResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to advance pipeline';
      setAdvanceError(message);
      throw err;
    } finally {
      setIsAdvancing(false);
    }
  }, []);

  return { advance, isAdvancing, advanceError };
}
