import { redirect } from 'next/navigation'
import { userClient } from '@/lib/api'
import { AppShell } from '@/components/shell/app-shell'

/**
 * Layout for all authenticated /(app) routes. Loads the user's profile + active
 * org + their role in it, and passes it all to <AppShell> so the sidebar's
 * storage meter and the topbar's user menu can render real data.
 *
 * Pending invites are consumed on every visit (idempotent) so newly-invited
 * users get added to orgs without requiring a special callback.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await userClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  try { await supabase.rpc('consume_invitations') } catch { /* non-fatal */ }

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_org_id, email, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.default_org_id) redirect('/onboarding')

  // Pull org + the caller's membership in parallel.
  const [orgRes, memberRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('name, storage_used_bytes, storage_quota_bytes')
      .eq('id', profile.default_org_id)
      .maybeSingle(),
    supabase
      .from('organization_members')
      .select('role_key')
      .eq('org_id', profile.default_org_id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const storageUsed = Number(orgRes.data?.storage_used_bytes ?? 0)
  const storageTotal = Number(orgRes.data?.storage_quota_bytes ?? 107_374_182_400)

  return (
    <AppShell
      userEmail={profile?.email ?? user.email}
      userFullName={profile?.full_name ?? null}
      userRole={memberRes.data?.role_key ?? null}
      orgName={orgRes.data?.name ?? null}
      orgId={profile.default_org_id}
      storageUsed={storageUsed}
      storageTotal={storageTotal}
    >
      {children}
    </AppShell>
  )
}
