/**
 * AppHeader — Global top navigation bar
 *
 * Displays Operia logo, optional page title/subtitle, right-side actions,
 * and user menu with sign-out.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, ChevronDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ReactNode } from 'react';

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  const { t, i18n } = useTranslation();
  const [showUserMenu, setShowUserMenu] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/auth';
  }

  function handleLanguageChange(lang: string) {
    void i18n.changeLanguage(lang);
    setShowUserMenu(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-7xl mx-auto flex h-14 items-center gap-4 px-4">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">
            O
          </div>
          <span className="font-semibold hidden sm:block">Operia</span>
        </Link>

        {/* Page title */}
        {title && (
          <>
            <div className="h-5 w-px bg-border hidden sm:block" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{title}</p>
              {subtitle && (
                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              )}
            </div>
          </>
        )}

        <div className="flex-1" />

        {/* Actions slot */}
        {actions && <div className="flex items-center gap-2">{actions}</div>}

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <span className="hidden sm:block">{i18n.language.toUpperCase()}</span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border bg-background shadow-lg py-1">
                <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t('settings.language')}
                </p>
                {(['fr', 'en', 'nl'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => handleLanguageChange(lang)}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors ${
                      i18n.language === lang ? 'font-medium text-primary' : ''
                    }`}
                  >
                    {lang === 'fr' ? 'Français' : lang === 'en' ? 'English' : 'Nederlands'}
                  </button>
                ))}
                <div className="h-px bg-border mx-2 my-1" />
                <button
                  onClick={handleSignOut}
                  className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:bg-red-50 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t('auth.sign_out')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
