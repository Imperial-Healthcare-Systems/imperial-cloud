'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client. Use from Client Components for auth flows
 * (signInWithPassword, signInWithOtp, signInWithOAuth) and any RLS-bound
 * reads/writes initiated client-side. Reuses the session cookie that the
 * middleware refreshes.
 */
export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
