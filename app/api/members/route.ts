// =============================================================================
// /api/members — list members, invite by email, update role/status, remove.
// =============================================================================

import { type NextRequest } from 'next/server'
import { createHash, randomBytes } from 'node:crypto'
import {
  getAuth, requirePermission, parse, ok, Errors, rateLimit, audit, serviceClient,
} from '@/lib/api'
import { inviteMemberSchema, updateMemberSchema } from '@/lib/validation'

export async function GET(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  if (!orgId) return Errors.validation('orgId is required')

  // RLS scopes to orgs the caller is a member of. Embed the profile for display.
  const { data, error } = await ctx.supabase.from('organization_members')
    .select(`
      id, role_key, status, storage_used_bytes, storage_quota_bytes, joined_at,
      user:profiles!organization_members_user_id_fkey(id, email, full_name, avatar_url, last_seen_at)
    `)
    .eq('org_id', orgId)
    .order('joined_at', { ascending: true })
  if (error) return Errors.server(error.message)

  // Also surface pending invites for admins.
  let invites: unknown[] = []
  if (await requirePermission(ctx, orgId, 'user.manage')) {
    const { data: inv } = await ctx.supabase.from('org_invitations')
      .select('id,email,role_key,status,expires_at,created_at')
      .eq('org_id', orgId).eq('status', 'pending')
      .order('created_at', { ascending: false })
    invites = inv ?? []
  }
  return ok({ items: data ?? [], invites })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const rl = await rateLimit(req, ctx.userId, 'members:invite')
  if (!rl.ok) return Errors.rateLimited(rl.retryAfter)

  const parsed = await parse(req, inviteMemberSchema)
  if ('error' in parsed) return parsed.error
  const { orgId, email, roleKey, quotaBytes } = parsed.data
  if (!(await requirePermission(ctx, orgId, 'user.invite'))) return Errors.forbidden()

  // If a profile with that email already exists, promote them directly.
  const svc = serviceClient()
  const { data: existing } = await svc.from('profiles').select('id').ilike('email', email).maybeSingle()
  if (existing?.id) {
    const { error } = await ctx.supabase.from('organization_members').insert({
      org_id: orgId, user_id: existing.id, role_key: roleKey, status: 'active',
      storage_quota_bytes: quotaBytes ?? null, invited_by: ctx.userId, joined_at: new Date().toISOString(),
    })
    if (error) {
      if (error.code === '23505') return Errors.validation('Already a member')
      if (error.code === '42501') return Errors.forbidden()
      return Errors.server(error.message)
    }
    await audit({ req, orgId, actorId: ctx.userId, action: 'member.invite',
      targetType: 'member', targetId: existing.id, metadata: { email, roleKey } })
    return ok({ promoted: true }, { status: 201 })
  }

  // Otherwise queue an invitation keyed by email; consumed on the user's first sign-in.
  const token = randomBytes(24).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const { data, error } = await ctx.supabase.from('org_invitations').insert({
    org_id: orgId, email, role_key: roleKey, invited_by: ctx.userId, token_hash: tokenHash,
  }).select('id,email,role_key,expires_at').single()
  if (error) {
    if (error.code === '23505') return Errors.validation('An invitation already exists for this email')
    if (error.code === '42501') return Errors.forbidden()
    return Errors.server(error.message)
  }
  await audit({ req, orgId, actorId: ctx.userId, action: 'member.invite',
    targetType: 'invitation', targetId: data.id, metadata: { email, roleKey } })
  return ok({ ...data, inviteToken: token }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const parsed = await parse(req, updateMemberSchema)
  if ('error' in parsed) return parsed.error
  const { orgId, userId, roleKey, status, quotaBytes } = parsed.data

  // Permission AND target privilege check both enforced by RLS via can_manage_member.
  if (!(await requirePermission(ctx, orgId, 'user.manage'))) return Errors.forbidden()

  const patch: Record<string, unknown> = {}
  if (roleKey) patch.role_key = roleKey
  if (status) patch.status = status
  if (quotaBytes !== undefined) patch.storage_quota_bytes = quotaBytes
  if (Object.keys(patch).length === 0) return Errors.validation('Nothing to update')

  const { data, error } = await ctx.supabase.from('organization_members')
    .update(patch).eq('org_id', orgId).eq('user_id', userId).select().single()
  if (error) {
    if (error.code === '42501') return Errors.forbidden('You cannot manage this member')
    return Errors.server(error.message)
  }
  await audit({ req, orgId, actorId: ctx.userId, action: 'permission.change',
    targetType: 'member', targetId: userId, metadata: patch })
  return ok(data)
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  const userId = searchParams.get('userId')
  if (!orgId || !userId) return Errors.validation('orgId and userId required')
  if (!(await requirePermission(ctx, orgId, 'user.manage'))) return Errors.forbidden()

  const { error } = await ctx.supabase.from('organization_members')
    .delete().eq('org_id', orgId).eq('user_id', userId)
  if (error) {
    if (error.code === '42501') return Errors.forbidden()
    return Errors.server(error.message)
  }
  await audit({ req, orgId, actorId: ctx.userId, action: 'member.remove',
    targetType: 'member', targetId: userId })
  return ok({ removed: true })
}
