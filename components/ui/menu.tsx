'use client'

/**
 * Portal-rendered dropdown menu.
 *
 * Why custom instead of Radix: keeps the dependency footprint tight while
 * delivering the same interaction quality — portal escapes overflow/clipping,
 * fixed positioning with viewport-aware anchoring, outside-click + Esc close,
 * scroll-to-close to avoid stale anchors, roving focus on the items.
 *
 * Compose like:
 *   <Menu ariaLabel="File actions">
 *     <MenuItem icon={Download} onClick={...}>Download</MenuItem>
 *     <MenuSeparator />
 *     <MenuItem icon={Trash2} destructive onClick={...}>Delete</MenuItem>
 *   </Menu>
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { MoreVertical, type LucideIcon } from 'lucide-react'

interface MenuContextValue { close: () => void }
const MenuContext = React.createContext<MenuContextValue | null>(null)

interface MenuProps {
  /** Custom trigger glyph; defaults to a three-dot icon. */
  trigger?: React.ReactNode
  /** Where the menu's edge aligns to the trigger. */
  align?: 'start' | 'end'
  ariaLabel?: string
  children: React.ReactNode
}

export function Menu({ trigger, align = 'end', ariaLabel = 'Open menu', children }: MenuProps) {
  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState<{ top: number; right?: number; left?: number } | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  // Close on outside-click / Esc / scroll / resize. Scroll-close avoids the
  // menu hovering over a moved anchor — simpler than recomputing on scroll.
  React.useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([data-disabled="true"])')
        if (!items || items.length === 0) return
        const arr = Array.from(items)
        const i = arr.indexOf(document.activeElement as HTMLElement)
        const next = e.key === 'ArrowDown'
          ? (i < 0 ? 0 : (i + 1) % arr.length)
          : (i <= 0 ? arr.length - 1 : i - 1)
        arr[next].focus()
        e.preventDefault()
      }
    }
    function close() { setOpen(false) }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  // When opening: focus first item so arrow keys work immediately.
  React.useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled="true"])')
      first?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  function toggle(e: React.MouseEvent) {
    e.stopPropagation()
    if (open) { setOpen(false); return }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const top = rect.bottom + 6
    setPos(align === 'end'
      ? { top, right: window.innerWidth - rect.right }
      : { top, left: rect.left })
    setOpen(true)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className="w-7 h-7 grid place-items-center rounded-md transition-colors"
        style={{
          color: 'var(--ic-ws-text-2)',
          background: open ? 'var(--ic-ws-elevated-hover)' : 'transparent',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--ic-ws-elevated-hover)' }}
        onMouseLeave={(e) => {
          if (!open) e.currentTarget.style.background = 'transparent'
        }}
      >
        {trigger ?? <MoreVertical size={15} strokeWidth={1.9} />}
      </button>
      {mounted && createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={menuRef}
              role="menu"
              aria-label={ariaLabel}
              initial={{ opacity: 0, scale: 0.94, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -2 }}
              transition={{ type: 'spring', stiffness: 520, damping: 36, mass: 0.6 }}
              style={{
                position: 'fixed',
                top: pos.top,
                left: pos.left,
                right: pos.right,
                minWidth: 188,
                maxWidth: 280,
                zIndex: 9999,
                background: 'color-mix(in oklab, var(--ic-ws-surface) 88%, transparent)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                border: '1px solid var(--ic-ws-border-strong)',
                borderRadius: 10,
                padding: 4,
                boxShadow: 'var(--ic-ws-shadow-lifted)',
                transformOrigin: align === 'end' ? 'top right' : 'top left',
              }}
            >
              <MenuContext.Provider value={{ close: () => setOpen(false) }}>
                {children}
              </MenuContext.Provider>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}

interface MenuItemProps {
  icon?: LucideIcon
  onClick?: () => void
  destructive?: boolean
  disabled?: boolean
  children: React.ReactNode
}

export function MenuItem({ icon: Icon, onClick, destructive, disabled, children }: MenuItemProps) {
  const ctx = React.useContext(MenuContext)
  return (
    <button
      role="menuitem"
      type="button"
      tabIndex={-1}
      data-disabled={disabled ? 'true' : 'false'}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
        ctx?.close()
      }}
      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-left transition-colors disabled:opacity-50 outline-none focus-visible:ring-1"
      style={{
        color: destructive ? 'var(--ic-ws-error)' : 'var(--ic-ws-text)',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        e.currentTarget.style.background = destructive
          ? 'color-mix(in oklab, var(--ic-ws-error) 12%, transparent)'
          : 'var(--ic-ws-elevated-hover)'
      }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      onFocus={(e) => {
        if (disabled) return
        e.currentTarget.style.background = destructive
          ? 'color-mix(in oklab, var(--ic-ws-error) 12%, transparent)'
          : 'var(--ic-ws-elevated-hover)'
      }}
      onBlur={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {Icon && <Icon size={14} strokeWidth={1.9} />}
      <span className="flex-1">{children}</span>
    </button>
  )
}

export function MenuSeparator() {
  return (
    <div
      role="separator"
      className="my-1 mx-1 h-px"
      style={{ background: 'var(--ic-ws-border)' }}
    />
  )
}
