import { requireSession } from '@/lib/session'
import { PageHeader, Card, EmptyState } from '@/components/ui/card'
import { formatBytes, formatRelative } from '@/lib/format'
import { FileText } from 'lucide-react'

export const metadata = { title: 'Recent · Imperial Cloud' }

export default async function RecentPage() {
  const { supabase, orgId } = await requireSession()
  // RLS limits this to files the user can see; we order by updated_at desc.
  const { data: rows } = await supabase
    .from('files')
    .select('id,name,size_bytes,mime_type,updated_at,is_trashed')
    .eq('org_id', orgId).eq('is_trashed', false)
    .order('updated_at', { ascending: false })
    .limit(40)

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Recent" subtitle="Files modified or uploaded most recently." />
      {!rows || rows.length === 0 ? (
        <EmptyState title="No recent files" body="Upload or update something to see it here." />
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {rows.map(r => (
              <li key={r.id} className="border-b last:border-0 flex items-center gap-3 px-4 py-3"
                  style={{ borderColor: 'var(--ic-ws-border)' }}>
                <FileText size={16} style={{ color: 'var(--ic-ws-text-2)' }} />
                <span className="flex-1" style={{ color: 'var(--ic-ws-text)' }}>{r.name}</span>
                <span className="text-xs" style={{ color: 'var(--ic-ws-text-3)' }}>
                  {formatBytes(Number(r.size_bytes))} · {formatRelative(r.updated_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
