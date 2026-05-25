'use client'

/**
 * Headless popover primitive.
 *
 * Same engine as <Menu>: portal-to-body so nothing clips it, viewport-aware
 * fixed positioning, outside-click + Esc + scroll-close. The difference is
 * full control over the trigger element (so big avatar chips and tiny icon
 * buttons can share the same primitive) and a configurable content width
 * for panel-style menus.
 *
 * Compose:
 *   <Popover align="end" width={360}>
 *     <PopoverTrigger>
 *       <button>…</button>
 *     </PopoverTrigger>
 *     <PopoverContent>…</PopoverContent>
 *   </Popover>
 */

import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

interface Ctx {
  open: boolean
  setOpen: (v: boolean) => void
  triggerRef: React.MutableRefObject<HTMLElement | null>
  contentRef: React.MutableRefObject<HTMLDivElement | null>
  align: 'start' | 'end'
  width?: number
  offset: number
}
const PopoverCtx = React.createContext<Ctx | null>(null)
function usePopover() {
  const c = React.useContext(PopoverCtx)
  if (!c) throw new Error('Popover subcomponents must be used inside <Popover>')
  return c
}

interface PopoverProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  align?: 'start' | 'end'
  width?: number
  offset?: number
  children: React.ReactNode
}

export function Popover({
  open: controlled, defaultOpen, onOpenChange,
  align = 'end', width, offset = 8, children,
}: PopoverProps) {
  const [internal, setInternal] = React.useState(defaultOpen ?? false)
  const open = controlled ?? internal
  const setOpen = React.useCallback((v: boolean) => {
    if (controlled === undefined) setInternal(v)
    onOpenChange?.(v)
  }, [controlled, onOpenChange])
  const triggerRef = React.useRef<HTMLElement | null>(null)
  const contentRef = React.useRef<HTMLDivElement | null>(null)
  const value = React.useMemo<Ctx>(
    () => ({ open, setOpen, triggerRef, contentRef, align, width, offset }),
    [open, setOpen, align, width, offset],
  )
  return <PopoverCtx.Provider value={value}>{children}</PopoverCtx.Provider>
}

/**
 * Wraps a single child element and forwards the necessary handlers + ref.
 * The child must be a single React element that accepts onClick + ref
 * (any button / styled button works fine).
 */
export function PopoverTrigger({ children }: { children: React.ReactElement }) {
  const ctx = usePopover()
  // We don't know the child's exact prop shape; refine by overlaying our handlers.
  const childProps = (children as unknown as { props: { onClick?: (e: React.MouseEvent) => void; ref?: unknown } }).props
  const childRef = childProps.ref

  return React.cloneElement(children, {
    ref: (node: HTMLElement | null) => {
      ctx.triggerRef.current = node
      if (typeof childRef === 'function') (childRef as (n: HTMLElement | null) => void)(node)
      else if (childRef && typeof childRef === 'object' && childRef !== null) {
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node
      }
    },
    'aria-expanded': ctx.open,
    'aria-haspopup': 'menu',
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation()
      childProps.onClick?.(e)
      if (!e.defaultPrevented) ctx.setOpen(!ctx.open)
    },
  } as React.HTMLAttributes<HTMLElement>)
}

export function PopoverContent({
  children, className = '', padding = 0,
}: { children: React.ReactNode; className?: string; padding?: number }) {
  const ctx = usePopover()
  const [mounted, setMounted] = React.useState(false)
  const [pos, setPos] = React.useState<{ top: number; right?: number; left?: number } | null>(null)

  React.useEffect(() => setMounted(true), [])

  React.useEffect(() => {
    if (!ctx.open) return
    const rect = ctx.triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const top = rect.bottom + ctx.offset
    if (ctx.align === 'end') {
      setPos({ top, right: window.innerWidth - rect.right })
    } else {
      setPos({ top, left: rect.left })
    }

    function onDown(e: MouseEvent) {
      if (ctx.triggerRef.current?.contains(e.target as Node)) return
      if (ctx.contentRef.current?.contains(e.target as Node)) return
      ctx.setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        ctx.setOpen(false)
        ctx.triggerRef.current?.focus()
      }
    }
    function onClose() { ctx.setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [ctx])

  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {ctx.open && pos && (
        <motion.div
          ref={ctx.contentRef}
          role="menu"
          initial={{ opacity: 0, scale: 0.96, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: -2 }}
          transition={{ type: 'spring', stiffness: 520, damping: 36, mass: 0.6 }}
          className={className}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            right: pos.right,
            width: ctx.width,
            maxHeight: 'min(560px, calc(100vh - 100px))',
            zIndex: 9999,
            background: 'color-mix(in oklab, var(--ic-ws-surface) 92%, transparent)',
            backdropFilter: 'blur(22px) saturate(180%)',
            WebkitBackdropFilter: 'blur(22px) saturate(180%)',
            border: '1px solid var(--ic-ws-border-strong)',
            borderRadius: 12,
            padding,
            boxShadow: 'var(--ic-ws-shadow-lifted)',
            transformOrigin: ctx.align === 'end' ? 'top right' : 'top left',
            color: 'var(--ic-ws-text)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/**
 * Closes the popover when its child is clicked. Wrap any link/button that
 * should auto-dismiss the popover after activation.
 */
export function PopoverClose({ children }: { children: React.ReactElement }) {
  const ctx = usePopover()
  const childProps = (children as unknown as { props: { onClick?: (e: React.MouseEvent) => void } }).props
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      childProps.onClick?.(e)
      ctx.setOpen(false)
    },
  } as React.HTMLAttributes<HTMLElement>)
}
