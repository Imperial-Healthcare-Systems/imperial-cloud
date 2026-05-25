import Link from 'next/link'
import { createHash } from 'node:crypto'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/theme/logo'
import { Workspace } from '@/components/theme/workspace'
import { serviceClient, userClient } from '@/lib/api'
import { AcceptButton } from './accept-button'

interface PageProps { params: Promise<{ token: string }> }

export const metadata = { title: 'You\'re invited · Imperial Cloud' }

/**
 * Public invitation landing page.
 *
 * The raw token is the capability — we hash it and look it up via the service
 * client (RLS would block anonymous reads otherwise). We surface enough info
 * (org name, inviter, role) for the recipient to make a decision, then route
 * them to sign in/up or accept depending on session state.
 *
 * The actual accept() call lives in the API and re-verifies email match.
 */
export default async function InvitePage({ params }: PageProps) {
  const { token } = await params

  const svc = serviceClient()
  const hash = createHash('sha256').update(token).digest('hex')
  type InviteRow = {
    id: string
    email: string
    role_key: string
    status: string
    expires_at: string | null
    organizations: { name: string } | null
    inviter: { full_name: string | null; email: string } | null
  }
  const { data: inv } = await svc
    .from('org_invitations')
    .select(`
      id, email, role_key, status, expires_at,
      organizations ( name ),
      inviter:profiles!org_invitations_invited_by_fkey ( full_name, email )
    `)
    .eq('token_hash', hash)
    .maybeSingle<InviteRow>()

  // Resolve current session.
  const supabase = await userClient()
  const { data: { user } } = await supabase.auth.getUser()

  const next = `/invite/${token}`

  return (
    <Workspace className="min-h-screen flex items-center justify-center px-4">
      <div
        className="w-full max-w-[440px] rounded-lg p-10 border"
        style={{
          background: 'var(--ic-ws-surface)',
          borderColor: 'var(--ic-ws-border)',
          boxShadow: 'var(--ic-ws-shadow-lifted)',
        }}
      >
        <div className="flex justify-center mb-8">
          <Logo height={32} />
        </div>

        {!inv ? (
          <Failed title="Invitation not found"
                  body="This link is invalid or has already been used. Ask the workspace admin to send a new invite." />
        ) : inv.status !== 'pending' ? (
          <Failed
            title={inv.status === 'accepted' ? 'Already accepted' : inv.status === 'revoked' ? 'Invitation revoked' : 'Invitation expired'}
            body="Reach out to the workspace admin for a fresh invitation."
          />
        ) : inv.expires_at && new Date(inv.expires_at) < new Date() ? (
          <Failed title="Invitation expired" body="Ask the workspace admin for a new invite link." />
        ) : (
          <Valid
            orgName={inv.organizations?.name ?? 'a workspace'}
            inviterName={inv.inviter?.full_name ?? inv.inviter?.email ?? 'A teammate'}
            role={inv.role_key}
            invitedEmail={inv.email}
            user={user}
            token={token}
            next={next}
          />
        )}
      </div>
    </Workspace>
  )
}

function Valid({
  orgName, inviterName, role, invitedEmail, user, token, next,
}: {
  orgName: string; inviterName: string; role: string; invitedEmail: string
  user: { email?: string | null } | null
  token: string; next: string
}) {
  const emailsMatch =
    !!user?.email && user.email.toLowerCase() === invitedEmail.toLowerCase()
  return (
    <>
      <h1
        className="text-xl font-display font-semibold text-center mb-1"
        style={{ color: 'var(--ic-ws-text)' }}
      >
        Join {orgName}
      </h1>
      <p className="text-sm text-center mb-6" style={{ color: 'var(--ic-ws-text-2)' }}>
        <strong style={{ color: 'var(--ic-ws-text)' }}>{inviterName}</strong> invited{' '}
        <strong style={{ color: 'var(--ic-ws-text)' }}>{invitedEmail}</strong> to {orgName} as{' '}
        <span
          className="px-1.5 py-0.5 rounded text-xs"
          style={{ background: 'var(--ic-ws-elevated)', color: 'var(--ic-ws-text-2)' }}
        >
          {role}
        </span>
        .
      </p>

      {!user ? (
        <SignedOut email={invitedEmail} next={next} />
      ) : emailsMatch ? (
        <AcceptButton token={token} />
      ) : (
        <WrongAccount currentEmail={user.email ?? ''} expectedEmail={invitedEmail} next={next} />
      )}
    </>
  )
}

function SignedOut({ email, next }: { email: string; next: string }) {
  const e = encodeURIComponent(email)
  const n = encodeURIComponent(next)
  return (
    <div className="flex flex-col gap-2">
      <Link
        href={`/signup?email=${e}&next=${n}`}
        className="w-full py-2 rounded-md font-medium text-sm text-center"
        style={{ background: 'var(--ic-ws-brand-bright)', color: '#fff' }}
      >
        Create account to accept
      </Link>
      <Link
        href={`/login?next=${n}`}
        className="w-full py-2 rounded-md font-medium text-sm text-center border"
        style={{
          background: 'transparent',
          color: 'var(--ic-ws-text)',
          borderColor: 'var(--ic-ws-border-strong)',
        }}
      >
        Sign in instead
      </Link>
    </div>
  )
}

function WrongAccount({ currentEmail, expectedEmail, next }: { currentEmail: string; expectedEmail: string; next: string }) {
  return (
    <div>
      <div
        className="rounded-md p-3 text-xs mb-3"
        style={{
          background: 'color-mix(in oklab, var(--ic-ws-flame) 12%, transparent)',
          color: 'var(--ic-ws-text)',
        }}
      >
        You're signed in as <strong>{currentEmail}</strong>, but this invitation is for{' '}
        <strong>{expectedEmail}</strong>. Sign out and use the right account.
      </div>
      <form action="/api/auth/signout" method="post">
        <input type="hidden" name="next" value={next} />
        <button
          type="submit"
          className="w-full py-2 rounded-md font-medium text-sm"
          style={{ background: 'var(--ic-ws-brand-bright)', color: '#fff' }}
        >
          Sign out
        </button>
      </form>
    </div>
  )
}

function Failed({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center">
      <h1
        className="text-xl font-display font-semibold mb-1"
        style={{ color: 'var(--ic-ws-text)' }}
      >
        {title}
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--ic-ws-text-2)' }}>{body}</p>
      <Link
        href="/login"
        className="inline-block px-4 py-2 rounded-md text-sm border"
        style={{
          background: 'transparent', color: 'var(--ic-ws-text)',
          borderColor: 'var(--ic-ws-border-strong)',
        }}
      >
        Go to sign in
      </Link>
    </div>
  )
}
