/**
 * Supabase Client Singleton
 *
 * Single shared Supabase client instance for the frontend.
 * Uses VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from environment.
 *
 * Specification: Section 8.2 (lib/supabase.ts)
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Session expires after 24 hours of inactivity (FR-AUTH-04)
    // Refresh tokens are rotated on each use (FR-AUTH-04)
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export default supabase;
