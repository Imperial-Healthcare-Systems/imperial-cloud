import { requireSession } from '@/lib/session'
import { PageHeader, Card, EmptyState } from '@/components/ui/card'
import { formatBytes, formatRelative } from '@/lib/format'
import { Star } from 'lucide-react'

export const metadata = { title: 'Starred · Imperial Cloud' }

export default async function StarredPage() {
  const { supabase, orgId } = await requireSession()
  const { data: rows } = await supabase
    .from('files')
    .select('id,name,size_bytes,updated_at,is_starred,is_trashed')
    .eq('org_id', orgId).eq('is_trashed', false).eq('is_starred', true)
    .order('updated_at', { ascending: false })

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Starred" subtitle="Files you've starred for quick access." />
      {!rows || rows.length === 0 ? (
        <EmptyState
          title="Nothing starred"
          body="Star a file from its menu to surface it here. (Starring UI ships next.)"
        />
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {rows.map(r => (
              <li key={r.id} className="border-b last:border-0 flex items-center gap-3 px-4 py-3"
                  style={{ borderColor: 'var(--ic-ws-border)' }}>
                <Star size={16} style={{ color: 'var(--ic-ws-flame)' }} fill="var(--ic-ws-flame)" />
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
