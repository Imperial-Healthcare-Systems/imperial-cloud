import { requireSession } from '@/lib/session'
import { PageHeader, Card, EmptyState } from '@/components/ui/card'
import { formatRelative } from '@/lib/format'
import { FileText, Folder } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'Shared with me · Imperial Cloud' }

export default async function SharedPage() {
  const { supabase, user } = await requireSession()

  // Direct shares to me, with the embedded target.
  const { data: rows } = await supabase
    .from('shares')
    .select(`
      id, permission, created_at,
      file:files(id,name,size_bytes,updated_at),
      folder:folders(id,name)
    `)
    .eq('shared_with', user.id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Shared with me" subtitle="Items others have shared with you directly." />
      {!rows || rows.length === 0 ? (
        <EmptyState title="Nothing shared yet" body="When someone shares a file or folder with you, it appears here." />
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {rows.map((r: any) => {
              const target = r.file ?? r.folder
              const isFolder = !!r.folder
              const href = isFolder ? `/drive?folder=${target.id}` : `/drive`
              return (
                <li key={r.id} className="border-b last:border-0" style={{ borderColor: 'var(--ic-ws-border)' }}>
                  <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:underline" style={{ color: 'var(--ic-ws-text)' }}>
                    {isFolder
                      ? <Folder size={16} style={{ color: 'var(--ic-ws-brand-bright)' }} />
                      : <FileText size={16} style={{ color: 'var(--ic-ws-text-2)' }} />}
                    <span className="flex-1">{target?.name ?? '(missing)'}</span>
                    <span className="text-xs" style={{ color: 'var(--ic-ws-text-3)' }}>
                      {r.permission} · {formatRelative(r.created_at)}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
