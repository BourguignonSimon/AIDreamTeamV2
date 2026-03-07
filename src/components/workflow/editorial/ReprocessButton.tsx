/**
 * ReprocessButton — Targeted AI Re-process Trigger
 *
 * Button that initiates a scoped AI re-process call for a single item.
 * Shows loading state per-item while the AI call is in flight.
 *
 * Spec: Amendment OPERIA-AMD-001, FR-S2-HEC-05
 */

import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface ReprocessButtonProps {
  itemId: string;
  isLoading?: boolean;
  onClick: () => void;
  className?: string;
}

export default function ReprocessButton({
  itemId,
  isLoading,
  onClick,
  className,
}: ReprocessButtonProps) {
  const { t } = useTranslation();

  return (
    <button
      onClick={onClick}
      disabled={isLoading}
      aria-label={t('editorial.reprocess')}
      className={cn(
        'inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
        isLoading && 'cursor-not-allowed opacity-60',
        className
      )}
    >
      <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
      {isLoading ? t('common.loading') : t('editorial.reprocess')}
    </button>
  );
}
