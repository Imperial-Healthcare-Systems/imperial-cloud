'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Bell, Check, FileText, Folder, Share2, ShieldAlert, Sparkles, Inbox } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from '@/components/ui/popover'
import { apiGet, apiPatch, ApiError } from '@/lib/fetcher'
import { formatRelative } from '@/lib/format'

interface Notif {
  id: string
  kind: 'system' | 'activity' | 'collaboration' | 'security'
  title: string
  body: string | null
  target_type: string | null
  target_id: string | null
  is_read: boolean
  created_at: string
}

export function NotificationsPopover() {
  const [items, setItems] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await apiGet<{ items: Notif[] }>('/api/notifications')
      setItems(res.items)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not load notifications')
    } finally { setLoading(false) }
  }, [])

  // Initial fetch — for the unread badge — and refetch each time the panel opens.
  useEffect(() => { load() }, [load])
  useEffect(() => { if (open) load() }, [open, load])

  const unread = items.filter(n => !n.is_read).length

  async function markAllRead() {
    if (unread === 0) return
    // Optimistic
    setItems(curr => curr.map(n => ({ ...n, is_read: true })))
    try { await apiPatch('/api/notifications', { all: true }) }
    catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not update')
      load()
    }
  }
  async function markOneRead(id: string) {
    const prev = items
    setItems(curr => curr.map(n => n.id === id ? { ...n, is_read: true } : n))
    try { await apiPatch('/api/notifications', { ids: [id] }) }
    catch { setItems(prev) }
  }

  return (
    <Popover open={open} onOpenChange={setOpen} align="end" width={380}>
      <PopoverTrigger>
        <button
          aria-label="Notifications"
          className="w-9 h-9 grid place-items-center rounded-md border relative transition-colors"
          style={{
            background: 'var(--ic-ws-surface)',
            borderColor: 'var(--ic-ws-border-strong)',
            color: 'var(--ic-ws-text-2)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ic-ws-elevated-hover)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--ic-ws-surface)' }}
        >
          <Bell size={16} strokeWidth={1.9} />
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 28 }}
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full grid place-items-center text-[10px] font-semibold"
              style={{ background: 'var(--ic-ws-flame)', color: '#1a0e00' }}
            >
              {unread > 99 ? '99+' : unread}
            </motion.span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent>
        <header
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'var(--ic-ws-border)' }}
        >
          <div className="text-sm font-semibold">Notifications</div>
          {unread > 0 && (
            <button
              onClick={markAllRead}
              className="text-xs flex items-center gap-1 rounded-md px-2 py-1 transition-colors"
              style={{ color: 'var(--ic-ws-brand-bright)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ic-ws-elevated-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <Check size={12} strokeWidth={2} /> Mark all read
            </button>
          )}
        </header>

        <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
          {loading ? (
            <div className="px-4 py-8 text-sm text-center" style={{ color: 'var(--ic-ws-text-2)' }}>
              Loading…
            </div>
          ) : err ? (
            <div className="px-4 py-8 text-sm text-center" style={{ color: 'var(--ic-ws-error)' }}>
              {err}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Inbox size={28} strokeWidth={1.5} className="mx-auto mb-2" style={{ color: 'var(--ic-ws-text-3)' }} />
              <div className="text-sm font-medium" style={{ color: 'var(--ic-ws-text)' }}>You're all caught up</div>
              <div className="text-xs mt-1" style={{ color: 'var(--ic-ws-text-3)' }}>
                Shares, uploads, and security events will appear here.
              </div>
            </div>
          ) : (
            <ul>
              {items.map((n) => (
                <NotifRow key={n.id} n={n} onRead={() => markOneRead(n.id)} />
              ))}
            </ul>
          )}
        </div>

        <footer
          className="px-4 py-2 border-t text-center"
          style={{ borderColor: 'var(--ic-ws-border)' }}
        >
          <PopoverClose>
            <Link
              href="/recent"
              className="text-xs underline-offset-2 hover:underline"
              style={{ color: 'var(--ic-ws-text-2)' }}
            >
              See all activity
            </Link>
          </PopoverClose>
        </footer>
      </PopoverContent>
    </Popover>
  )
}

function NotifRow({ n, onRead }: { n: Notif; onRead: () => void }) {
  const Icon = iconFor(n)
  const tint = tintFor(n.kind)
  const href = hrefFor(n)
  const body = (
    <div
      onClick={() => { if (!n.is_read) onRead() }}
      className="flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer border-b last:border-b-0"
      style={{ borderColor: 'var(--ic-ws-border)' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ic-ws-elevated-hover)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      <div
        className="w-8 h-8 rounded-md grid place-items-center shrink-0 mt-0.5"
        style={{ background: tint.bg, color: tint.fg }}
      >
        <Icon size={15} strokeWidth={1.9} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-sm font-medium truncate"
            style={{ color: n.is_read ? 'var(--ic-ws-text-2)' : 'var(--ic-ws-text)' }}
          >
            {n.title}
          </span>
          {!n.is_read && (
            <span className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: 'var(--ic-ws-brand-bright)' }} />
          )}
        </div>
        {n.body && (
          <div className="text-xs truncate mt-0.5" style={{ color: 'var(--ic-ws-text-2)' }}>
            {n.body}
          </div>
        )}
        <div className="text-[11px] mt-1" style={{ color: 'var(--ic-ws-text-3)' }}>
          {formatRelative(n.created_at)}
        </div>
      </div>
    </div>
  )
  if (href) {
    return (
      <li>
        <PopoverClose>
          <Link href={href}>{body}</Link>
        </PopoverClose>
      </li>
    )
  }
  return <li>{body}</li>
}

function iconFor(n: Notif) {
  if (n.kind === 'security') return ShieldAlert
  if (n.kind === 'system') return Sparkles
  if (n.target_type === 'folder') return Folder
  if (n.target_type === 'file') return FileText
  return Share2
}
function tintFor(kind: Notif['kind']) {
  switch (kind) {
    case 'security': return { bg: 'color-mix(in oklab, var(--ic-ws-error) 14%, transparent)', fg: 'var(--ic-ws-error)' }
    case 'system': return { bg: 'color-mix(in oklab, var(--ic-ws-flame) 14%, transparent)', fg: 'var(--ic-ws-flame)' }
    default: return { bg: 'var(--ic-ws-brand-muted)', fg: 'var(--ic-ws-brand-bright)' }
  }
}
function hrefFor(n: Notif): string | null {
  if (n.target_type === 'folder' && n.target_id) return `/drive?folder=${n.target_id}`
  if (n.target_type === 'file') return `/drive`
  return null
}
