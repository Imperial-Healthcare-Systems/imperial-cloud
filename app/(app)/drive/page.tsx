import { requireSession } from '@/lib/session'
import { Breadcrumb, type Crumb } from '@/components/workspace/breadcrumb'
import { FileExplorer } from '@/components/workspace/file-explorer'
import { PageHeader } from '@/components/ui/card'

export const metadata = { title: 'My Drive · Imperial Cloud' }

/**
 * Drive root. Folder navigation is a query param (?folder=<id>) so deep
 * links work. We resolve the ancestor chain server-side for the breadcrumb
 * — the materialized `folders.path` already encodes it, but a tiny query
 * keeps render ordering deterministic.
 */
export default async function DrivePage({
  searchParams,
}: { searchParams: Promise<{ folder?: string }> }) {
  const { orgId, supabase, user } = await requireSession()
  const params = await searchParams
  const folderId = params.folder ?? null

  const crumbs: Crumb[] = []
  if (folderId) {
    const { data: cur } = await supabase
      .from('folders')
      .select('id,name,path')
      .eq('id', folderId)
      .maybeSingle()
    if (cur) {
      // path is "rootId.next.next…" — split, fetch each ancestor's name.
      const ids = cur.path.split('.').filter(Boolean)
      const { data: ancestors } = await supabase
        .from('folders')
        .select('id,name,depth')
        .in('id', ids)
      const sorted = (ancestors ?? []).slice().sort((a, b) => a.depth - b.depth)
      for (const a of sorted) crumbs.push({ id: a.id, name: a.name })
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader title="My Drive" subtitle="Everything you own and have been shared." />
      <div className="mb-4"><Breadcrumb crumbs={crumbs} /></div>
      <FileExplorer orgId={orgId} folderId={folderId} currentUserId={user.id} />
    </div>
  )
}
