'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Field, Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { apiPost, ApiError } from '@/lib/fetcher'

export function OnboardingForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  // Auto-derive slug from the name as the user types, until they edit slug manually.
  function onNameChange(v: string) {
    setName(v)
    if (!touched) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40))
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setBusy(true)
    try {
      await apiPost('/api/orgs', { name, slug })
      router.replace('/drive')
      router.refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create workspace')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Workspace name">
        <Input
          required minLength={2} maxLength={80}
          value={name} onChange={e => onNameChange(e.target.value)}
          placeholder="Imperial Tech Innovations"
        />
      </Field>
      <Field label="URL slug" hint="2–40 chars · lowercase, numbers, dashes">
        <Input
          required pattern="^[a-z0-9-]{2,40}$"
          value={slug}
          onChange={e => { setSlug(e.target.value); setTouched(true) }}
          placeholder="imperial-tech"
        />
      </Field>
      {error && <p className="text-xs" style={{ color: 'var(--ic-ws-error)' }}>{error}</p>}
      <Button type="submit" loading={busy}>Create workspace</Button>
    </form>
  )
}
