// =============================================================================
// /api/members/invitations — manage pending team invitations.
//   DELETE ?id=  revoke a pending invite (user.manage permission)
// =============================================================================

import { type NextRequest } from 'next/server'
import { getAuth, requirePermission, ok, Errors, audit } from '@/lib/api'

export async function DELETE(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return Errors.validation('id is required')

  // Read the invite via RLS (caller must already be allowed to see it —
  // inviter or org admin per the policy in migration 08).
  const { data: invite } = await ctx.supabase
    .from('org_invitations')
    .select('id, org_id, email, status')
    .eq('id', id)
    .maybeSingle()
  if (!invite) return Errors.notFound('Invitation not found')
  if (invite.status !== 'pending') {
    return Errors.validation(`Invitation is already ${invite.status}`)
  }

  if (!(await requirePermission(ctx, invite.org_id, 'user.manage'))) {
    return Errors.forbidden()
  }

  const { error } = await ctx.supabase
    .from('org_invitations')
    .update({ status: 'revoked' })
    .eq('id', id)
  if (error) {
    if (error.code === '42501') return Errors.forbidden()
    return Errors.server(error.message)
  }

  await audit({
    req, orgId: invite.org_id, actorId: ctx.userId, action: 'member.remove',
    targetType: 'invitation', targetId: id, metadata: { email: invite.email, event: 'revoked' },
  })
  return ok({ revoked: true })
}
