'use client'

/**
 * Move-file destination picker.
 *
 * Architecture:
 *  • One round-trip fetches all folders in the org (RLS-scoped) — the tree
 *    is built client-side from a flat list, which scales fine to thousands
 *    of folders.
 *  • The current folder (where the file already lives) is shown disabled —
 *    selecting it would be a no-op.
 *  • "Recent destinations" live in localStorage keyed per user/org so they
 *    survive reloads but don't bleed across accounts.
 *  • Search filters folders by name AND keeps ancestors visible so matching
 *    nodes don't appear orphaned.
 */

import * as React from 'react'
import { ChevronRight, Folder, HardDrive, Search, Clock } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { apiGet, apiPost, ApiError } from '@/lib/fetcher'

interface FolderRow {
  id: string; name: string; parent_id: string | null
  depth: number; path: string
}

interface MoveDialogProps {
  open: boolean
  onClose: () => void
  orgId: string
  file: { id: string; name: string; folder_id: string | null } | null
  onMoved: (newFolderId: string | null) => void
}

const RECENT_KEY = (orgId: string) => `ic.recent-dest.${orgId}`
const RECENT_MAX = 5

export function MoveDialog({ open, onClose, orgId, file, onMoved }: MoveDialogProps) {
  const [folders, setFolders] = React.useState<FolderRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<string | null>(null) // null = root
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const [search, setSearch] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)
  const [recents, setRecents] = React.useState<string[]>([])

  // Load tree + recents on open.
  React.useEffect(() => {
    if (!open || !file) return
    setSelected(file.folder_id)
    setError(null)
    setSearch('')
    try {
      const raw = localStorage.getItem(RECENT_KEY(orgId))
      setRecents(raw ? JSON.parse(raw) as string[] : [])
    } catch { setRecents([]) }

    let alive = true
    setLoading(true)
    apiGet<{ items: FolderRow[] }>(`/api/folders?orgId=${orgId}&all=1`)
      .then((res) => { if (alive) setFolders(res.items) })
      .catch((e) => { if (alive) setError(e instanceof ApiError ? e.message : 'Failed to load folders') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, file, orgId])

  // Auto-expand ancestors of the file's current folder so users see context.
  React.useEffect(() => {
    if (!file?.folder_id || folders.length === 0) return
    const f = folders.find(x => x.id === file.folder_id)
    if (!f) return
    const ids = f.path.split('.').filter(Boolean)
    setExpanded(new Set(ids))
  }, [file?.folder_id, folders])

  const byParent = React.useMemo(() => {
    const map = new Map<string | null, FolderRow[]>()
    for (const f of folders) {
      const k = f.parent_id
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(f)
    }
    return map
  }, [folders])

  // Build the set of folder ids that match the search (and their ancestors,
  // so ancestor nodes don't get hidden by the filter).
  const filterMatches = React.useMemo(() => {
    if (!search.trim()) return null
    const needle = search.trim().toLowerCase()
    const hits = folders.filter(f => f.name.toLowerCase().includes(needle))
    const visible = new Set<string>()
    for (const h of hits) {
      visible.add(h.id)
      // ancestor ids encoded in materialized path "a.b.c"
      for (const id of h.path.split('.').filter(Boolean)) visible.add(id)
    }
    return visible
  }, [search, folders])

  function toggle(id: string) {
    setExpanded(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function commitRecent(folderId: string | null) {
    try {
      const id = folderId ?? '__root__'
      const next = [id, ...recents.filter(x => x !== id)].slice(0, RECENT_MAX)
      localStorage.setItem(RECENT_KEY(orgId), JSON.stringify(next))
    } catch { /* localStorage may be disabled */ }
  }

  async function onMove() {
    if (!file) return
    setSubmitting(true); setError(null)
    try {
      await apiPost('/api/files/move', { fileId: file.id, folderId: selected })
      commitRecent(selected)
      onMoved(selected)
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Move failed')
    } finally {
      setSubmitting(false)
    }
  }

  const folderById = React.useMemo(() => {
    const m = new Map<string, FolderRow>()
    folders.forEach(f => m.set(f.id, f))
    return m
  }, [folders])

  type RecentEntry = { id: string | null; name: string }
  const recentEntries: RecentEntry[] = recents
    .map<RecentEntry | null>(id => {
      if (id === '__root__') return { id: null, name: 'My Drive' }
      const f = folderById.get(id)
      return f ? { id: f.id, name: f.name } : null
    })
    .filter((x): x is RecentEntry => x !== null)
    .filter(r => (r.id ?? null) !== (file?.folder_id ?? null))
    .slice(0, RECENT_MAX)

  return (
    <Dialog open={open} onClose={onClose} title="Move to…" width={520}>
      {file && (
        <div className="text-xs mb-3" style={{ color: 'var(--ic-ws-text-2)' }}>
          Moving <span style={{ color: 'var(--ic-ws-text)' }}>{file.name}</span>
        </div>
      )}

      <div className="relative mb-3">
        <Search
          size={14} strokeWidth={1.9}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: 'var(--ic-ws-text-3)' }}
        />
        <input
          autoFocus value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search folders…"
          className="w-full pl-9 pr-3 py-2 rounded-md text-sm outline-none"
          style={{
            background: 'var(--ic-ws-bg)', color: 'var(--ic-ws-text)',
            border: '1px solid var(--ic-ws-border-strong)',
          }}
        />
      </div>

      {recentEntries.length > 0 && !search && (
        <div className="mb-3">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide mb-1.5"
               style={{ color: 'var(--ic-ws-text-3)' }}>
            <Clock size={11} strokeWidth={2} /> Recent
          </div>
          <div className="flex flex-wrap gap-1.5">
            {recentEntries.map(r => {
              const disabled = (r.id ?? null) === (file?.folder_id ?? null)
              const active = selected === (r.id ?? null)
              return (
                <button
                  key={r.id ?? '__root__'}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelected(r.id ?? null)}
                  className="px-2.5 py-1 rounded-full text-xs transition-colors disabled:opacity-40"
                  style={{
                    background: active ? 'var(--ic-ws-brand-muted)' : 'var(--ic-ws-elevated)',
                    color: active ? 'var(--ic-ws-brand-bright)' : 'var(--ic-ws-text-2)',
                    border: '1px solid ' + (active ? 'var(--ic-ws-brand-ring)' : 'var(--ic-ws-border)'),
                  }}
                >
                  {r.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-3 text-xs" style={{ color: 'var(--ic-ws-error)' }}>{error}</div>
      )}

      <div
        className="rounded-md max-h-[300px] overflow-y-auto"
        style={{ border: '1px solid var(--ic-ws-border)' }}
      >
        {loading ? (
          <div className="p-4 text-sm" style={{ color: 'var(--ic-ws-text-2)' }}>Loading folders…</div>
        ) : (
          <>
            <TreeRow
              icon={HardDrive}
              name="My Drive"
              depth={0}
              hasChildren={(byParent.get(null) ?? []).length > 0}
              expanded={true}
              disabled={file?.folder_id === null}
              selected={selected === null}
              onSelect={() => setSelected(null)}
              onToggle={() => {/* root always expanded */}}
            />
            {renderChildren(null)}
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          type="button" onClick={onMove}
          disabled={submitting || (selected ?? null) === (file?.folder_id ?? null)}
          loading={submitting}
        >
          Move here
        </Button>
      </div>
    </Dialog>
  )

  function renderChildren(parentId: string | null): React.ReactNode {
    const kids = byParent.get(parentId) ?? []
    const filtered = filterMatches
      ? kids.filter(k => filterMatches.has(k.id))
      : kids
    return filtered.map(k => {
      const grand = byParent.get(k.id) ?? []
      const isOpen = filterMatches ? true : expanded.has(k.id)
      const isCurrent = file?.folder_id === k.id
      return (
        <React.Fragment key={k.id}>
          <TreeRow
            icon={Folder}
            name={k.name}
            depth={k.depth + 1}
            hasChildren={grand.length > 0}
            expanded={isOpen}
            disabled={isCurrent}
            selected={selected === k.id}
            onSelect={() => setSelected(k.id)}
            onToggle={() => toggle(k.id)}
          />
          {isOpen && renderChildren(k.id)}
        </React.Fragment>
      )
    })
  }
}

interface TreeRowProps {
  icon: typeof Folder
  name: string
  depth: number
  hasChildren: boolean
  expanded: boolean
  disabled: boolean
  selected: boolean
  onSelect: () => void
  onToggle: () => void
}
function TreeRow({ icon: Icon, name, depth, hasChildren, expanded, disabled, selected, onSelect, onToggle }: TreeRowProps) {
  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 cursor-pointer transition-colors"
      style={{
        paddingLeft: 8 + depth * 16,
        background: selected ? 'var(--ic-ws-brand-muted)' : 'transparent',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: selected ? 'var(--ic-ws-brand-bright)' : 'var(--ic-ws-text)',
      }}
      onClick={() => { if (!disabled) onSelect() }}
      onMouseEnter={(e) => {
        if (selected || disabled) return
        e.currentTarget.style.background = 'var(--ic-ws-elevated-hover)'
      }}
      onMouseLeave={(e) => {
        if (selected) return
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <button
        type="button"
        aria-label={expanded ? 'Collapse' : 'Expand'}
        onClick={(e) => { e.stopPropagation(); if (hasChildren) onToggle() }}
        className="w-4 h-4 grid place-items-center rounded transition-transform"
        style={{
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          visibility: hasChildren ? 'visible' : 'hidden',
          color: 'var(--ic-ws-text-3)',
        }}
      >
        <ChevronRight size={12} strokeWidth={2} />
      </button>
      <Icon size={14} strokeWidth={1.9} style={{ color: selected ? 'var(--ic-ws-brand-bright)' : 'var(--ic-ws-brand-bright)' }} />
      <span className="text-sm truncate flex-1">{name}</span>
      {disabled && (
        <span className="text-[10px] uppercase" style={{ color: 'var(--ic-ws-text-3)' }}>here</span>
      )}
    </div>
  )
}
