/**
 * OriginBadge — Item Provenance Display
 *
 * Shows whether an item was AI-generated, human-edited, AI re-processed,
 * or human-added. Visible on each item in Step 2–7 panels. (FR-S2-HEC-07)
 *
 * Spec: Amendment OPERIA-AMD-001, Section 18.3
 */

import { useTranslation } from 'react-i18next';
import type { ItemOrigin } from '@/lib/types';
import { cn } from '@/lib/utils';

interface OriginBadgeProps {
  origin: ItemOrigin;
  className?: string;
}

export default function OriginBadge({ origin, className }: OriginBadgeProps) {
  const { t } = useTranslation();

  const config: Record<ItemOrigin, { label: string; className: string }> = {
    ai_generated: {
      label: t('editorial.origin.ai_generated'),
      className: 'bg-blue-50 text-blue-600',
    },
    human_edit: {
      label: t('editorial.origin.human_edit'),
      className: 'bg-orange-50 text-orange-600',
    },
    ai_reprocessed: {
      label: t('editorial.origin.ai_reprocessed'),
      className: 'bg-purple-50 text-purple-600',
    },
    human_added: {
      label: t('editorial.origin.human_added'),
      className: 'bg-green-50 text-green-600',
    },
  };

  const { label, className: variantClassName } = config[origin];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variantClassName,
        className
      )}
    >
      {label}
    </span>
  );
}
