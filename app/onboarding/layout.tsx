import { redirect } from 'next/navigation'
import { userClient } from '@/lib/api'
import { Workspace } from '@/components/theme/workspace'

/**
 * Bare auth-gated wrapper for the onboarding flow. Renders inside <Workspace>
 * so it adapts with the theme. If the user already has a default org, bounce
 * them to /drive so they don't see this twice.
 */
export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await userClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Pick up any pending invites first; the user may already belong to an org.
  try { await supabase.rpc('consume_invitations') } catch { /* non-fatal */ }

  const { data: profile } = await supabase
    .from('profiles').select('default_org_id').eq('id', user.id).maybeSingle()
  if (profile?.default_org_id) redirect('/drive')

  return (
    <Workspace className="min-h-screen">
      {children}
    </Workspace>
  )
}
