'use client'

import { useTheme } from '@/hooks/use-theme'

/**
 * Wraps the adaptive content region. Mirrors the resolved theme onto a local
 * `data-theme` so workspace tokens resolve correctly even though the shell
 * around it is permanently dark. Everything inside uses `ws-*` utilities.
 */
export function Workspace({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { resolvedTheme, mounted } = useTheme()
  // Before mount, default to dark so SSR markup is stable (shell is dark anyway).
  const theme = mounted ? resolvedTheme : 'dark'
  return (
    <div className={`workspace ${className}`} data-theme={theme} style={{ background: 'var(--ic-ws-bg)', color: 'var(--ic-ws-text)' }}>
      {children}
    </div>
  )
}
