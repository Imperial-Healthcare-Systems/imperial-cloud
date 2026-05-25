'use client'

import { Search } from 'lucide-react'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { NotificationsPopover } from './notifications-popover'
import { UserMenu } from './user-menu'
import { CommandPalette } from './command-palette'

/**
 * Topbar inside the workspace. Adapts with the theme. Hosts the ⌘K search
 * trigger, notifications popover, theme toggle, and user menu.
 *
 * The search button dispatches `ic:open-search`; the CommandPalette (also
 * mounted here) listens for that event AND for the ⌘K/Ctrl+K keyboard
 * shortcut globally. Decoupled state — palette owns its own visibility.
 */
interface Props {
  userEmail?: string | null
  userFullName?: string | null
  userRole?: string | null
  orgName?: string | null
  orgId?: string | null
  storageUsed?: number
  storageTotal?: number
}

export function Topbar({
  userEmail, userFullName, userRole, orgName, orgId, storageUsed, storageTotal,
}: Props) {
  function openSearch() {
    window.dispatchEvent(new CustomEvent('ic:open-search'))
  }

  return (
    <header
      className="h-14 flex items-center gap-4 px-6 border-b sticky top-0 z-10 backdrop-blur"
      style={{
        background: 'color-mix(in oklab, var(--ic-ws-bg) 85%, transparent)',
        borderColor: 'var(--ic-ws-border)',
      }}
    >
      <button
        type="button"
        onClick={openSearch}
        aria-label="Open search"
        className="flex items-center gap-2 h-9 px-3 rounded-md border w-full max-w-[420px] text-sm transition-colors"
        style={{
          background: 'var(--ic-ws-surface)',
          borderColor: 'var(--ic-ws-border)',
          color: 'var(--ic-ws-text-2)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--ic-ws-border-strong)' }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--ic-ws-border)' }}
      >
        <Search size={15} strokeWidth={1.9} />
        <span className="flex-1 text-left">Search files, folders, people…</span>
        <kbd
          className="text-[10px] font-mono px-1.5 py-0.5 rounded border"
          style={{ borderColor: 'var(--ic-ws-border-strong)', color: 'var(--ic-ws-text-3)' }}
        >
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <NotificationsPopover />
        <ThemeToggle />
        <UserMenu
          email={userEmail}
          fullName={userFullName}
          roleLabel={userRole}
          orgName={orgName}
          storageUsed={storageUsed}
          storageTotal={storageTotal}
        />
      </div>

      {orgId && <CommandPalette orgId={orgId} />}
    </header>
  )
}
