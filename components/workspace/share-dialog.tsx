'use client'

/**
 * Share dialog — operates on either a file or a folder.
 *
 * Layout (top → bottom):
 *   1. Member picker     — autocompletes against workspace members, single
 *      selection per share action with a permission selector.
 *   2. People with access — lists current shares with inline permission
 *      changes + remove. Owner is rendered at the top, not deletable.
 *   3. General access     — single toggle for "Anyone with the link can view".
 *      When ON, generates a one-shot copyable URL. When OFF, revokes.
 *
 * Permission inheritance: folder shares cascade to descendants via
 * can_access_file() in SQL. This dialog only shows the *direct* grants on
 * the current resource; inherited grants live on the ancestor folder.
 */

import * as React from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Check, X, Copy, Link as LinkIcon, Trash2, Globe } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, ApiError } from '@/lib/fetcher'
import { formatRelative } from '@/lib/format'

type Perm = 'view' | 'comment' | 'edit'

interface ShareDialogProps {
  open: boolean
  onClose: () => void
  orgId: string
  resource: {
    type: 'file' | 'folder'
    id: string
    name: string
    ownerId: string
  } | null
  currentUserId: string
}

interface Member {
  id: string
  role_key: string
  user: { id: string; email: string; full_name: string | null; avatar_url: string | null }
}
interface ShareRow {
  id: string
  permission: Perm
  shared_with: string
  shared_by: string
  created_at: string
  user: { id: string; email: string; full_name: string | null; avatar_url: string | null } | null
}
interface LinkInfo {
  active: boolean
  info: {
    id: string; permission: Perm; status: string
    expires_at: string | null; max_downloads: number | null
    download_count: number; created_at: string
  } | null
}

export function ShareDialog({ open, onClose, orgId, resource, currentUserId }: ShareDialogProps) {
  const [members, setMembers] = React.useState<Member[]>([])
  const [shares, setShares] = React.useState<ShareRow[]>([])
  const [link, setLink] = React.useState<LinkInfo>({ active: false, info: null })
  const [freshLinkUrl, setFreshLinkUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [err, setErr] = React.useState<string | null>(null)

  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [pickerQuery, setPickerQuery] = React.useState('')
  const [pickerSelected, setPickerSelected] = React.useState<Member | null>(null)
  const [newPerm, setNewPerm] = React.useState<Perm>('view')
  const [inviting, setInviting] = React.useState(false)

  const resKey = resource ? `${resource.type}:${resource.id}` : null
  const param = resource?.type === 'folder' ? 'folderId' : 'fileId'

  // Load shares + members + link when the dialog opens.
  React.useEffect(() => {
    if (!open || !resource) return
    let alive = true
    setLoading(true); setErr(null); setFreshLinkUrl(null); setPickerSelected(null); setPickerQuery('')
    Promise.all([
      apiGet<{ items: Member[] }>(`/api/members?orgId=${orgId}`),
      apiGet<{ items: ShareRow[] }>(`/api/sharing/permissions?${param}=${resource.id}`),
      apiGet<LinkInfo>(`/api/sharing/link?${param}=${resource.id}`),
    ])
      .then(([m, s, l]) => {
        if (!alive) return
        setMembers(m.items); setShares(s.items); setLink(l)
      })
      .catch((e) => { if (alive) setErr(e instanceof ApiError ? e.message : 'Failed to load') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, resKey, orgId, param, resource])

  // Member search — exclude owner, current user, and people already on the share list.
  const alreadyOnList = React.useMemo(() => {
    const ids = new Set<string>()
    ids.add(resource?.ownerId ?? '')
    ids.add(currentUserId)
    for (const s of shares) ids.add(s.shared_with)
    return ids
  }, [shares, resource?.ownerId, currentUserId])

  const filteredMembers = React.useMemo(() => {
    const q = pickerQuery.trim().toLowerCase()
    return members
      .filter((m) => !alreadyOnList.has(m.user.id))
      .filter((m) => {
        if (!q) return true
        return (
          m.user.email.toLowerCase().includes(q) ||
          (m.user.full_name ?? '').toLowerCase().includes(q)
        )
      })
      .slice(0, 8)
  }, [members, alreadyOnList, pickerQuery])

  // --- Mutations -----------------------------------------------------------
  async function invite() {
    if (!resource || !pickerSelected) return
    setInviting(true); setErr(null)
    try {
      const created = await apiPost<ShareRow>('/api/sharing', {
        orgId,
        ...(resource.type === 'file' ? { fileId: resource.id } : { folderId: resource.id }),
        sharedWith: pickerSelected.user.id,
        permission: newPerm,
      })
      // Inject embedded user (the POST endpoint doesn't return it; do it locally).
      setShares((curr) => [
        ...curr,
        { ...created, user: pickerSelected.user },
      ])
      setPickerSelected(null); setPickerQuery('')
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not share')
    } finally {
      setInviting(false)
    }
  }

  async function updatePerm(shareId: string, permission: Perm) {
    const prev = shares
    setShares((curr) => curr.map((s) => s.id === shareId ? { ...s, permission } : s))
    try {
      await apiPatch('/api/sharing/permissions', { shareId, permission })
    } catch (e) {
      setShares(prev)
      setErr(e instanceof ApiError ? e.message : 'Could not update permission')
    }
  }

  async function removeShare(shareId: string) {
    const prev = shares
    setShares((curr) => curr.filter((s) => s.id !== shareId))
    try {
      await apiDelete(`/api/sharing/permissions?id=${shareId}`)
    } catch (e) {
      setShares(prev)
      setErr(e instanceof ApiError ? e.message : 'Could not remove access')
    }
  }

  async function enableLink() {
    if (!resource) return
    setErr(null)
    try {
      const res = await apiPut<{ url: string; id: string; permission: Perm; expires_at: string | null; max_downloads: number | null }>(
        '/api/sharing',
        {
          orgId,
          ...(resource.type === 'file' ? { fileId: resource.id } : { folderId: resource.id }),
          permission: 'view',
        },
      )
      const absolute = typeof window !== 'undefined' ? `${window.location.origin}${res.url}` : res.url
      setFreshLinkUrl(absolute)
      setLink({
        active: true,
        info: {
          id: res.id, permission: res.permission, status: 'active',
          expires_at: res.expires_at ?? null, max_downloads: res.max_downloads ?? null,
          download_count: 0, created_at: new Date().toISOString(),
        },
      })
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not create link')
    }
  }

  async function disableLink() {
    if (!link.info) return
    const prev = link
    setLink({ active: false, info: null })
    setFreshLinkUrl(null)
    try {
      await apiDelete(`/api/sharing/link?id=${link.info.id}`)
    } catch (e) {
      setLink(prev)
      setErr(e instanceof ApiError ? e.message : 'Could not disable link')
    }
  }

  return (
    <Dialog open={open && !!resource} onClose={onClose} title={resource ? `Share "${resource.name}"` : 'Share'} width={560}>
      {!resource ? null : (
        <div className="flex flex-col gap-5">
          {err && (
            <div className="px-3 py-2 rounded-md text-xs flex items-center justify-between"
                 style={{ background: 'color-mix(in oklab, var(--ic-ws-error) 12%, transparent)', color: 'var(--ic-ws-error)' }}>
              <span>{err}</span>
              <button onClick={() => setErr(null)} className="underline">dismiss</button>
            </div>
          )}

          {/* ── Member picker ─────────────────────────────────────────────── */}
          <section>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} strokeWidth={1.9}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--ic-ws-text-3)' }} />
                <input
                  value={pickerSelected ? `${pickerSelected.user.full_name ?? pickerSelected.user.email}` : pickerQuery}
                  onChange={(e) => { setPickerQuery(e.target.value); setPickerSelected(null); setPickerOpen(true) }}
                  onFocus={() => setPickerOpen(true)}
                  onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                  placeholder="Add a teammate by name or email"
                  className="w-full pl-9 pr-3 py-2 rounded-md text-sm outline-none"
                  style={{
                    background: 'var(--ic-ws-bg)', color: 'var(--ic-ws-text)',
                    border: '1px solid var(--ic-ws-border-strong)',
                  }}
                />
                <AnimatePresence>
                  {pickerOpen && !pickerSelected && filteredMembers.length > 0 && (
                    <motion.ul
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="absolute left-0 right-0 mt-1 rounded-md overflow-hidden z-10"
                      style={{
                        background: 'var(--ic-ws-surface)',
                        border: '1px solid var(--ic-ws-border-strong)',
                        boxShadow: 'var(--ic-ws-shadow-lifted)',
                      }}
                    >
                      {filteredMembers.map((m) => (
                        <li
                          key={m.id}
                          onMouseDown={(e) => { e.preventDefault(); setPickerSelected(m); setPickerOpen(false) }}
                          className="flex items-center gap-2.5 px-3 py-2 cursor-pointer"
                          style={{ color: 'var(--ic-ws-text)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ic-ws-elevated-hover)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <Avatar user={m.user} size={28} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">{m.user.full_name ?? m.user.email}</div>
                            {m.user.full_name && (
                              <div className="text-xs truncate" style={{ color: 'var(--ic-ws-text-3)' }}>{m.user.email}</div>
                            )}
                          </div>
                          <span className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--ic-ws-text-3)' }}>
                            {m.role_key}
                          </span>
                        </li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>
              </div>
              <PermSelect value={newPerm} onChange={setNewPerm} />
              <Button onClick={invite} disabled={!pickerSelected} loading={inviting}>Share</Button>
            </div>
          </section>

          {/* ── People with access ────────────────────────────────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wide font-medium mb-2"
                style={{ color: 'var(--ic-ws-text-3)' }}>
              People with access
            </h3>
            <ul className="rounded-md overflow-hidden" style={{ border: '1px solid var(--ic-ws-border)' }}>
              {/* Owner row (always present) */}
              <OwnerRow ownerId={resource.ownerId} members={members} currentUserId={currentUserId} />

              {loading ? (
                <li className="px-4 py-3 text-sm" style={{ color: 'var(--ic-ws-text-2)' }}>Loading…</li>
              ) : shares.length === 0 ? (
                <li className="px-4 py-3 text-sm" style={{ color: 'var(--ic-ws-text-3)' }}>
                  Only the owner has direct access.
                </li>
              ) : (
                shares.map((s) => (
                  <li key={s.id}
                      className="flex items-center gap-3 px-4 py-2.5 border-t"
                      style={{ borderColor: 'var(--ic-ws-border)' }}>
                    <Avatar user={s.user ?? { email: '?', full_name: null, avatar_url: null }} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--ic-ws-text)' }}>
                        {s.user?.full_name ?? s.user?.email ?? 'Unknown'}
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--ic-ws-text-3)' }}>
                        {s.user?.email} · added {formatRelative(s.created_at)}
                      </div>
                    </div>
                    <PermSelect
                      value={s.permission}
                      onChange={(p) => updatePerm(s.id, p)}
                    />
                    <button
                      aria-label="Remove access"
                      onClick={() => removeShare(s.id)}
                      className="w-7 h-7 grid place-items-center rounded-md transition-colors"
                      style={{ color: 'var(--ic-ws-text-2)' }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'color-mix(in oklab, var(--ic-ws-error) 14%, transparent)'
                        e.currentTarget.style.color = 'var(--ic-ws-error)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = 'var(--ic-ws-text-2)'
                      }}
                    >
                      <X size={14} strokeWidth={2} />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          {/* ── General (link) access ─────────────────────────────────────── */}
          <section>
            <h3 className="text-xs uppercase tracking-wide font-medium mb-2"
                style={{ color: 'var(--ic-ws-text-3)' }}>
              General access
            </h3>
            <div
              className="flex items-center gap-3 px-4 py-3 rounded-md"
              style={{ border: '1px solid var(--ic-ws-border)' }}
            >
              <div
                className="w-9 h-9 rounded-full grid place-items-center"
                style={{
                  background: link.active ? 'var(--ic-ws-brand-muted)' : 'var(--ic-ws-elevated)',
                  color: link.active ? 'var(--ic-ws-brand-bright)' : 'var(--ic-ws-text-2)',
                }}
              >
                {link.active ? <Globe size={16} strokeWidth={1.9} /> : <LinkIcon size={16} strokeWidth={1.9} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--ic-ws-text)' }}>
                  {link.active ? 'Anyone with the link' : 'Restricted'}
                </div>
                <div className="text-xs" style={{ color: 'var(--ic-ws-text-3)' }}>
                  {link.active ? 'Can view this item — no sign-in required' : 'Only people added above can access'}
                </div>
              </div>
              {link.active ? (
                <Button variant="secondary" size="sm" onClick={disableLink}>
                  <Trash2 size={13} strokeWidth={1.9} /> Disable
                </Button>
              ) : (
                <Button size="sm" onClick={enableLink}>
                  <LinkIcon size={13} strokeWidth={1.9} /> Create link
                </Button>
              )}
            </div>

            <AnimatePresence>
              {freshLinkUrl && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="mt-2"
                >
                  <CopyableLink url={freshLinkUrl} />
                  <p className="text-[11px] mt-1.5" style={{ color: 'var(--ic-ws-text-3)' }}>
                    Save this URL now — it's shown only once.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function OwnerRow({ ownerId, members, currentUserId }: {
  ownerId: string; members: Member[]; currentUserId: string
}) {
  const owner = members.find((m) => m.user.id === ownerId)
  const label = ownerId === currentUserId
    ? `You${owner?.user.email ? ` · ${owner.user.email}` : ''}`
    : (owner?.user.full_name ?? owner?.user.email ?? 'Owner')
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Avatar
        user={owner?.user ?? { email: '?', full_name: null, avatar_url: null }}
        size={32}
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate" style={{ color: 'var(--ic-ws-text)' }}>{label}</div>
        <div className="text-xs truncate" style={{ color: 'var(--ic-ws-text-3)' }}>
          {owner?.user.email && ownerId !== currentUserId ? owner.user.email + ' · ' : ''}Owner
        </div>
      </div>
      <span
        className="text-xs px-2 py-1 rounded-md"
        style={{ background: 'var(--ic-ws-elevated)', color: 'var(--ic-ws-text-2)' }}
      >
        Owner
      </span>
    </li>
  )
}

function PermSelect({ value, onChange }: { value: Perm; onChange: (p: Perm) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Perm)}
      className="px-2.5 py-1.5 rounded-md text-sm outline-none cursor-pointer"
      style={{
        background: 'var(--ic-ws-surface)',
        color: 'var(--ic-ws-text)',
        border: '1px solid var(--ic-ws-border-strong)',
      }}
    >
      <option value="view">Viewer</option>
      <option value="comment">Commenter</option>
      <option value="edit">Editor</option>
    </select>
  )
}

function Avatar({
  user, size = 32,
}: {
  user: { email: string; full_name: string | null; avatar_url: string | null }
  size?: number
}) {
  const initial = (user.full_name ?? user.email ?? '?').charAt(0).toUpperCase()
  return (
    <div
      className="rounded-full grid place-items-center shrink-0 font-medium"
      style={{
        width: size, height: size,
        background: 'var(--ic-ws-brand-muted)',
        color: 'var(--ic-ws-brand-bright)',
        fontSize: size <= 28 ? 11 : 13,
        border: '1px solid var(--ic-ws-border-strong)',
      }}
    >
      {initial}
    </div>
  )
}

function CopyableLink({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard may be denied */ }
  }
  return (
    <div className="flex items-stretch gap-2">
      <input
        readOnly value={url}
        onFocus={(e) => e.currentTarget.select()}
        className="flex-1 px-3 py-2 rounded-md text-xs font-mono outline-none"
        style={{
          background: 'var(--ic-ws-bg)', color: 'var(--ic-ws-text)',
          border: '1px solid var(--ic-ws-border-strong)',
        }}
      />
      <Button type="button" variant="secondary" onClick={copy} aria-label="Copy link" size="sm">
        {copied ? <><Check size={13} strokeWidth={2} /> Copied</> : <><Copy size={13} strokeWidth={1.9} /> Copy</>}
      </Button>
    </div>
  )
}
