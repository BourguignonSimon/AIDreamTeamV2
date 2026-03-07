/**
 * SaveEditBar — Sticky Save/Discard Bar
 *
 * Shown when a step panel has unsaved edits.
 * Stays at the bottom of the screen until the editor saves or discards.
 *
 * Spec: Amendment OPERIA-AMD-001, Section 8.2
 */

import { useTranslation } from 'react-i18next';
import { Save, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SaveEditBarProps {
  isDirty: boolean;
  isSaving: boolean;
  dirtyCount?: number;
  onSave: () => void;
  onDiscard: () => void;
}

export default function SaveEditBar({
  isDirty,
  isSaving,
  dirtyCount,
  onSave,
  onDiscard,
}: SaveEditBarProps) {
  const { t } = useTranslation();

  if (!isDirty) return null;

  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 shadow-lg">
      <div className="text-sm text-orange-800">
        <span className="font-medium">Unsaved changes</span>
        {dirtyCount !== undefined && dirtyCount > 0 && (
          <span className="ml-1 text-orange-600">({dirtyCount} item{dirtyCount !== 1 ? 's' : ''})</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onDiscard}
          disabled={isSaving}
          className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm text-orange-700 hover:bg-orange-100 transition-colors disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          {t('common.cancel')}
        </button>
        <button
          onClick={onSave}
          disabled={isSaving}
          className="flex items-center gap-1.5 rounded bg-orange-600 px-4 py-1.5 text-sm text-white hover:bg-orange-700 transition-colors disabled:opacity-60"
        >
          {isSaving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {t('common.loading')}</>
          ) : (
            <><Save className="h-4 w-4" /> {t('step2.save_edits')}</>
          )}
        </button>
      </div>
    </div>
  );
}
