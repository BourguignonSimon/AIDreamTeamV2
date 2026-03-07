/**
 * Auth Page — Email/Password + Google OAuth sign-in and sign-up
 *
 * Handles both login and registration flows.
 * On success, redirects to dashboard.
 *
 * Spec: Section 3.1, FR-AUTH-01 through FR-AUTH-04, SEC-AUTH-01
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
type FormValues = z.infer<typeof schema>;

export default function AuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [oauthLoading, setOauthLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email,
        password: values.password,
      });
      if (error) {
        setServerError(error.message);
        return;
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
      });
      if (error) {
        setServerError(error.message);
        return;
      }
    }
    navigate('/');
  }

  async function handleGoogleSignIn() {
    setOauthLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) {
      setServerError(error.message);
      setOauthLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white font-bold text-xl mb-3">
            O
          </div>
          <h1 className="text-2xl font-bold">Operia</h1>
          <p className="text-sm text-muted-foreground mt-1">AI Diagnostic Platform</p>
        </div>

        <div className="rounded-xl border bg-background p-6 shadow-sm">
          {/* Mode toggle */}
          <div className="flex rounded-lg bg-muted p-1 mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === 'login' ? 'bg-background shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {t('auth.sign_in')}
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === 'signup' ? 'bg-background shadow-sm' : 'text-muted-foreground'
              }`}
            >
              {t('auth.sign_up')}
            </button>
          </div>

          {/* Google OAuth */}
          <button
            onClick={handleGoogleSignIn}
            disabled={oauthLoading}
            className="w-full flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-60"
          >
            {oauthLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            {t('auth.continue_with_google')}
          </button>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">{t('auth.or')}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Email / Password form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('auth.email')}</label>
              <input
                {...register('email')}
                type="email"
                autoComplete="email"
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">{t('auth.password')}</label>
              <input
                {...register('password')}
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {errors.password && (
                <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <p className="text-sm text-destructive">{serverError}</p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'login' ? t('auth.sign_in') : t('auth.create_account')}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          {t('auth.gdpr_notice')}
        </p>
      </div>
    </div>
  );
}
