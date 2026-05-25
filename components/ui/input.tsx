'use client'

import * as React from 'react'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    return (
      <input
        ref={ref} {...props}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 14,
          background: 'var(--ic-ws-bg)', color: 'var(--ic-ws-text)',
          border: '1px solid var(--ic-ws-border-strong)', outline: 'none',
          ...props.style,
        }}
      />
    )
  },
)

export function Field({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: 'var(--ic-ws-text-2)' }}>{label}</span>
      {children}
      {hint && !error && (
        <span className="text-[11px]" style={{ color: 'var(--ic-ws-text-3)' }}>{hint}</span>
      )}
      {error && (
        <span className="text-[11px]" style={{ color: 'var(--ic-ws-error)' }}>{error}</span>
      )}
    </label>
  )
}
