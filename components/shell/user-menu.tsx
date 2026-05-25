'use client'

import Link from 'next/link'
import { Settings, Users, LifeBuoy, LogOut } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger, PopoverClose } from '@/components/ui/popover'
import { ThemeSegmented } from '@/components/theme/theme-toggle'
import { formatBytes } from '@/lib/format'

interface Props {
  email?: string | null
  fullName?: string | null
  roleLabel?: string | null
  orgName?: string | null
  storageUsed?: number
  storageTotal?: number
}

/**
 * macOS-style account menu anchored to the avatar chip in the topbar.
 * Includes profile header, workspace quota, theme switch, deep-links, sign out.
 */
export function UserMenu({
  email, fullName, roleLabel, orgName, storageUsed = 0, storageTotal = 0,
}: Props) {
  const initial = (fullName ?? email ?? '?').charAt(0).toUpperCase()
  const pct = storageTotal > 0 ? Math.min(100, Math.round((storageUsed / storageTotal) * 100)) : 0

  return (
    <Popover align="end" width={272}>
      <PopoverTrigger>
        <button
          aria-label="Account menu"
          className="w-9 h-9 rounded-full grid place-items-center text-sm font-medium transition-transform"
          style={{
            background: 'var(--ic-ws-brand-muted)',
            color: 'var(--ic-ws-brand-bright)',
            border: '1px solid var(--ic-ws-border-strong)',
          }}
        >
          {initial}
        </button>
      </PopoverTrigger>

      <PopoverContent>
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b"
             style={{ borderColor: 'var(--ic-ws-border)' }}>
          <div
            className="w-10 h-10 rounded-full grid place-items-center text-base font-semibold shrink-0"
            style={{ background: 'var(--ic-ws-brand-muted)', color: 'var(--ic-ws-brand-bright)' }}
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--ic-ws-text)' }}>
              {fullName ?? email ?? 'Signed in'}
            </div>
            {email && (
              <div className="text-xs truncate" style={{ color: 'var(--ic-ws-text-3)' }}>{email}</div>
            )}
          </div>
          {roleLabel && (
            <span
              className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{
                background: 'var(--ic-ws-elevated)',
                color: 'var(--ic-ws-text-2)',
                border: '1px solid var(--ic-ws-border)',
              }}
            >
              {roleLabel}
            </span>
          )}
        </div>

        {/* Workspace + storage */}
        {orgName && (
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--ic-ws-border)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-medium" style={{ color: 'var(--ic-ws-text-2)' }}>
                {orgName}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--ic-ws-text-3)' }}>{pct}%</div>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: 'var(--ic-ws-border-strong)' }}
            >
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${pct}%`,
                  background: pct > 90 ? 'var(--ic-ws-flame)' : 'var(--ic-ws-brand-bright)',
                }}
              />
            </div>
            <div className="text-[11px] mt-1.5" style={{ color: 'var(--ic-ws-text-3)' }}>
              {formatBytes(storageUsed)} of {formatBytes(storageTotal)}
            </div>
          </div>
        )}

        {/* Theme */}
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--ic-ws-border)' }}>
          <div className="text-[11px] uppercase tracking-wide mb-2 font-medium"
               style={{ color: 'var(--ic-ws-text-3)' }}>
            Theme
          </div>
          <ThemeSegmented />
        </div>

        {/* Items */}
        <div className="py-1">
          <Item href="/settings" icon={Settings}>Settings</Item>
          <Item href="/team" icon={Users}>Team</Item>
          <Item href="/recent" icon={LifeBuoy}>Activity</Item>
        </div>

        <div className="border-t" style={{ borderColor: 'var(--ic-ws-border)' }}>
          <SignOutForm />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Item({ href, icon: Icon, children }: { href: string; icon: typeof Settings; children: React.ReactNode }) {
  return (
    <PopoverClose>
      <Link
        href={href}
        className="flex items-center gap-2.5 px-3 py-2 mx-1 rounded-md text-sm transition-colors"
        style={{ color: 'var(--ic-ws-text)' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ic-ws-elevated-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <Icon size={15} strokeWidth={1.9} style={{ color: 'var(--ic-ws-text-2)' }} />
        {children}
      </Link>
    </PopoverClose>
  )
}

function SignOutForm() {
  return (
    <form action="/api/auth/signout" method="post" className="py-1">
      <button
        type="submit"
        className="w-full flex items-center gap-2.5 px-3 py-2 mx-1 rounded-md text-sm transition-colors text-left"
        style={{ color: 'var(--ic-ws-error)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'color-mix(in oklab, var(--ic-ws-error) 10%, transparent)'
        }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <LogOut size={15} strokeWidth={1.9} />
        Sign out
      </button>
    </form>
  )
}
