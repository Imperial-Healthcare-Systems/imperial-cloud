'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiPost, ApiError } from '@/lib/fetcher'

export function AcceptButton({ token }: { token: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onAccept() {
    setBusy(true); setErr(null)
    try {
      await apiPost('/api/team/accept', { token })
      setDone(true)
      // Tiny delay so the success state is visible.
      setTimeout(() => { router.replace('/drive'); router.refresh() }, 700)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not accept invitation')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-center justify-center gap-2 py-3 rounded-md text-sm font-medium"
           style={{ background: 'color-mix(in oklab, var(--ic-ws-success) 14%, transparent)', color: 'var(--ic-ws-success)' }}>
        <Check size={16} strokeWidth={2.2} /> Joined! Redirecting…
      </div>
    )
  }

  return (
    <>
      <Button onClick={onAccept} loading={busy} style={{ width: '100%' }}>
        Accept invitation
      </Button>
      {err && (
        <p className="text-xs mt-3 text-center" style={{ color: 'var(--ic-ws-error)' }}>{err}</p>
      )}
    </>
  )
}
