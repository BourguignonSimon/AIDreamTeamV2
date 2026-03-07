/**
 * useProject — Single Project Data
 *
 * Fetches and manages a single consulting project's metadata,
 * including collaborator list.
 *
 * Spec: Section 8.2 (hooks/useProject.ts)
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { ConsultingProject, ProjectCollaborator } from '@/lib/types';

export interface UseProjectReturn {
  project: ConsultingProject | null;
  collaborators: ProjectCollaborator[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
  userRole: 'owner' | 'editor' | 'viewer' | null;
}

export function useProject(
  projectId: string,
  currentUserId: string
): UseProjectReturn {
  const [project, setProject] = useState<ConsultingProject | null>(null);
  const [collaborators, setCollaborators] = useState<ProjectCollaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!projectId) return;

    let cancelled = false;
    setIsLoading(true);

    async function load() {
      const [projectResult, collabResult] = await Promise.all([
        supabase
          .from('consulting_projects')
          .select('*')
          .eq('id', projectId)
          .single(),
        supabase
          .from('project_collaborators')
          .select('*')
          .eq('project_id', projectId)
          .order('invited_at', { ascending: false }),
      ]);

      if (cancelled) return;

      if (projectResult.error) {
        setError(projectResult.error.message);
        setIsLoading(false);
        return;
      }

      setProject(projectResult.data as ConsultingProject);
      setCollaborators((collabResult.data ?? []) as unknown as ProjectCollaborator[]);
      setError(null);
      setIsLoading(false);
    }

    void load();
    return () => { cancelled = true; };
  }, [projectId, version]);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  const userRole = project
    ? project.owner_id === currentUserId
      ? 'owner'
      : collaborators.find((c) => c.user_id === currentUserId && c.status === 'accepted')?.role ?? null
    : null;

  return { project, collaborators, isLoading, error, refetch, userRole };
}
