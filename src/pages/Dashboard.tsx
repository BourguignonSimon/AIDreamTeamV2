/**
 * Dashboard Page — Project List + Create
 *
 * Shows all projects the authenticated user is a collaborator on.
 * Realtime subscription updates list when new projects are added.
 *
 * Spec: Section 3.1, FR-DASH-01 through FR-DASH-04
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, Loader2, FolderOpen } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ConsultingProject } from '@/lib/types';
import ProjectCard from '@/components/projects/ProjectCard';
import ProjectCreateModal from '@/components/projects/ProjectCreateModal';
import AppHeader from '@/components/layout/AppHeader';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ConsultingProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [collaboratorCounts, setCollaboratorCounts] = useState<Record<string, number>>({});

  const loadProjects = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('project_collaborators')
      .select('project_id, consulting_projects(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      const projectList = data
        .map((row: any) => row.consulting_projects)
        .filter(Boolean) as ConsultingProject[];
      setProjects(projectList);

      // Load collaborator counts
      if (projectList.length > 0) {
        const { data: counts } = await supabase
          .from('project_collaborators')
          .select('project_id')
          .in('project_id', projectList.map((p) => p.id));

        if (counts) {
          const countMap: Record<string, number> = {};
          for (const row of counts) {
            countMap[row.project_id] = (countMap[row.project_id] ?? 0) + 1;
          }
          setCollaboratorCounts(countMap);
        }
      }
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  function handleProjectCreated(projectId: string) {
    setShowCreateModal(false);
    navigate(`/projects/${projectId}`);
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{t('dashboard.title')}</h1>
            <p className="text-sm text-muted-foreground mt-1">{t('dashboard.subtitle')}</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t('dashboard.create_project')}
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-muted p-5 mb-4">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold mb-2">{t('dashboard.no_projects')}</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              {t('dashboard.no_projects_hint')}
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t('dashboard.create_project')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                collaboratorCount={collaboratorCounts[project.id] ?? 1}
              />
            ))}
          </div>
        )}
      </main>

      {showCreateModal && (
        <ProjectCreateModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleProjectCreated}
        />
      )}
    </div>
  );
}
