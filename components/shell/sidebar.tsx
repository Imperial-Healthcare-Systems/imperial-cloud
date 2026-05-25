'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  HardDrive, Share2, Clock, Users, BarChart3, Star, Trash2, Settings,
} from 'lucide-react'
import { Logo } from '@/components/theme/logo'

/**
 * Persistent dark sidebar. ALWAYS uses --ic-shell-* tokens — never themed.
 * Lives outside <Workspace> so the theme toggle physically cannot recolor it.
 */

const NAV: Array<{ href: string; label: string; icon: typeof HardDrive }> = [
  { href: '/drive', label: 'My Drive', icon: HardDrive },
  { href: '/shared', label: 'Shared', icon: Share2 },
  { href: '/recent', label: 'Recent', icon: Clock },
  { href: '/starred', label: 'Starred', icon: Star },
  { href: '/team', label: 'Team', icon: Users },
  { href: '/insights', label: 'Insights', icon: BarChart3 },
  { href: '/trash', label: 'Trash', icon: Trash2 },
]

export function Sidebar({ storageUsed = 0, storageTotal = 107374182400 }: {
  storageUsed?: number
  storageTotal?: number
}) {
  const pathname = usePathname()
  const pct = Math.min(100, Math.round((storageUsed / storageTotal) * 100))

  return (
    <aside
      className="hidden md:flex flex-col w-[260px] shrink-0 h-screen sticky top-0 px-4 py-6 gap-6 border-r"
      style={{
        background: 'var(--ic-shell-surface)',
        borderColor: 'var(--ic-shell-border)',
        color: 'var(--ic-shell-text)',
      }}
    >
      <Link href="/drive" className="px-2 inline-flex items-center">
        <Logo height={28} priority />
      </Link>

      <nav className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className="relative flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors"
              style={{
                color: active ? 'var(--ic-shell-text)' : 'var(--ic-shell-text-2)',
              }}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="absolute inset-0 rounded-md -z-0"
                  style={{
                    background: 'var(--ic-shell-brand-muted)',
                    border: '1px solid var(--ic-shell-border-strong)',
                  }}
                />
              )}
              <Icon size={16} strokeWidth={1.9} className="relative z-10" />
              <span className="relative z-10">{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <StorageMeter pct={pct} used={storageUsed} total={storageTotal} />
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm"
          style={{ color: 'var(--ic-shell-text-2)' }}
        >
          <Settings size={16} strokeWidth={1.9} />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  )
}

function StorageMeter({ pct, used, total }: { pct: number; used: number; total: number }) {
  return (
    <div
      className="px-3 py-3 rounded-md border"
      style={{
        background: 'var(--ic-shell-elevated)',
        borderColor: 'var(--ic-shell-border)',
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: 'var(--ic-shell-text-2)' }}>
          Storage
        </span>
        <span className="text-xs" style={{ color: 'var(--ic-shell-text-3)' }}>
          {pct}%
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: 'var(--ic-shell-border-strong)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: pct > 90
              ? 'var(--ic-shell-flame)'    // flame = warning at high fill
              : 'var(--ic-shell-brand-bright)',
          }}
        />
      </div>
      <div className="mt-2 text-[11px]" style={{ color: 'var(--ic-shell-text-3)' }}>
        {formatBytes(used)} of {formatBytes(total)}
      </div>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  for (const u of units) {
    if (v < 1024) return `${v.toFixed(v < 10 ? 1 : 0)} ${u}`
    v /= 1024
  }
  return `${v.toFixed(0)} PB`
}
