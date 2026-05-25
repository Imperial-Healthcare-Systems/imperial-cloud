import { redirect } from 'next/navigation'
import { userClient } from '@/lib/api'

/**
 * Server-only: returns the current user + their active org. Throws redirects
 * for the broken states (no session → /login, no org → /onboarding) so any
 * Server Component can simply `const { user, orgId } = await requireSession()`.
 */
export async function requireSession() {
  const supabase = await userClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_org_id, email, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.default_org_id) redirect('/onboarding')

  return {
    supabase,
    user,
    profile,
    orgId: profile.default_org_id as string,
  }
}
