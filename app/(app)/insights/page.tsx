import { requireSession } from '@/lib/session'
import { PageHeader, Card } from '@/components/ui/card'
import { formatBytes } from '@/lib/format'

export const metadata = { title: 'Insights · Imperial Cloud' }

export default async function InsightsPage() {
  const { supabase, orgId } = await requireSession()

  const [orgRes, filesRes, membersRes, recentUploadsRes] = await Promise.all([
    supabase.from('organizations').select('storage_used_bytes,storage_quota_bytes,name').eq('id', orgId).maybeSingle(),
    supabase.from('files').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_trashed', false),
    supabase.from('organization_members').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
    supabase.from('file_versions').select('id', { count: 'exact', head: true }).eq('org_id', orgId)
      .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString()),
  ])

  const used = Number(orgRes.data?.storage_used_bytes ?? 0)
  const total = Number(orgRes.data?.storage_quota_bytes ?? 0) || 1
  const pct = Math.round((used / total) * 100)

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Insights" subtitle={`How ${orgRes.data?.name ?? 'this workspace'} is being used.`} />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Stat label="Storage used" value={formatBytes(used)} sub={`${pct}% of ${formatBytes(total)}`} />
        <Stat label="Files" value={String(filesRes.count ?? 0)} sub="live, not trashed" />
        <Stat label="Active members" value={String(membersRes.count ?? 0)} />
      </div>
      <Card className="p-6">
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-sm font-medium" style={{ color: 'var(--ic-ws-text)' }}>Uploads, last 7 days</div>
          <div className="text-2xl font-display font-semibold" style={{ color: 'var(--ic-ws-text)' }}>
            {recentUploadsRes.count ?? 0}
          </div>
        </div>
        <div className="text-xs" style={{ color: 'var(--ic-ws-text-3)' }}>
          Pre-aggregated rollups (storage_analytics / upload_analytics) ship later. This is a live count.
        </div>
      </Card>
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-5">
      <div className="text-xs uppercase tracking-wide" style={{ color: 'var(--ic-ws-text-3)' }}>{label}</div>
      <div className="text-2xl font-display font-semibold mt-1" style={{ color: 'var(--ic-ws-text)' }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--ic-ws-text-2)' }}>{sub}</div>}
    </Card>
  )
}
