/**
 * useStepEditor — In-Place Editing State Machine
 *
 * Owns the complete editing lifecycle for a single step panel.
 * Introduced in v2 (Amendment OPERIA-AMD-001).
 *
 * Maintains a local mutable draft of the step's output_data.
 * Tracks which items have been modified (dirtyItems).
 * Saves via save-human-edit Edge Function.
 *
 * Spec: Section 8.3
 *
 * Must NOT:
 * - Make any Supabase calls other than via save-human-edit on save()
 * - Contain any presentation logic
 * - Be shared across multiple steps (one instance per mounted step panel)
 *
 * updateItem(itemId, patch) — mutates an item inside an array field (Steps 2/3/5/6)
 * updateRoot(patch)         — patches top-level scalar fields directly (Step 7)
 *
 * The sentinel dirty key '__root__' is used when updateRoot is called so that
 * isDirty and dirtyItems.size remain truthful for the Save bar.
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { deepClone } from '@/lib/utils';
import type { WorkflowNode, WorkflowStep, UseStepEditorReturn } from '@/lib/types';

export function useStepEditor<T extends object>(
  stepType: WorkflowStep,
  activeNode: WorkflowNode<unknown, T> | null
): UseStepEditorReturn<T> {
  const [draft, setDraft] = useState<T>(() =>
    deepClone(activeNode?.output_data ?? ({} as T))
  );
  const [dirtyItems, setDirtyItems] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [pendingCallIds, setPendingCallIds] = useState<string[]>([]);

  const isDirty = dirtyItems.size > 0;

  // BUG-03: Reset draft when the active node changes (e.g. after save returns a new node_id
  // and Realtime updates activeNode). Only reset when there are no unsaved edits to avoid
  // clobbering concurrent in-flight user changes.
  useEffect(() => {
    if (dirtyItems.size === 0) {
      setDraft(deepClone(activeNode?.output_data ?? ({} as T)));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNode?.id]);

  /**
   * Merges a partial update into the draft for one item.
   * The item must be in an array field within output_data.
   * Do NOT call with itemId = 'root' — use updateRoot() instead.
   */
  const updateItem = useCallback((itemId: string, patch: Partial<unknown>) => {
    setDraft((prev) => {
      const updated = deepClone(prev);
      // Find and update the item across all array fields
      for (const key of Object.keys(updated)) {
        const arr = (updated as Record<string, unknown>)[key];
        if (Array.isArray(arr)) {
          const idx = arr.findIndex(
            (item: unknown) => typeof item === 'object' && item !== null && (item as Record<string, unknown>).id === itemId
          );
          if (idx >= 0) {
            arr[idx] = {
              ...arr[idx] as Record<string, unknown>,
              ...(patch as Record<string, unknown>),
              origin: 'human_edit',
            };
            break;
          }
        }
      }
      return updated;
    });
    setDirtyItems((prev: Set<string>) => new Set(prev).add(itemId));
  }, []);

  /**
   * Patches top-level scalar fields directly onto the draft.
   * Required for Step 7 report sections (executive_summary, methodology_note,
   * closing_note, etc.) which are not array items and therefore cannot be
   * targeted by updateItem.
   *
   * Uses the sentinel dirty key '__root__' so that isDirty stays truthful.
   *
   * @example editor.updateRoot({ executive_summary: newText })
   */
  const updateRoot = useCallback((patch: Partial<T>) => {
    setDraft((prev) => ({
      ...deepClone(prev),
      ...patch,
    }));
    setDirtyItems((prev: Set<string>) => new Set(prev).add('__root__'));
  }, []);

  /**
   * Appends a new item tagged origin: 'human_added'.
   * The item is added to the appropriate array field based on its structure.
   */
  const addItem = useCallback((newItem: unknown) => {
    const item = newItem as Record<string, unknown>;
    const itemWithOrigin = { ...item, origin: 'human_added' };

    setDraft((prev) => {
      const updated = deepClone(prev);
      // Determine target array by inspecting item structure
      const targetKey = inferArrayKey(updated, item);
      if (targetKey) {
        const arr = (updated as Record<string, unknown>)[targetKey] as unknown[];
        arr.push(itemWithOrigin);
      }
      return updated;
    });

    const itemId = (item.id as string) ?? crypto.randomUUID();
    setDirtyItems((prev: Set<string>) => new Set(prev).add(itemId));
  }, []);

  /**
   * Removes an item from the draft.
   */
  const deleteItem = useCallback((itemId: string) => {
    setDraft((prev) => {
      const updated = deepClone(prev);
      for (const key of Object.keys(updated)) {
        const arr = (updated as Record<string, unknown>)[key];
        if (Array.isArray(arr)) {
          const idx = arr.findIndex(
            (item: unknown) => typeof item === 'object' && item !== null && (item as Record<string, unknown>).id === itemId
          );
          if (idx >= 0) {
            arr.splice(idx, 1);
            break;
          }
        }
      }
      return updated;
    });
    setDirtyItems((prev: Set<string>) => {
      const next = new Set(prev);
      next.add(`deleted:${itemId}`);
      return next;
    });
  }, []);

  /**
   * Replaces an item with the AI's revised version.
   * Marks the targetedReprocess call ID as pending-applied.
   */
  const applyReprocessResult = useCallback(
    (itemId: string, revisedItem: unknown, callId: string) => {
      updateItem(itemId, revisedItem as Partial<unknown>);
      setPendingCallIds((prev: string[]) => [...prev, callId]);
    },
    [updateItem]
  );

  /**
   * Saves the current draft as a new human-edit versioned node.
   * Accepts optional human_overrides for Step 7 section-level overrides.
   * Resets dirty tracking on success.
   */
  const save = useCallback(async (human_overrides?: Record<string, string>): Promise<{ node_id: string }> => {
    if (!activeNode) throw new Error('No active node to save against');

    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('save-human-edit', {
        body: {
          project_id:       activeNode.project_id,
          step_type:        stepType,
          source_node_id:   activeNode.id,
          output_data:      draft,
          human_overrides:  human_overrides ?? null,
          applied_call_ids: pendingCallIds,
        },
      });

      if (error) throw new Error(error.message ?? 'Save failed');

      // Reset dirty state
      setDirtyItems(new Set());
      setPendingCallIds([]);

      return data as { node_id: string };
    } finally {
      setIsSaving(false);
    }
  }, [activeNode, stepType, draft, pendingCallIds]);

  /**
   * Discards all changes and resets draft to the active node's output_data.
   */
  const discard = useCallback(() => {
    setDraft(deepClone(activeNode?.output_data ?? ({} as T)));
    setDirtyItems(new Set());
    setPendingCallIds([]);
  }, [activeNode]);

  return {
    draft,
    isDirty,
    dirtyItems,
    isSaving,
    updateItem,
    updateRoot,
    addItem,
    deleteItem,
    applyReprocessResult,
    save,
    discard,
  };
}

/**
 * Infers which array field an item belongs to based on its structure.
 * Falls back to the first array field if structure is ambiguous.
 */
function inferArrayKey(
  output: Record<string, unknown>,
  item: Record<string, unknown>
): string | null {
  // Structural hints by item fields
  if ('bottleneck_id' in item && 'confirmed' in item) return 'gap_findings';
  if ('question' in item && 'linked_bottleneck_id' in item) return 'questions';
  if ('severity' in item && 'automation_potential' in item) return 'bottlenecks';
  if ('technology_stack' in item && 'estimated_roi' in item) return 'solutions';

  // Fall back to first array field
  for (const key of Object.keys(output)) {
    if (Array.isArray((output as Record<string, unknown>)[key])) {
      return key;
    }
  }
  return null;
}
