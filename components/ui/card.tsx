'use client'

import * as React from 'react'

export function Card({ className = '', style, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{
        background: 'var(--ic-ws-surface)',
        border: '1px solid var(--ic-ws-border)',
        boxShadow: 'var(--ic-ws-shadow-resting)',
        ...style,
      }}
      {...rest}
    />
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div
      className="rounded-lg p-10 text-center border border-dashed"
      style={{
        background: 'var(--ic-ws-surface)',
        borderColor: 'var(--ic-ws-border-strong)',
        color: 'var(--ic-ws-text-2)',
      }}
    >
      <div className="text-sm font-medium" style={{ color: 'var(--ic-ws-text)' }}>{title}</div>
      {body && <div className="text-xs mt-1">{body}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: {
  title: string; subtitle?: string; actions?: React.ReactNode
}) {
  return (
    <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-display font-semibold" style={{ color: 'var(--ic-ws-text)' }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm mt-1" style={{ color: 'var(--ic-ws-text-2)' }}>{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
