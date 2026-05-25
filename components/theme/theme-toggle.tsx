'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/hooks/use-theme'
import { spring } from '@/lib/theme-config'

/**
 * Compact icon toggle for the topbar. Flips light ↔ dark.
 * The sun/moon swap with a spring-driven rotate + scale morph.
 */
export function ThemeToggle({ size = 36 }: { size?: number }) {
  const { isDark, toggle, mounted } = useTheme()

  return (
    <button
      onClick={toggle}
      aria-label={mounted ? (isDark ? 'Switch to light mode' : 'Switch to dark mode') : 'Toggle theme'}
      style={{
        width: size, height: size, borderRadius: 10, position: 'relative',
        background: 'var(--ic-ws-surface)', border: '1px solid var(--ic-ws-border-strong)',
        cursor: 'pointer', display: 'grid', placeItems: 'center', overflow: 'hidden',
      }}
      className="ic-theme-toggle"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={mounted ? (isDark ? 'moon' : 'sun') : 'placeholder'}
          initial={{ rotate: -90, scale: 0, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0, opacity: 0 }}
          transition={spring.default}
          style={{ display: 'grid', placeItems: 'center' }}
        >
          {mounted && isDark
            ? <Moon size={17} color="var(--ic-ws-brand-bright)" strokeWidth={1.9} />
            : <Sun size={17} color="var(--ic-ws-flame)" strokeWidth={1.9} />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}

/**
 * Three-state segmented control for Settings: Light · System · Dark.
 * The active pill slides between options with a shared layout transition.
 */
export function ThemeSegmented() {
  const { theme, setTheme, mounted } = useTheme()
  const options = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'system', icon: Monitor, label: 'System' },
    { value: 'dark', icon: Moon, label: 'Dark' },
  ] as const
  const current = mounted ? (theme ?? 'system') : 'system'

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      style={{
        display: 'inline-flex', padding: 3, gap: 2, borderRadius: 11,
        background: 'var(--ic-ws-bg)', border: '1px solid var(--ic-ws-border)',
      }}
    >
      {options.map(opt => {
        const active = current === opt.value
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(opt.value)}
            style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'transparent', fontSize: 13, fontWeight: active ? 600 : 400,
              color: active ? 'var(--ic-ws-text)' : 'var(--ic-ws-text-2)', zIndex: 1,
            }}
          >
            {active && (
              <motion.span
                layoutId="theme-pill"
                transition={spring.default}
                style={{
                  position: 'absolute', inset: 0, borderRadius: 8, zIndex: -1,
                  background: 'var(--ic-ws-surface)', border: '1px solid var(--ic-ws-border-strong)',
                  boxShadow: 'var(--ic-ws-shadow-resting)',
                }}
              />
            )}
            <opt.icon size={15} strokeWidth={1.9} />
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
