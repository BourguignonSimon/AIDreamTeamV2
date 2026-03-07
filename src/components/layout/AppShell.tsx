/**
 * AppShell — Main Application Layout
 *
 * Provides the top navigation and content area.
 * Wraps all authenticated pages.
 */

import type { Session } from '@supabase/supabase-js';
import { useTranslation } from 'react-i18next';
import Navigation from './Navigation';

interface AppShellProps {
  session: Session;
  children: React.ReactNode;
}

export default function AppShell({ session, children }: AppShellProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background">
      <Navigation session={session} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
