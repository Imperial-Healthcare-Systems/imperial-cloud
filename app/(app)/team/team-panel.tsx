'use client'

import { useCallback, useEffect, useState } from 'react'
import { Mail, UserPlus, Copy, Check, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Field, Input } from '@/components/ui/input'
import { Card, EmptyState } from '@/components/ui/card'
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu'
import { apiDelete, apiGet, apiPost, ApiError } from '@/lib/fetcher'
import { formatRelative } from '@/lib/format'

interface Member {
  id: string
  role_key: string
  status: string
  joined_at: string
  user: {
    id: string; email: string; full_name: string | null
    avatar_url: string | null; last_seen_at: string | null
  }
}
interface Invite {
  id: string; email: string; role_key: string
  status: string; expires_at: string | null
}

export function TeamPanel({ orgId, canInvite }: { orgId: string; canInvite: boolean }) {
  const [members, setMembers] = useState<Member[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [openInvite, setOpenInvite] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const res = await apiGet<{ items: Member[]; invites: Invite[] }>(`/api/members?orgId=${orgId}`)
      setMembers(res.items); setInvites(res.invites ?? [])
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to load members')
    } finally { setLoading(false) }
  }, [orgId])
  useEffect(() => { load() }, [load])

  async function revoke(id: string) {
    if (!confirm('Revoke this invitation?')) return
    const prev = invites
    setInvites((curr) => curr.filter((i) => i.id !== id))
    try { await apiDelete(`/api/members/invitations?id=${id}`) }
    catch (e) {
      setInvites(prev)
      setErr(e instanceof ApiError ? e.message : 'Could not revoke')
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm" style={{ color: 'var(--ic-ws-text-2)' }}>
          {loading ? 'Loading…' : `${members.length} ${members.length === 1 ? 'member' : 'members'}`}
        </div>
        {canInvite && (
          <Button onClick={() => setOpenInvite(true)}>
            <UserPlus size={15} strokeWidth={1.9} /> Invite
          </Button>
        )}
      </div>

      {err && <div className="mb-3 text-sm" style={{ color: 'var(--ic-ws-error)' }}>{err}</div>}

      {!loading && members.length === 0 ? (
        <EmptyState title="Just you so far" body="Invite teammates to start collaborating." />
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {members.map((m) => (
              <li key={m.id} className="border-b last:border-0 flex items-center gap-3 px-4 py-3"
                  style={{ borderColor: 'var(--ic-ws-border)' }}>
                <div className="w-8 h-8 rounded-full grid place-items-center text-sm font-medium"
                     style={{ background: 'var(--ic-ws-brand-muted)', color: 'var(--ic-ws-brand-bright)' }}>
                  {(m.user?.full_name ?? m.user?.email ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--ic-ws-text)' }}>
                    {m.user?.full_name ?? m.user?.email}
                  </div>
                  <div className="text-xs truncate" style={{ color: 'var(--ic-ws-text-3)' }}>
                    {m.user?.email} · joined {formatRelative(m.joined_at)}
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'var(--ic-ws-elevated)', color: 'var(--ic-ws-text-2)' }}>
                  {m.role_key}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {invites.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium mb-2" style={{ color: 'var(--ic-ws-text-2)' }}>
            Pending invitations
          </h2>
          <Card className="overflow-hidden">
            <ul>
              {invites.map((inv) => (
                <li key={inv.id} className="border-b last:border-0 flex items-center gap-3 px-4 py-3"
                    style={{ borderColor: 'var(--ic-ws-border)' }}>
                  <Mail size={15} style={{ color: 'var(--ic-ws-text-2)' }} />
                  <span className="flex-1 truncate" style={{ color: 'var(--ic-ws-text)' }}>{inv.email}</span>
                  <span className="text-xs hidden sm:inline" style={{ color: 'var(--ic-ws-text-3)' }}>
                    {inv.role_key}{inv.expires_at ? ` · expires ${formatRelative(inv.expires_at)}` : ''}
                  </span>
                  <Menu ariaLabel={`Actions for invitation to ${inv.email}`}>
                    <MenuItem icon={Trash2} destructive onClick={() => revoke(inv.id)}>
                      Revoke invitation
                    </MenuItem>
                  </Menu>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      <InviteDialog
        open={openInvite}
        onClose={() => { setOpenInvite(false); load() }}
        orgId={orgId}
      />
    </>
  )
}

type Role = 'org_admin' | 'manager' | 'employee' | 'client' | 'guest'
interface InviteResponse {
  id?: string; email?: string; role_key?: string
  inviteToken?: string
  promoted?: boolean
}

function InviteDialog({ open, onClose, orgId }: {
  open: boolean; onClose: () => void; orgId: string
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('employee')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InviteResponse | null>(null)

  // Reset when the dialog closes.
  useEffect(() => {
    if (!open) { setEmail(''); setRole('employee'); setError(null); setResult(null) }
  }, [open])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setBusy(true)
    try {
      const res = await apiPost<InviteResponse>('/api/members', { orgId, email, roleKey: role })
      setResult(res)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invite failed')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Invite a teammate">
      {!result ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Email">
            <Input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com" autoFocus
            />
          </Field>
          <Field label="Role" hint="Sets the teammate's permissions in this workspace.">
            <select
              value={role} onChange={(e) => setRole(e.target.value as Role)}
              className="w-full px-3 py-2 rounded-md text-sm outline-none"
              style={{
                background: 'var(--ic-ws-bg)', color: 'var(--ic-ws-text)',
                border: '1px solid var(--ic-ws-border-strong)',
              }}
            >
              <option value="org_admin">Org admin</option>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
              <option value="client">Client</option>
              <option value="guest">Guest</option>
            </select>
          </Field>
          {error && <p className="text-xs" style={{ color: 'var(--ic-ws-error)' }}>{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={busy}>Send invite</Button>
          </div>
        </form>
      ) : (
        <InviteSuccess result={result} email={email} onClose={onClose} />
      )}
    </Dialog>
  )
}

function InviteSuccess({ result, email, onClose }: {
  result: InviteResponse; email: string; onClose: () => void
}) {
  // Existing user: directly promoted, no token to share.
  if (result.promoted) {
    return (
      <div className="text-center py-2">
        <SuccessTick />
        <h3 className="text-base font-medium mb-1" style={{ color: 'var(--ic-ws-text)' }}>
          Added to the workspace
        </h3>
        <p className="text-sm mb-6" style={{ color: 'var(--ic-ws-text-2)' }}>
          <strong>{email}</strong> already had an account — they're in.
        </p>
        <Button onClick={onClose}>Done</Button>
      </div>
    )
  }

  // New invitee: show a one-time copyable link.
  const inviteUrl =
    typeof window !== 'undefined' && result.inviteToken
      ? `${window.location.origin}/invite/${result.inviteToken}`
      : ''

  return (
    <div>
      <div className="text-center mb-4">
        <SuccessTick />
        <h3 className="text-base font-medium mb-1" style={{ color: 'var(--ic-ws-text)' }}>
          Invitation ready
        </h3>
        <p className="text-sm" style={{ color: 'var(--ic-ws-text-2)' }}>
          Share this link with <strong>{email}</strong>. They'll need to sign in or
          create an account to accept.
        </p>
      </div>
      <CopyableLink url={inviteUrl} />
      <p className="text-[11px] mt-3" style={{ color: 'var(--ic-ws-text-3)' }}>
        For your security, this link is shown <strong>only once</strong>. If you lose
        it, revoke the invite and create a new one.
      </p>
      <div className="flex justify-end mt-5">
        <Button onClick={onClose}>Done</Button>
      </div>
    </div>
  )
}

function CopyableLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
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
      <Button type="button" variant="secondary" onClick={copy} aria-label="Copy invite link">
        {copied ? <><Check size={14} strokeWidth={2} /> Copied</> : <><Copy size={14} strokeWidth={1.9} /> Copy</>}
      </Button>
    </div>
  )
}

function SuccessTick() {
  return (
    <div
      className="w-10 h-10 mx-auto rounded-full grid place-items-center mb-3"
      style={{
        background: 'color-mix(in oklab, var(--ic-ws-success) 14%, transparent)',
        color: 'var(--ic-ws-success)',
      }}
    >
      <Check size={20} strokeWidth={2.4} />
    </div>
  )
}
