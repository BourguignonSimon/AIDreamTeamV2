/**
 * AIQualityBadge — Display-Only Quality Gate Status Component
 *
 * Shows the current evaluation status and scores for an AI step's output.
 * Receives data via props — no server calls.
 * Updated reactively via Realtime (useWorkflowState provides gates array).
 *
 * Scoring thresholds (Section 6.6):
 * - Both ≥ 60: passed (green)
 * - Either 40–59: needs_review (amber)
 * - Either < 40: failed (red)
 *
 * Spec: Section 3.4, FR-QG-03
 */

import { useTranslation } from 'react-i18next';
import { CheckCircle, AlertCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import type { AIQualityGate } from '@/lib/types';
import { cn } from '@/lib/utils';
import { QUALITY_GATE_PASS_THRESHOLD, QUALITY_GATE_REVIEW_THRESHOLD } from '@/lib/constants';

interface AIQualityBadgeProps {
  gate: AIQualityGate | null;
  /** Whether to show the score breakdown */
  showScores?: boolean;
  /** Callback when user overrides a failed gate */
  onOverride?: (reason: string) => void;
  className?: string;
}

export default function AIQualityBadge({
  gate,
  showScores = false,
  onOverride,
  className,
}: AIQualityBadgeProps) {
  const { t } = useTranslation();

  if (!gate) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground', className)}>
        <Clock className="h-3 w-3" />
        {t('quality.pending')}
      </span>
    );
  }

  // Determine visual state
  type BadgeVariant = 'pending' | 'evaluating' | 'passed' | 'needs_review' | 'failed' | 'overridden';
  let variant: BadgeVariant;

  if (gate.evaluation_status === 'pending') {
    variant = 'pending';
  } else if (gate.evaluation_status === 'evaluating') {
    variant = 'evaluating';
  } else if (gate.status === 'overridden') {
    variant = 'overridden';
  } else if (gate.status === 'passed') {
    variant = 'passed';
  } else {
    const minScore = Math.min(gate.pragmatism_score ?? 0, gate.roi_focus_score ?? 0);
    variant = minScore >= QUALITY_GATE_REVIEW_THRESHOLD ? 'needs_review' : 'failed';
  }

  const variantConfig: Record<BadgeVariant, {
    label: string;
    icon: React.ReactNode;
    className: string;
  }> = {
    pending: {
      label: t('quality.pending'),
      icon: <Clock className="h-3 w-3" />,
      className: 'bg-muted text-muted-foreground',
    },
    evaluating: {
      label: t('quality.evaluating'),
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      className: 'bg-blue-50 text-blue-700',
    },
    passed: {
      label: t('quality.passed'),
      icon: <CheckCircle className="h-3 w-3" />,
      className: 'bg-green-50 text-green-700',
    },
    needs_review: {
      label: t('quality.needs_review'),
      icon: <AlertCircle className="h-3 w-3" />,
      className: 'bg-amber-50 text-amber-700',
    },
    failed: {
      label: t('quality.failed'),
      icon: <XCircle className="h-3 w-3" />,
      className: 'bg-red-50 text-red-700',
    },
    overridden: {
      label: t('quality.overridden'),
      icon: <CheckCircle className="h-3 w-3" />,
      className: 'bg-purple-50 text-purple-700',
    },
  };

  const config = variantConfig[variant];

  return (
    <div className={cn('inline-flex flex-col gap-1', className)}>
      <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', config.className)}>
        {config.icon}
        {config.label}
      </span>

      {showScores && gate.evaluation_status === 'completed' && gate.pragmatism_score !== null && (
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>
            {t('quality.pragmatism')}: <strong>{gate.pragmatism_score}</strong>
          </span>
          <span>
            {t('quality.roi_focus')}: <strong>{gate.roi_focus_score}</strong>
          </span>
        </div>
      )}

      {showScores && gate.rationale && (
        <p className="max-w-xs text-xs text-muted-foreground">{gate.rationale}</p>
      )}

      {(variant === 'needs_review' || variant === 'failed') && onOverride && (
        <OverrideButton onOverride={onOverride} />
      )}
    </div>
  );
}

function OverrideButton({ onOverride }: { onOverride: (reason: string) => void }) {
  const { t } = useTranslation();

  function handleClick() {
    const reason = window.prompt(t('quality.override_reason'));
    if (reason) onOverride(reason);
  }

  return (
    <button
      onClick={handleClick}
      className="text-xs text-muted-foreground underline hover:text-foreground transition-colors text-left"
    >
      {t('quality.override')}
    </button>
  );
}
