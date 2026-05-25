'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { useEffect } from 'react'
import { THEME_TRANSITION_MS } from '@/lib/theme-config'

/**
 * next-themes writes the theme to `data-theme` on <html> (attribute="data-theme").
 * Our CSS scopes workspace tokens to `[data-theme] .workspace`, so only the
 * workspace subtree reacts. The shell reads `--ic-shell-*` which is theme-
 * independent, so it stays dark no matter what.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--ic-theme-dur', `${THEME_TRANSITION_MS}ms`)
    root.classList.add('ic-no-transition')
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove('ic-no-transition'))
    )
    return () => cancelAnimationFrame(id)
  }, [])

  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      themes={['light', 'dark']}
    >
      {children}
    </NextThemesProvider>
  )
}
