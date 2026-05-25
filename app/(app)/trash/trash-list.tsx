'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FileText, Folder, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPatch, ApiError } from '@/lib/fetcher'
import { formatRelative, formatBytes } from '@/lib/format'

type Item =
  | { kind: 'file'; id: string; name: string; size_bytes: number; trashed_at: string | null }
  | { kind: 'folder'; id: string; name: string; trashed_at: string | null }

export function TrashList({ items }: { items: Item[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function restore(it: Item) {
    setBusy(it.id); setErr(null)
    try {
      await apiPatch('/api/files/trash', it.kind === 'file' ? { fileId: it.id } : { folderId: it.id })
      router.refresh()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Restore failed')
    } finally { setBusy(null) }
  }

  return (
    <>
      {err && (
        <div className="px-4 py-2 text-sm" style={{ color: 'var(--ic-ws-error)' }}>{err}</div>
      )}
      <ul>
        {items.map(it => (
          <li key={`${it.kind}-${it.id}`}
              className="border-b last:border-0 flex items-center gap-3 px-4 py-3"
              style={{ borderColor: 'var(--ic-ws-border)' }}>
            {it.kind === 'folder'
              ? <Folder size={16} style={{ color: 'var(--ic-ws-brand-bright)' }} />
              : <FileText size={16} style={{ color: 'var(--ic-ws-text-2)' }} />}
            <span className="flex-1" style={{ color: 'var(--ic-ws-text)' }}>{it.name}</span>
            <span className="text-xs" style={{ color: 'var(--ic-ws-text-3)' }}>
              {it.kind === 'file' ? formatBytes(Number(it.size_bytes)) + ' · ' : ''}
              {it.trashed_at ? `trashed ${formatRelative(it.trashed_at)}` : ''}
            </span>
            <Button size="sm" variant="secondary" loading={busy === it.id} onClick={() => restore(it)}>
              <RotateCcw size={13} strokeWidth={1.9} /> Restore
            </Button>
          </li>
        ))}
      </ul>
    </>
  )
}
