import { requireSession } from '@/lib/session'
import { PageHeader, Card, EmptyState } from '@/components/ui/card'
import { TrashList } from './trash-list'

export const metadata = { title: 'Trash · Imperial Cloud' }

export default async function TrashPage() {
  const { supabase, orgId } = await requireSession()

  const [filesRes, foldersRes] = await Promise.all([
    supabase.from('files')
      .select('id,name,size_bytes,trashed_at')
      .eq('org_id', orgId).eq('is_trashed', true)
      .order('trashed_at', { ascending: false }).limit(100),
    supabase.from('folders')
      .select('id,name,trashed_at')
      .eq('org_id', orgId).eq('is_trashed', true)
      .order('trashed_at', { ascending: false }).limit(100),
  ])

  const items = [
    ...(foldersRes.data ?? []).map(f => ({ kind: 'folder' as const, ...f })),
    ...(filesRes.data ?? []).map(f => ({ kind: 'file' as const, ...f })),
  ]

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Trash" subtitle="Trashed items are kept for recovery until purge." />
      {items.length === 0 ? (
        <EmptyState title="Trash is empty" body="Items you delete will appear here." />
      ) : (
        <Card className="overflow-hidden">
          <TrashList items={items} />
        </Card>
      )}
    </div>
  )
}
