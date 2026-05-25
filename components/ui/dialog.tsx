'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  width?: number
}

/**
 * Minimal modal. Click-outside + Esc close. Uses workspace tokens so it
 * adapts with the theme.
 */
export function Dialog({ open, onClose, title, children, width = 440 }: Props) {
  React.useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="rounded-lg w-full"
            style={{
              maxWidth: width,
              background: 'var(--ic-ws-surface)',
              color: 'var(--ic-ws-text)',
              border: '1px solid var(--ic-ws-border-strong)',
              boxShadow: 'var(--ic-ws-shadow-lifted)',
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: 'var(--ic-ws-border)' }}
            >
              <h2 className="text-base font-display font-semibold">{title}</h2>
              <button
                aria-label="Close" onClick={onClose}
                className="w-7 h-7 grid place-items-center rounded-md"
                style={{ color: 'var(--ic-ws-text-2)' }}
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
