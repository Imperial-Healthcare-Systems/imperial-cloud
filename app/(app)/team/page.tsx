import { requireSession } from '@/lib/session'
import { PageHeader, Card, EmptyState } from '@/components/ui/card'
import { TeamPanel } from './team-panel'

export const metadata = { title: 'Team · Imperial Cloud' }

export default async function TeamPage() {
  const { supabase, orgId } = await requireSession()
  const { data: canInvite } = await supabase.rpc('has_permission', {
    p_org: orgId, p_perm: 'user.invite',
  })

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader title="Team" subtitle="People who belong to this workspace." />
      <TeamPanel orgId={orgId} canInvite={canInvite === true} />
    </div>
  )
}
