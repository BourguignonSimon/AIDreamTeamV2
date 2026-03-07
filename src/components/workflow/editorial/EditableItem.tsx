/**
 * EditableItem — Generic Inline-Edit Wrapper
 *
 * Wraps any item in a card with edit/view toggling.
 * Shows OriginBadge and ReprocessButton in the header.
 *
 * Spec: Amendment OPERIA-AMD-001
 */

import { useState } from 'react';
import { Pencil, Check, X, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ItemOrigin } from '@/lib/types';
import OriginBadge from './OriginBadge';
import ReprocessButton from './ReprocessButton';
import { cn } from '@/lib/utils';

interface EditableItemProps {
  itemId: string;
  origin: ItemOrigin;
  isEditing?: boolean;
  isReprocessing?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  onDelete?: () => void;
  onReprocess?: () => void;
  children: React.ReactNode;
  editChildren?: React.ReactNode;
  className?: string;
}

export default function EditableItem({
  itemId,
  origin,
  isEditing: controlledIsEditing,
  isReprocessing,
  canEdit = true,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onReprocess,
  children,
  editChildren,
  className,
}: EditableItemProps) {
  const { t } = useTranslation();
  const [localEditing, setLocalEditing] = useState(false);

  const isEditing = controlledIsEditing ?? localEditing;

  function handleEdit() {
    setLocalEditing(true);
    onEdit?.();
  }

  function handleSave() {
    setLocalEditing(false);
    onSave?.();
  }

  function handleCancel() {
    setLocalEditing(false);
    onCancel?.();
  }

  function handleDelete() {
    if (window.confirm(t('common.confirm_delete'))) {
      onDelete?.();
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-card transition-all',
        isEditing ? 'border-primary/50 shadow-sm' : 'border-border hover:border-muted-foreground/30',
        className
      )}
    >
      {/* Item header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-muted">
        <OriginBadge origin={origin} />

        {canEdit && (
          <div className="flex items-center gap-1">
            {onReprocess && !isEditing && (
              <ReprocessButton
                itemId={itemId}
                isLoading={isReprocessing}
                onClick={onReprocess}
              />
            )}

            {!isEditing ? (
              <>
                <button
                  onClick={handleEdit}
                  className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  aria-label={t('common.edit')}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {onDelete && (
                  <button
                    onClick={handleDelete}
                    className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  className="rounded p-1 text-green-600 hover:bg-green-50 transition-colors"
                  aria-label={t('common.save')}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleCancel}
                  className="rounded p-1 text-muted-foreground hover:bg-muted transition-colors"
                  aria-label={t('common.cancel')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Item content */}
      <div className="p-4">
        {isEditing && editChildren ? editChildren : children}
      </div>
    </div>
  );
}
