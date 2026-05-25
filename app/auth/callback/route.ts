import { NextResponse, type NextRequest } from 'next/server'
import { userClient } from '@/lib/api'

/**
 * OAuth / magic-link / email-confirmation callback.
 *
 * Supabase appends ?code=... after the redirect; we exchange it for a session
 * (cookies are bridged through @supabase/ssr) and bounce the user onward.
 *
 * Fallback workspace creation: the handle_new_user trigger normally auto-creates
 * a workspace when `workspace_name` was set during signup. If that didn't happen
 * (e.g., trigger error, race, name collision), we try once more here so the
 * user lands on /drive instead of /onboarding.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/drive'

  const supabase = await userClient()
  if (code) {
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Workspace fallback. Best-effort only — failures route the user through
  // /onboarding via the (app) layout, where they can complete it manually.
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const wantedName = (user.user_metadata?.workspace_name as string | undefined)?.trim()
      if (wantedName) {
        const { data: profile } = await supabase
          .from('profiles').select('default_org_id').eq('id', user.id).maybeSingle()
        if (!profile?.default_org_id) {
          const slug = slugify(wantedName) || 'workspace'
          await supabase.rpc('create_organization', { p_name: wantedName, p_slug: slug })
        }
      }
    }
  } catch { /* non-fatal */ }

  return NextResponse.redirect(new URL(next, url.origin))
}

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}
