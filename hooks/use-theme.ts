'use client'

import { useTheme as useNextTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import type { ThemeName } from '@/lib/theme-config'

/**
 * SSR-safe theme hook.
 *
 * `mounted` guards against hydration mismatch: until the component has
 * mounted on the client, the resolved theme is unknown on the server, so
 * theme-dependent rendering (like the logo swap) must wait for `mounted`.
 *
 * Returns:
 *  - theme:         the user's setting ('light' | 'dark' | 'system')
 *  - resolvedTheme: the actual active theme after system resolution
 *  - setTheme:      setter
 *  - toggle:        convenience flip between light/dark
 *  - isDark:        boolean, only meaningful once mounted
 *  - mounted:       whether we're safely on the client
 */
export function useTheme() {
  const { theme, resolvedTheme, setTheme, systemTheme } = useNextTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const active = (resolvedTheme ?? 'dark') as ThemeName
  const isDark = active === 'dark'

  const toggle = () => setTheme(isDark ? 'light' : 'dark')

  return {
    theme,
    resolvedTheme: active,
    systemTheme,
    setTheme,
    toggle,
    isDark,
    mounted,
  }
}
