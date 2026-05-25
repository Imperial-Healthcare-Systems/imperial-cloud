import { requireSession } from '@/lib/session'
import { PageHeader, Card } from '@/components/ui/card'
import { ThemeSegmented } from '@/components/theme/theme-toggle'

export const metadata = { title: 'Settings · Imperial Cloud' }

export default async function SettingsPage() {
  const { profile, user, orgId, supabase } = await requireSession()
  const { data: org } = await supabase
    .from('organizations').select('name,slug,storage_used_bytes,storage_quota_bytes').eq('id', orgId).maybeSingle()

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader title="Settings" subtitle="Profile, workspace, and appearance." />

      <div className="flex flex-col gap-6">
        <Card className="p-6">
          <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--ic-ws-text)' }}>Profile</h2>
          <Row label="Email">{profile.email ?? user.email}</Row>
          <Row label="Name">{profile.full_name ?? '—'}</Row>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--ic-ws-text)' }}>Workspace</h2>
          <Row label="Name">{org?.name}</Row>
          <Row label="Slug">{org?.slug}</Row>
          <Row label="Storage">
            {((Number(org?.storage_used_bytes ?? 0)) / 1_073_741_824).toFixed(2)} GB
            {' / '}
            {((Number(org?.storage_quota_bytes ?? 0)) / 1_073_741_824).toFixed(0)} GB
          </Row>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-medium mb-3" style={{ color: 'var(--ic-ws-text)' }}>Appearance</h2>
          <div className="text-xs mb-3" style={{ color: 'var(--ic-ws-text-2)' }}>
            The workspace adapts; the navigation shell stays dark by design.
          </div>
          <ThemeSegmented />
        </Card>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span style={{ color: 'var(--ic-ws-text-2)' }}>{label}</span>
      <span style={{ color: 'var(--ic-ws-text)' }}>{children}</span>
    </div>
  )
}
