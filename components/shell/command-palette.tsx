'use client'

/**
 * Global command palette — Apple Spotlight / Linear / Raycast inspired.
 *
 * Trigger surfaces:
 *   • ⌘K / Ctrl+K from anywhere
 *   • The topbar search button dispatches the `ic:open-search` event
 *     (decoupling means the palette doesn't need a parent context)
 *
 * Engineering notes:
 *   • Debounced fetch (250ms) with AbortController so stale responses can't
 *     overwrite newer ones — typing fast in the input never flickers.
 *   • Results are flattened into one array for arrow-key navigation, but
 *     rendered as visually grouped sections (Files / Folders / People).
 *   • Recent searches persist per-org in localStorage. Empty queries show
 *     recents; typing replaces them with live results.
 *   • Portal-rendered into <body>, z-index 10000 (above the topbar 9999
 *     popovers and dialogs).
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Search, FileText, Folder, User, X, ArrowRight, Clock, Inbox,
} from 'lucide-react'

interface FileHit {
  id: string; name: string; mime_type: string | null
  size_bytes: number; folder_id: string | null; rank: number
}
interface FolderHit {
  id: string; name: string; parent_id: string | null; path: string
}
interface PersonHit {
  id: string; email: string; full_name: string | null; avatar_url: string | null
}
interface Results {
  files: FileHit[]
  folders: FolderHit[]
  people: PersonHit[]
}
const EMPTY: Results = { files: [], folders: [], people: [] }

type FlatItem =
  | { kind: 'file'; data: FileHit }
  | { kind: 'folder'; data: FolderHit }
  | { kind: 'person'; data: PersonHit }

const RECENTS_KEY = (orgId: string) => `ic.search.recents.${orgId}`
const RECENTS_MAX = 6

export function CommandPalette({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [mounted, setMounted] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<Results>(EMPTY)
  const [loading, setLoading] = React.useState(false)
  const [highlight, setHighlight] = React.useState(0)
  const [recents, setRecents] = React.useState<string[]>([])
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)
  const itemRefs = React.useRef<Array<HTMLElement | null>>([])

  React.useEffect(() => setMounted(true), [])

  // Load recents for the active org on mount + org change.
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY(orgId))
      setRecents(raw ? JSON.parse(raw) as string[] : [])
    } catch { setRecents([]) }
  }, [orgId])

  // Global keyboard shortcut + open-event listener.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    function onOpen() { setOpen(true) }
    document.addEventListener('keydown', onKey)
    window.addEventListener('ic:open-search', onOpen)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('ic:open-search', onOpen)
    }
  }, [])

  // Reset transient state when the palette closes.
  React.useEffect(() => {
    if (open) {
      // Focus next tick so the modal mount is complete.
      const id = requestAnimationFrame(() => inputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    } else {
      setQuery(''); setResults(EMPTY); setHighlight(0); setLoading(false)
      abortRef.current?.abort()
    }
  }, [open])

  // Debounced search.
  React.useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (!trimmed) {
      setResults(EMPTY); setLoading(false)
      abortRef.current?.abort()
      return
    }
    setLoading(true)
    const handle = window.setTimeout(async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const res = await fetch(
          `/api/search?orgId=${orgId}&q=${encodeURIComponent(trimmed)}`,
          { signal: ctrl.signal, cache: 'no-store' },
        )
        const body = await res.json()
        if (body?.ok) {
          setResults(body.data as Results)
          setHighlight(0)
        }
      } catch (e) {
        if ((e as Error).name !== 'AbortError') console.error(e)
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => window.clearTimeout(handle)
  }, [query, open, orgId])

  // Flattened list for keyboard navigation.
  const flat = React.useMemo<FlatItem[]>(() => [
    ...results.files.map((data) => ({ kind: 'file' as const, data })),
    ...results.folders.map((data) => ({ kind: 'folder' as const, data })),
    ...results.people.map((data) => ({ kind: 'person' as const, data })),
  ], [results])

  // Scroll the highlighted row into view.
  React.useEffect(() => {
    itemRefs.current[highlight]?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  function pushRecent(q: string) {
    const t = q.trim()
    if (!t) return
    const next = [t, ...recents.filter((r) => r !== t)].slice(0, RECENTS_MAX)
    setRecents(next)
    try { localStorage.setItem(RECENTS_KEY(orgId), JSON.stringify(next)) } catch { /* */ }
  }

  function navigate(item: FlatItem) {
    pushRecent(query)
    setOpen(false)
    switch (item.kind) {
      case 'folder':
        router.push(`/drive?folder=${item.data.id}`); break
      case 'file':
        router.push(item.data.folder_id ? `/drive?folder=${item.data.folder_id}` : '/drive'); break
      case 'person':
        router.push('/team'); break
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault(); setHighlight((h) => Math.min(flat.length - 1, h + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); setHighlight((h) => Math.max(0, h - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[highlight]
      if (item) navigate(item)
    } else if (e.key === 'Escape') {
      e.preventDefault(); setOpen(false)
    }
  }

  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="palette-backdrop"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          className="fixed inset-0 flex justify-center"
          style={{
            zIndex: 10000,
            background: 'rgba(3, 8, 18, 0.55)',
            backdropFilter: 'blur(14px) saturate(140%)',
            WebkitBackdropFilter: 'blur(14px) saturate(140%)',
            paddingTop: 'min(96px, 10vh)',
          }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -4 }}
            transition={{ type: 'spring', stiffness: 480, damping: 36, mass: 0.6 }}
            className="w-full max-w-[640px] mx-4 rounded-xl overflow-hidden flex flex-col"
            style={{
              background: 'color-mix(in oklab, var(--ic-ws-surface) 94%, transparent)',
              border: '1px solid var(--ic-ws-border-strong)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.35)',
              maxHeight: '70vh',
              color: 'var(--ic-ws-text)',
            }}
            onKeyDown={onKeyDown}
          >
            {/* Search input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b"
                 style={{ borderColor: 'var(--ic-ws-border)' }}>
              <Search size={18} strokeWidth={1.9} style={{ color: 'var(--ic-ws-text-2)' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setHighlight(0) }}
                placeholder="Search files, folders, people…"
                className="flex-1 bg-transparent outline-none text-[15px]"
                style={{ color: 'var(--ic-ws-text)' }}
              />
              {query ? (
                <button
                  type="button" onClick={() => { setQuery(''); inputRef.current?.focus() }}
                  className="w-6 h-6 grid place-items-center rounded-md"
                  style={{ color: 'var(--ic-ws-text-3)' }}
                  aria-label="Clear"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              ) : (
                <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
                     style={{ borderColor: 'var(--ic-ws-border-strong)', color: 'var(--ic-ws-text-3)' }}>
                  Esc
                </kbd>
              )}
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1">
              {query.trim().length === 0 ? (
                <Recents recents={recents} onPick={(r) => { setQuery(r); inputRef.current?.focus() }} />
              ) : flat.length === 0 ? (
                <Empty loading={loading} query={query} />
              ) : (
                <ResultsView
                  results={results}
                  highlight={highlight}
                  setHighlight={setHighlight}
                  navigate={navigate}
                  registerRef={(idx, el) => { itemRefs.current[idx] = el }}
                />
              )}
            </div>

            {/* Footer hints */}
            <div className="flex items-center justify-between px-5 py-2 border-t text-[11px]"
                 style={{ borderColor: 'var(--ic-ws-border)', color: 'var(--ic-ws-text-3)' }}>
              <span>
                <Kbd>↑</Kbd><Kbd>↓</Kbd> Navigate&nbsp;&nbsp;
                <Kbd>↵</Kbd> Open&nbsp;&nbsp;
                <Kbd>Esc</Kbd> Close
              </span>
              <span>
                {loading ? 'Searching…' : flat.length > 0
                  ? `${flat.length} result${flat.length === 1 ? '' : 's'}`
                  : ''}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function Recents({ recents, onPick }: { recents: string[]; onPick: (q: string) => void }) {
  if (recents.length === 0) {
    return (
      <div className="px-5 py-10 text-center">
        <Search size={26} strokeWidth={1.6} className="mx-auto mb-2" style={{ color: 'var(--ic-ws-text-3)' }} />
        <div className="text-sm" style={{ color: 'var(--ic-ws-text-2)' }}>
          Search across files, folders, and people
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--ic-ws-text-3)' }}>
          Start typing to see results.
        </div>
      </div>
    )
  }
  return (
    <div className="py-2">
      <GroupHeader icon={Clock} label="Recent" />
      {recents.map((r) => (
        <button
          key={r} type="button" onClick={() => onPick(r)}
          className="w-full flex items-center gap-3 px-5 py-2 text-left transition-colors"
          style={{ color: 'var(--ic-ws-text)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ic-ws-elevated-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
        >
          <Clock size={14} strokeWidth={1.9} style={{ color: 'var(--ic-ws-text-3)' }} />
          <span className="text-sm flex-1">{r}</span>
        </button>
      ))}
    </div>
  )
}

function Empty({ loading, query }: { loading: boolean; query: string }) {
  if (loading) {
    return (
      <div className="px-5 py-10 text-center text-sm" style={{ color: 'var(--ic-ws-text-2)' }}>
        Searching…
      </div>
    )
  }
  return (
    <div className="px-5 py-10 text-center">
      <Inbox size={26} strokeWidth={1.6} className="mx-auto mb-2" style={{ color: 'var(--ic-ws-text-3)' }} />
      <div className="text-sm font-medium" style={{ color: 'var(--ic-ws-text)' }}>
        Nothing matches "{query}"
      </div>
      <div className="text-xs mt-1" style={{ color: 'var(--ic-ws-text-3)' }}>
        Try a different name or fewer characters.
      </div>
    </div>
  )
}

function ResultsView({
  results, highlight, setHighlight, navigate, registerRef,
}: {
  results: Results
  highlight: number
  setHighlight: (i: number) => void
  navigate: (item: FlatItem) => void
  registerRef: (idx: number, el: HTMLElement | null) => void
}) {
  let i = -1
  return (
    <div className="py-2">
      {results.files.length > 0 && (
        <>
          <GroupHeader icon={FileText} label="Files" count={results.files.length} />
          {results.files.map((data) => {
            i++
            const idx = i
            return (
              <ResultRow
                key={`f-${data.id}`}
                idx={idx} active={highlight === idx}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => navigate({ kind: 'file', data })}
                registerRef={registerRef}
              >
                <FileText size={15} strokeWidth={1.9} style={{ color: 'var(--ic-ws-text-2)' }} />
                <span className="flex-1 truncate">{data.name}</span>
                <span className="text-xs hidden sm:inline" style={{ color: 'var(--ic-ws-text-3)' }}>
                  {data.mime_type ?? 'file'}
                </span>
              </ResultRow>
            )
          })}
        </>
      )}

      {results.folders.length > 0 && (
        <>
          <GroupHeader icon={Folder} label="Folders" count={results.folders.length} />
          {results.folders.map((data) => {
            i++
            const idx = i
            return (
              <ResultRow
                key={`d-${data.id}`}
                idx={idx} active={highlight === idx}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => navigate({ kind: 'folder', data })}
                registerRef={registerRef}
              >
                <Folder size={15} strokeWidth={1.9} style={{ color: 'var(--ic-ws-brand-bright)' }} />
                <span className="flex-1 truncate">{data.name}</span>
                <span className="text-xs hidden sm:inline" style={{ color: 'var(--ic-ws-text-3)' }}>
                  folder
                </span>
              </ResultRow>
            )
          })}
        </>
      )}

      {results.people.length > 0 && (
        <>
          <GroupHeader icon={User} label="People" count={results.people.length} />
          {results.people.map((data) => {
            i++
            const idx = i
            return (
              <ResultRow
                key={`p-${data.id}`}
                idx={idx} active={highlight === idx}
                onMouseEnter={() => setHighlight(idx)}
                onClick={() => navigate({ kind: 'person', data })}
                registerRef={registerRef}
              >
                <div
                  className="w-5 h-5 rounded-full grid place-items-center text-[10px] font-medium shrink-0"
                  style={{ background: 'var(--ic-ws-brand-muted)', color: 'var(--ic-ws-brand-bright)' }}
                >
                  {(data.full_name ?? data.email).charAt(0).toUpperCase()}
                </div>
                <span className="flex-1 truncate">
                  {data.full_name ?? data.email}
                </span>
                <span className="text-xs hidden sm:inline truncate max-w-[160px]"
                      style={{ color: 'var(--ic-ws-text-3)' }}>
                  {data.email}
                </span>
              </ResultRow>
            )
          })}
        </>
      )}
    </div>
  )
}

function ResultRow({
  idx, active, onMouseEnter, onClick, registerRef, children,
}: {
  idx: number; active: boolean
  onMouseEnter: () => void
  onClick: () => void
  registerRef: (idx: number, el: HTMLElement | null) => void
  children: React.ReactNode
}) {
  return (
    <button
      ref={(el) => registerRef(idx, el)}
      type="button"
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-2 text-left text-sm transition-colors"
      style={{
        background: active ? 'var(--ic-ws-elevated-hover)' : 'transparent',
        color: 'var(--ic-ws-text)',
      }}
    >
      {children}
      <ArrowRight
        size={14} strokeWidth={2}
        style={{ color: 'var(--ic-ws-text-3)', opacity: active ? 1 : 0 }}
      />
    </button>
  )
}

function GroupHeader({ icon: Icon, label, count }: { icon: typeof Folder; label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 px-5 pt-3 pb-1 text-[10px] uppercase tracking-wide font-medium"
         style={{ color: 'var(--ic-ws-text-3)' }}>
      <Icon size={11} strokeWidth={2.2} />
      <span>{label}</span>
      {count !== undefined && <span>· {count}</span>}
    </div>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-block px-1 mx-0.5 rounded font-mono"
      style={{
        background: 'var(--ic-ws-elevated)',
        border: '1px solid var(--ic-ws-border)',
        color: 'var(--ic-ws-text-2)',
      }}
    >
      {children}
    </kbd>
  )
}
