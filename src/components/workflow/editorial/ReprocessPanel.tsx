/**
 * ReprocessPanel — Instruction Input + Result Preview
 *
 * Shown when a user triggers a targeted AI re-process on an item.
 * Allows entering an optional instruction, shows the AI result,
 * and lets the editor accept or reject the revised version.
 *
 * Spec: Amendment OPERIA-AMD-001, Section 9.5
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReprocessPanelProps {
  itemId: string;
  isLoading: boolean;
  revisedItem?: unknown;
  onSubmit: (instruction?: string) => void;
  onAccept: () => void;
  onReject: () => void;
  className?: string;
}

export default function ReprocessPanel({
  itemId,
  isLoading,
  revisedItem,
  onSubmit,
  onAccept,
  onReject,
  className,
}: ReprocessPanelProps) {
  const { t } = useTranslation();
  const [instruction, setInstruction] = useState('');

  return (
    <div className={cn('rounded-lg border border-purple-200 bg-purple-50 p-4 space-y-3', className)}>
      {/* Instruction input */}
      {!revisedItem && (
        <>
          <div>
            <label className="block text-xs font-medium text-purple-900 mb-1">
              {t('editorial.reprocess_instruction')}
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={t('editorial.reprocess_instruction_placeholder')}
              rows={2}
              className="w-full rounded border border-purple-300 bg-white px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-purple-400"
              disabled={isLoading}
            />
          </div>
          <button
            onClick={() => onSubmit(instruction || undefined)}
            disabled={isLoading}
            className="flex items-center gap-2 rounded bg-purple-600 px-3 py-1.5 text-xs text-white hover:bg-purple-700 disabled:opacity-60 transition-colors"
          >
            {isLoading ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> {t('common.loading')}</>
            ) : (
              t('editorial.reprocess')
            )}
          </button>
        </>
      )}

      {/* Result preview */}
      {revisedItem && !isLoading && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-purple-900">AI Revised Version:</p>
          <pre className="rounded bg-white border border-purple-200 p-3 text-xs overflow-auto max-h-48">
            {JSON.stringify(revisedItem, null, 2)}
          </pre>
          <div className="flex gap-2">
            <button
              onClick={onAccept}
              className="flex items-center gap-1.5 rounded bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 transition-colors"
            >
              <Check className="h-3 w-3" />
              {t('editorial.apply')}
            </button>
            <button
              onClick={onReject}
              className="flex items-center gap-1.5 rounded border border-gray-300 px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3 w-3" />
              {t('editorial.reject')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
