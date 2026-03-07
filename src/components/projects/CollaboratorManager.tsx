/**
 * CollaboratorManager — Project Team Management Panel
 *
 * Invites collaborators by email, displays current team with roles,
 * and allows role changes or removal (owner only).
 *
 * Spec: Section 3.1, FR-COLLAB-01 through FR-COLLAB-05
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2, Loader2, Mail, Shield, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ConsultingProject } from '@/lib/types';

interface Collaborator {
  id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  email?: string;
  full_name?: string;
}

interface Props {
  project: ConsultingProject;
  currentUserId: string;
}

export default function CollaboratorManager({ project, currentUserId }: Props) {
  const { t } = useTranslation();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('viewer');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const isOwner = project.owner_id === currentUserId;

  useEffect(() => {
    async function loadCollaborators() {
      const { data, error } = await supabase
        .from('project_collaborators')
        .select('id, user_id, role, profiles:user_id(email, full_name)')
        .eq('project_id', project.id);

      if (!error && data) {
        setCollaborators(
          data.map((row: any) => ({
            id: row.id,
            user_id: row.user_id,
            role: row.role,
            email: row.profiles?.email,
            full_name: row.profiles?.full_name,
          }))
        );
      }
      setIsLoading(false);
    }

    void loadCollaborators();
  }, [project.id]);

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setIsInviting(true);
    setInviteError(null);
    setInviteSuccess(false);

    const { error } = await supabase.functions.invoke('invite-collaborator', {
      body: {
        project_id: project.id,
        email: inviteEmail.trim(),
        role: inviteRole,
      },
    });

    if (error) {
      setInviteError(error.message ?? 'Failed to send invitation');
    } else {
      setInviteSuccess(true);
      setInviteEmail('');
    }
    setIsInviting(false);
  }

  async function handleRoleChange(collaboratorId: string, newRole: 'editor' | 'viewer') {
    await supabase
      .from('project_collaborators')
      .update({ role: newRole })
      .eq('id', collaboratorId);

    setCollaborators((prev) =>
      prev.map((c) => (c.id === collaboratorId ? { ...c, role: newRole } : c))
    );
  }

  async function handleRemove(collaboratorId: string) {
    if (!window.confirm(t('common.confirm_delete'))) return;

    await supabase.from('project_collaborators').delete().eq('id', collaboratorId);
    setCollaborators((prev) => prev.filter((c) => c.id !== collaboratorId));
  }

  return (
    <div className="space-y-5">
      <h3 className="font-medium">{t('collaborators.title')}</h3>

      {/* Invite form (owner/editor only) */}
      {isOwner && (
        <div className="rounded-lg border p-4 space-y-3">
          <h4 className="text-sm font-medium">{t('collaborators.invite')}</h4>
          <div className="flex gap-2">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleInvite(); }}
              placeholder="colleague@company.com"
              className="flex-1 rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'editor' | 'viewer')}
              className="rounded-lg border px-2 py-2 text-sm"
            >
              <option value="editor">{t('collaborators.role_editor')}</option>
              <option value="viewer">{t('collaborators.role_viewer')}</option>
            </select>
            <button
              onClick={handleInvite}
              disabled={isInviting || !inviteEmail.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isInviting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              {t('collaborators.send_invite')}
            </button>
          </div>
          {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
          {inviteSuccess && (
            <p className="text-xs text-green-600">{t('collaborators.invite_sent')}</p>
          )}
        </div>
      )}

      {/* Collaborator list */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t('common.loading')}</span>
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {collaborators.map((collab) => (
            <div key={collab.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                <span className="text-xs font-bold text-primary">
                  {(collab.full_name ?? collab.email ?? '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {collab.full_name ?? collab.email ?? collab.user_id}
                </p>
                {collab.full_name && collab.email && (
                  <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {collab.email}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {collab.role === 'owner' ? (
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    <Shield className="h-3 w-3" />
                    {t('collaborators.role_owner')}
                  </span>
                ) : isOwner && collab.user_id !== currentUserId ? (
                  <select
                    value={collab.role}
                    onChange={(e) => void handleRoleChange(collab.id, e.target.value as 'editor' | 'viewer')}
                    className="rounded border px-2 py-1 text-xs"
                  >
                    <option value="editor">{t('collaborators.role_editor')}</option>
                    <option value="viewer">{t('collaborators.role_viewer')}</option>
                  </select>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {collab.role === 'viewer' ? <Eye className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                    {collab.role}
                  </span>
                )}
                {isOwner && collab.role !== 'owner' && collab.user_id !== currentUserId && (
                  <button
                    onClick={() => void handleRemove(collab.id)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-red-50 transition-colors"
                    title={t('common.delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
