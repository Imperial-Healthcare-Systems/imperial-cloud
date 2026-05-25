'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { browserClient } from '@/lib/supabase/client'

type Mode = 'password' | 'magic'

/**
 * Sign-in form (password OR magic link). Account creation lives on the
 * dedicated /signup page — link to it at the bottom.
 */
export function LoginForm() {
  const supabase = browserClient()
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') ?? '/drive'

  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setNotice(null); setBusy(true)
    try {
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        })
        if (error) throw error
        setNotice('Check your email for a sign-in link.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.replace(next)
        router.refresh()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed'
      if (/invalid login credentials/i.test(msg)) {
        setError('Wrong email or password.')
      } else if (/email not confirmed/i.test(msg)) {
        setError('Your email isn\'t confirmed yet. Check your inbox.')
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Email">
        <input
          type="email" required autoComplete="email" autoFocus
          value={email}
          onChange={e => { setEmail(e.target.value); if (error) setError(null) }}
          className="w-full px-3 py-2 rounded-md outline-none border text-sm"
          style={inputStyle}
        />
      </Field>

      {mode === 'password' && (
        <Field label="Password">
          <input
            type="password" required autoComplete="current-password" minLength={6}
            value={password}
            onChange={e => { setPassword(e.target.value); if (error) setError(null) }}
            className="w-full px-3 py-2 rounded-md outline-none border text-sm"
            style={inputStyle}
          />
        </Field>
      )}

      {error && <p className="text-xs" style={{ color: 'var(--ic-ws-error)' }}>{error}</p>}
      {notice && <p className="text-xs" style={{ color: 'var(--ic-ws-success)' }}>{notice}</p>}

      <button
        type="submit" disabled={busy}
        className="w-full py-2 rounded-md font-medium text-sm transition-opacity disabled:opacity-60"
        style={{ background: 'var(--ic-ws-brand-bright)', color: '#fff' }}
      >
        {busy ? 'Working…' : mode === 'magic' ? 'Send magic link' : 'Sign in'}
      </button>

      <button
        type="button"
        onClick={() => { setMode(mode === 'password' ? 'magic' : 'password'); setError(null); setNotice(null) }}
        className="text-xs underline-offset-2 hover:underline self-center"
        style={{ color: 'var(--ic-ws-text-2)' }}
      >
        {mode === 'password' ? 'Use a magic link instead' : 'Use password instead'}
      </button>

      <div className="text-xs text-center pt-1" style={{ color: 'var(--ic-ws-text-2)' }}>
        Need an account?{' '}
        <Link
          href="/signup"
          className="underline underline-offset-2"
          style={{ color: 'var(--ic-ws-brand-bright)' }}
        >
          Sign up
        </Link>
      </div>
    </form>
  )
}

const inputStyle: React.CSSProperties = {
  background: 'var(--ic-ws-bg)',
  color: 'var(--ic-ws-text)',
  borderColor: 'var(--ic-ws-border-strong)',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium" style={{ color: 'var(--ic-ws-text-2)' }}>{label}</span>
      {children}
    </label>
  )
}
