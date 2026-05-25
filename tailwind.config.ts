import type { Config } from 'tailwindcss'

/**
 * Two token families:
 *  • shell-*  — permanent dark identity (sidebar, nav, brand)
 *  • ws-*     — adaptive workspace (dashboard, cards, tables)
 *
 * Use shell-* classes inside <AppShell>/<Sidebar>; use ws-* classes inside
 * <Workspace>. They resolve to different CSS variables, so the theme toggle
 * physically cannot recolor the shell.
 */
const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './providers/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Shell (constant dark)
        'shell-bg': 'var(--ic-shell-bg)',
        'shell-surface': 'var(--ic-shell-surface)',
        'shell-elevated': 'var(--ic-shell-elevated)',
        'shell-elevated-hover': 'var(--ic-shell-elevated-hover)',
        'shell-border': 'var(--ic-shell-border)',
        'shell-border-strong': 'var(--ic-shell-border-strong)',
        'shell-text': 'var(--ic-shell-text)',
        'shell-text-2': 'var(--ic-shell-text-2)',
        'shell-text-3': 'var(--ic-shell-text-3)',
        'shell-brand-bright': 'var(--ic-shell-brand-bright)',
        'shell-brand-muted': 'var(--ic-shell-brand-muted)',
        'shell-flame': 'var(--ic-shell-flame)',
        // Workspace (adaptive)
        'ws-bg': 'var(--ic-ws-bg)',
        'ws-surface': 'var(--ic-ws-surface)',
        'ws-elevated': 'var(--ic-ws-elevated)',
        'ws-elevated-hover': 'var(--ic-ws-elevated-hover)',
        'ws-border': 'var(--ic-ws-border)',
        'ws-border-strong': 'var(--ic-ws-border-strong)',
        'ws-text': 'var(--ic-ws-text)',
        'ws-text-2': 'var(--ic-ws-text-2)',
        'ws-text-3': 'var(--ic-ws-text-3)',
        'ws-brand': 'var(--ic-ws-brand)',
        'ws-brand-bright': 'var(--ic-ws-brand-bright)',
        'ws-brand-hover': 'var(--ic-ws-brand-hover)',
        'ws-brand-muted': 'var(--ic-ws-brand-muted)',
        'ws-flame': 'var(--ic-ws-flame)',
        'ws-flame-deep': 'var(--ic-ws-flame-deep)',
        'ws-success': 'var(--ic-ws-success)',
        'ws-error': 'var(--ic-ws-error)',
      },
      boxShadow: {
        'ws-resting': 'var(--ic-ws-shadow-resting)',
        'ws-lifted': 'var(--ic-ws-shadow-lifted)',
      },
      borderRadius: { sm: '8px', md: '12px', lg: '16px' },
      fontFamily: {
        display: ['"SF Pro Display"', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        body: ['"Inter"', '-apple-system', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
export default config
