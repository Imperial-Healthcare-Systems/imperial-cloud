// =============================================================================
// POST /api/team/accept — redeem an invite token (caller must be authenticated
// and their email must match the invite).
// =============================================================================

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuth, parse, ok, Errors, rateLimit, audit } from '@/lib/api'

const schema = z.object({ token: z.string().min(8).max(256) })

export async function POST(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const rl = await rateLimit(req, ctx.userId, 'team:accept')
  if (!rl.ok) return Errors.rateLimited(rl.retryAfter)

  const parsed = await parse(req, schema)
  if ('error' in parsed) return parsed.error

  const { data, error } = await ctx.supabase.rpc('accept_invitation_by_token', {
    p_token: parsed.data.token,
  })
  if (error) {
    // The RPC raises with descriptive messages; map common ones to user copy.
    const m = error.message
    if (/expired/i.test(m)) return Errors.validation('This invitation has expired.')
    if (/already accepted|already used/i.test(m)) return Errors.validation('This invitation was already used.')
    if (/for /i.test(m)) return Errors.forbidden(m.replace(/^.*?:\s*/, ''))
    if (/not found/i.test(m)) return Errors.notFound('Invitation not found.')
    return Errors.server(m)
  }

  const result = data as { org_id: string; role_key: string }
  await audit({
    req, orgId: result.org_id, actorId: ctx.userId, action: 'member.invite',
    targetType: 'invitation', metadata: { accepted: true, role: result.role_key },
  })
  return ok(result)
}
