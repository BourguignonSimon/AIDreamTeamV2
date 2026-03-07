/**
 * StepStatusIndicator — Per-Step Status Icon
 *
 * Shows a visual indicator for a step's current state in the stepper.
 */

import { Check, Lock, Play, Clock, AlertTriangle, X, Loader2 } from 'lucide-react';
import type { StepStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

interface StepStatusIndicatorProps {
  status: StepStatus;
  stepNumber: number;
  isActive?: boolean;
  className?: string;
}

export default function StepStatusIndicator({
  status,
  stepNumber,
  isActive,
  className,
}: StepStatusIndicatorProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all',
        config.className,
        isActive && 'ring-2 ring-primary ring-offset-2',
        className
      )}
      aria-label={`Step ${stepNumber}: ${status}`}
    >
      {config.icon ?? stepNumber}
    </div>
  );
}

const STATUS_CONFIG: Record<StepStatus, { className: string; icon?: React.ReactNode }> = {
  locked: {
    className: 'border-muted bg-muted text-muted-foreground',
    icon: <Lock className="h-3.5 w-3.5" />,
  },
  unlocked: {
    className: 'border-primary bg-white text-primary',
  },
  running: {
    className: 'border-blue-500 bg-blue-50 text-blue-700',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
  },
  awaiting_evaluation: {
    className: 'border-blue-300 bg-blue-50 text-blue-600',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  evaluating: {
    className: 'border-blue-400 bg-blue-50 text-blue-600',
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  complete: {
    className: 'border-green-500 bg-green-500 text-white',
    icon: <Check className="h-4 w-4" />,
  },
  needs_review: {
    className: 'border-amber-500 bg-amber-50 text-amber-700',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  failed: {
    className: 'border-red-500 bg-red-50 text-red-700',
    icon: <X className="h-4 w-4" />,
  },
};
