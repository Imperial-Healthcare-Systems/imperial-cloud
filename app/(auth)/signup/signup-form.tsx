'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Mail } from 'lucide-react'
import { z } from 'zod'
import { browserClient } from '@/lib/supabase/client'
import { Field } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

/**
 * Production signup form.
 *
 * Why no react-hook-form: keeping the dependency footprint tight. The form is
 * small enough that field-level state + Zod parsing on blur/submit is clean.
 *
 * Auto-workspace: if `workspace_name` is provided, the handle_new_user trigger
 * creates the org during the auth.users insert (migration 09). The user lands
 * in /drive ready to use. If empty, they go through /onboarding to pick a name.
 */

const schema = z.object({
  full_name: z.string().min(2, 'Use your full name').max(80),
  email: z.string().email('Use a valid email'),
  password: z.string()
    .min(8, 'At least 8 characters')
    .regex(/[a-z]/, 'Add a lowercase letter')
    .regex(/[A-Z]/, 'Add an uppercase letter')
    .regex(/\d/, 'Add a number')
    .regex(/[^A-Za-z0-9]/, 'Add a special character'),
  confirm: z.string(),
  workspace_name: z.string().max(80).optional().or(z.literal('')),
}).refine((d) => d.password === d.confirm, {
  message: 'Passwords do not match', path: ['confirm'],
})
type FieldErrors = Partial<Record<keyof z.infer<typeof schema>, string>>

export function SignupForm() {
  const router = useRouter()
  const supabase = browserClient()
  const params = useSearchParams()
  const prefillEmail = params.get('email') ?? ''
  // Where to land after signup completes. /drive is the default; invite flows
  // pass /invite/<token> so they can return and click "Accept".
  const next = params.get('next') ?? '/drive'

  const [values, setValues] = useState({
    full_name: '', email: prefillEmail, password: '', confirm: '', workspace_name: '',
  })
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [submitErr, setSubmitErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [needsEmailCheck, setNeedsEmailCheck] = useState(false)

  const errors = useMemo<FieldErrors>(() => {
    const r = schema.safeParse(values)
    if (r.success) return {}
    const out: FieldErrors = {}
    for (const e of r.error.errors) {
      const k = e.path[0] as keyof typeof values
      if (k && !out[k]) out[k] = e.message
    }
    return out
  }, [values])

  const strength = useMemo(() => passwordScore(values.password), [values.password])

  function set<K extends keyof typeof values>(k: K, v: string) {
    setValues((s) => ({ ...s, [k]: v }))
    if (submitErr) setSubmitErr(null)
  }
  function blur(k: keyof typeof values) {
    setTouched((s) => ({ ...s, [k]: true }))
  }
  function err(k: keyof typeof values): string | undefined {
    return touched[k] ? errors[k] : undefined
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setTouched({ full_name: true, email: true, password: true, confirm: true })
    if (Object.keys(errors).length > 0) return

    setBusy(true); setSubmitErr(null)
    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          data: {
            full_name: values.full_name.trim(),
            workspace_name: values.workspace_name.trim() || undefined,
          },
        },
      })
      if (error) throw error

      // If email confirmation is disabled, session is returned immediately.
      if (data.session) {
        router.replace(next)
        router.refresh()
        return
      }
      // Otherwise show the "check your email" screen.
      setNeedsEmailCheck(true)
      setDone(true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not create account'
      // Re-map a few common Supabase errors to friendlier copy.
      if (/already registered|user already exists/i.test(msg)) {
        setSubmitErr('That email is already registered. Try signing in instead.')
      } else if (/password/i.test(msg) && /weak/i.test(msg)) {
        setSubmitErr('That password is too weak. Try a longer mix of letters, numbers, and symbols.')
      } else {
        setSubmitErr(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  if (done && needsEmailCheck) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="text-center"
      >
        <div
          className="w-12 h-12 mx-auto rounded-full grid place-items-center mb-4"
          style={{ background: 'var(--ic-ws-brand-muted)', color: 'var(--ic-ws-brand-bright)' }}
        >
          <Mail size={20} strokeWidth={1.9} />
        </div>
        <h2 className="text-base font-medium mb-1" style={{ color: 'var(--ic-ws-text)' }}>
          Confirm your email
        </h2>
        <p className="text-sm" style={{ color: 'var(--ic-ws-text-2)' }}>
          We sent a link to <strong style={{ color: 'var(--ic-ws-text)' }}>{values.email}</strong>.
          Click it to finish setting up your account.
        </p>
        <p className="text-xs mt-4" style={{ color: 'var(--ic-ws-text-3)' }}>
          Didn't get it? Check spam, then{' '}
          <button
            type="button" className="underline underline-offset-2"
            onClick={() => { setDone(false); setNeedsEmailCheck(false) }}
            style={{ color: 'var(--ic-ws-brand-bright)' }}
          >
            try again
          </button>
          .
        </p>
      </motion.div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Full name" error={err('full_name')}>
        <input
          type="text" autoComplete="name" autoFocus required
          value={values.full_name}
          onChange={(e) => set('full_name', e.target.value)}
          onBlur={() => blur('full_name')}
          className={inputClass}
          style={inputStyle(!!err('full_name'))}
        />
      </Field>

      <Field label="Email" error={err('email')}>
        <input
          type="email" autoComplete="email" required
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
          onBlur={() => blur('email')}
          className={inputClass}
          style={inputStyle(!!err('email'))}
        />
      </Field>

      <Field label="Password" error={err('password')}>
        <input
          type="password" autoComplete="new-password" required minLength={8}
          value={values.password}
          onChange={(e) => set('password', e.target.value)}
          onBlur={() => blur('password')}
          className={inputClass}
          style={inputStyle(!!err('password'))}
        />
        <PasswordStrength password={values.password} score={strength} />
      </Field>

      <Field label="Confirm password" error={err('confirm')}>
        <input
          type="password" autoComplete="new-password" required
          value={values.confirm}
          onChange={(e) => set('confirm', e.target.value)}
          onBlur={() => blur('confirm')}
          className={inputClass}
          style={inputStyle(!!err('confirm'))}
        />
      </Field>

      <Field label="Workspace name" hint="Optional — leave blank to choose one later.">
        <input
          type="text" autoComplete="organization"
          value={values.workspace_name}
          onChange={(e) => set('workspace_name', e.target.value)}
          placeholder="Acme Inc."
          className={inputClass}
          style={inputStyle(false)}
        />
      </Field>

      <AnimatePresence>
        {submitErr && (
          <motion.p
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-xs"
            style={{ color: 'var(--ic-ws-error)' }}
          >
            {submitErr}
          </motion.p>
        )}
      </AnimatePresence>

      <Button type="submit" loading={busy}>Create account</Button>
    </form>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const inputClass = 'w-full px-3 py-2 rounded-md outline-none border text-sm'
function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    background: 'var(--ic-ws-bg)',
    color: 'var(--ic-ws-text)',
    borderColor: hasError ? 'var(--ic-ws-error)' : 'var(--ic-ws-border-strong)',
  }
}

interface StrengthInfo { score: number; label: string; bars: number }
function passwordScore(p: string): StrengthInfo {
  if (!p) return { score: 0, label: '', bars: 0 }
  let n = 0
  if (p.length >= 8) n++
  if (p.length >= 12) n++
  if (/[a-z]/.test(p)) n++
  if (/[A-Z]/.test(p)) n++
  if (/\d/.test(p)) n++
  if (/[^A-Za-z0-9]/.test(p)) n++
  // Map raw count → 4 bars.
  const bars = n <= 2 ? 1 : n <= 3 ? 2 : n <= 4 ? 3 : 4
  const label = bars === 1 ? 'Weak' : bars === 2 ? 'Fair' : bars === 3 ? 'Good' : 'Strong'
  return { score: n, label, bars }
}

function PasswordStrength({ password, score }: { password: string; score: StrengthInfo }) {
  if (!password) return null
  const checks = [
    { ok: password.length >= 8, label: '8+ characters' },
    { ok: /[a-z]/.test(password), label: 'lowercase' },
    { ok: /[A-Z]/.test(password), label: 'uppercase' },
    { ok: /\d/.test(password), label: 'number' },
    { ok: /[^A-Za-z0-9]/.test(password), label: 'symbol' },
  ]
  const colors = [
    'var(--ic-ws-error)',
    'var(--ic-ws-flame)',
    'var(--ic-ws-brand-bright)',
    'var(--ic-ws-success)',
  ]
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-1 flex-1 rounded-full transition-colors"
            style={{
              background: i < score.bars ? colors[score.bars - 1] : 'var(--ic-ws-border)',
            }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[10px] uppercase tracking-wide font-medium"
              style={{ color: colors[Math.max(0, score.bars - 1)] }}>
          {score.label}
        </span>
        <ul className="flex gap-2 flex-wrap text-[10px]">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-0.5"
                style={{ color: c.ok ? 'var(--ic-ws-success)' : 'var(--ic-ws-text-3)' }}>
              {c.ok ? <Check size={10} strokeWidth={3} /> : <span className="w-2.5 inline-block" />}
              {c.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
