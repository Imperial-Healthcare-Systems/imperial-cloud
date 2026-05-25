// =============================================================================
// /api/orgs — list a user's orgs; create a new org (calls create_organization RPC)
// =============================================================================

import { type NextRequest } from 'next/server'
import { getAuth, parse, ok, Errors, rateLimit, audit } from '@/lib/api'
import { createOrgSchema } from '@/lib/validation'

export async function GET() {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  // RLS limits this to orgs where the caller is a member.
  const { data, error } = await ctx.supabase
    .from('organizations')
    .select('id,name,slug,storage_used_bytes,storage_quota_bytes,created_at')
    .order('created_at', { ascending: false })
  if (error) return Errors.server(error.message)
  return ok({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const rl = await rateLimit(req, ctx.userId, 'orgs:create')
  if (!rl.ok) return Errors.rateLimited(rl.retryAfter)

  const parsed = await parse(req, createOrgSchema)
  if ('error' in parsed) return parsed.error

  const { data, error } = await ctx.supabase.rpc('create_organization', {
    p_name: parsed.data.name, p_slug: parsed.data.slug,
  })
  if (error) {
    if (error.code === '23505') return Errors.validation('That slug is already taken')
    if (/slug/.test(error.message)) return Errors.validation(error.message)
    return Errors.server(error.message)
  }

  // RPC returns a row matching `organizations` shape.
  const org = Array.isArray(data) ? data[0] : data
  await audit({ req, orgId: org?.id ?? null, actorId: ctx.userId, action: 'settings.change',
    targetType: 'org', targetId: org?.id, metadata: { event: 'org.create', name: parsed.data.name } })
  return ok(org, { status: 201 })
}
