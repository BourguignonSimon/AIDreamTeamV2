/**
 * ProjectCreateModal — New Project Creation Dialog
 *
 * Collects project name, client name, industry sector, and target language.
 * Validates with Zod + react-hook-form. Creates project via Supabase.
 *
 * Spec: Section 3.1, FR-DASH-02, SG-06 (language selection)
 */

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { X, Loader2 } from 'lucide-react';
import type { SupportedLanguage } from '@/lib/types';
import { supabase } from '@/lib/supabase';

const schema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters').max(120),
  client_name: z.string().max(120).optional(),
  industry_sector: z.string().max(80).optional(),
  language: z.enum(['fr', 'en', 'nl'] as const),
});

type FormValues = z.infer<typeof schema>;

interface ProjectCreateModalProps {
  onClose: () => void;
  onCreated: (projectId: string) => void;
}

export default function ProjectCreateModal({ onClose, onCreated }: ProjectCreateModalProps) {
  const { t } = useTranslation();
  const overlayRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { language: 'fr' },
  });

  // Close on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function onSubmit(values: FormValues) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('root', { message: 'Not authenticated' });
      return;
    }

    const { data, error } = await supabase
      .from('consulting_projects')
      .insert({
        name: values.name,
        client_name: values.client_name || null,
        industry_sector: values.industry_sector || null,
        language: values.language as SupportedLanguage,
        owner_id: user.id,
      })
      .select('id')
      .single();

    if (error || !data) {
      setError('root', { message: error?.message ?? 'Failed to create project' });
      return;
    }

    // Add owner as collaborator with editor role
    await supabase.from('project_collaborators').insert({
      project_id: data.id,
      user_id: user.id,
      role: 'editor',
    });

    onCreated(data.id);
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl bg-background shadow-xl border">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-lg">{t('dashboard.create_project')}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t('project.name')} <span className="text-destructive">*</span>
            </label>
            <input
              {...register('name')}
              type="text"
              placeholder="e.g. Logistics Automation Diagnostic"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('project.client_name')}</label>
            <input
              {...register('client_name')}
              type="text"
              placeholder="e.g. Acme Corporation"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">{t('project.industry')}</label>
            <input
              {...register('industry_sector')}
              type="text"
              placeholder="e.g. Manufacturing, Logistics, Finance"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              {t('project.report_language')} <span className="text-destructive">*</span>
            </label>
            <select
              {...register('language')}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="nl">Nederlands</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('project.language_hint')}
            </p>
          </div>

          {errors.root && (
            <p className="text-sm text-destructive">{errors.root.message}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('dashboard.create_project')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
