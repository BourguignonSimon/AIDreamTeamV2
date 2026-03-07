/**
 * Navigation — Top Application Navigation Bar
 */

import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { LogOut, LayoutDashboard } from 'lucide-react';

interface NavigationProps {
  session: Session;
}

export default function Navigation({ session }: NavigationProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate('/auth');
  }

  return (
    <nav className="border-b bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white font-bold text-sm">
              O
            </div>
            <span className="text-xl font-semibold text-foreground">{t('app.name')}</span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-6">
            <Link
              to="/dashboard"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <LayoutDashboard className="h-4 w-4" />
              {t('nav.dashboard')}
            </Link>

            <div className="flex items-center gap-3 pl-4 border-l">
              <div className="text-sm text-muted-foreground">
                {session.user.email}
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {t('nav.logout')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
