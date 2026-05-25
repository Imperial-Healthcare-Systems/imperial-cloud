'use client'

import * as React from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

/**
 * Workspace-themed button. Reads `--ic-ws-*` tokens; do NOT use inside the shell
 * (use shell-styled buttons there). Inline styles keep the variants tractable
 * across themes without a class-explosion.
 */
export function Button({
  variant = 'primary', size = 'md', loading, disabled, children, style, ...rest
}: Props) {
  const base: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 8, fontWeight: 500, cursor: 'pointer',
    transition: 'background-color .15s, border-color .15s, opacity .15s',
    padding: size === 'sm' ? '6px 12px' : '8px 16px',
    fontSize: size === 'sm' ? 13 : 14,
    border: '1px solid transparent',
    opacity: disabled || loading ? 0.6 : 1,
    pointerEvents: disabled || loading ? 'none' : 'auto',
  }
  const variants: Record<Variant, React.CSSProperties> = {
    primary: { background: 'var(--ic-ws-brand-bright)', color: '#fff' },
    secondary: {
      background: 'var(--ic-ws-surface)',
      color: 'var(--ic-ws-text)',
      borderColor: 'var(--ic-ws-border-strong)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--ic-ws-text)',
      borderColor: 'transparent',
    },
    danger: { background: 'var(--ic-ws-error)', color: '#fff' },
  }
  return (
    <button {...rest} disabled={disabled || loading} style={{ ...base, ...variants[variant], ...style }}>
      {loading ? '…' : children}
    </button>
  )
}
