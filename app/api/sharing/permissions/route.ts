// =============================================================================
// /api/sharing/permissions — manage existing internal shares.
//   GET ?fileId= | ?folderId=   list current people with access
//   PATCH                       update a share's permission
//   DELETE ?id=                 revoke a share
//
// All gating happens via RLS on `shares` (see migration 11). The handlers do
// audit + envelope work and translate Postgres errors into friendly codes.
// =============================================================================

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuth, parse, ok, Errors, audit } from '@/lib/api'

// ── GET ──────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('fileId')
  const folderId = searchParams.get('folderId')
  if (!fileId && !folderId) return Errors.validation('fileId or folderId required')

  let q = ctx.supabase.from('shares')
    .select(`
      id, permission, created_at,
      shared_by, shared_with,
      user:profiles!shares_shared_with_fkey ( id, email, full_name, avatar_url )
    `)
    .order('created_at', { ascending: true })
  q = fileId ? q.eq('file_id', fileId) : q.eq('folder_id', folderId!)

  const { data, error } = await q
  if (error) return Errors.server(error.message)
  return ok({ items: data ?? [] })
}

// ── PATCH ────────────────────────────────────────────────────────────────────
const updateSchema = z.object({
  shareId: z.string().uuid(),
  permission: z.enum(['view', 'comment', 'edit']),
})
export async function PATCH(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const parsed = await parse(req, updateSchema)
  if ('error' in parsed) return parsed.error
  const { shareId, permission } = parsed.data

  // Read first so the audit log knows the file/folder being affected.
  const { data: share } = await ctx.supabase
    .from('shares')
    .select('id, org_id, file_id, folder_id, permission, shared_with')
    .eq('id', shareId)
    .maybeSingle()
  if (!share) return Errors.notFound()

  const { error } = await ctx.supabase
    .from('shares').update({ permission }).eq('id', shareId)
  if (error) {
    if (error.code === '42501') return Errors.forbidden()
    return Errors.server(error.message)
  }

  await audit({
    req, orgId: share.org_id, actorId: ctx.userId, action: 'permission.change',
    targetType: share.file_id ? 'file' : 'folder',
    targetId: (share.file_id ?? share.folder_id)!,
    metadata: { share_id: shareId, from: share.permission, to: permission, target_user: share.shared_with },
  })
  return ok({ updated: true })
}

// ── DELETE ───────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return Errors.validation('id is required')

  const { data: share } = await ctx.supabase
    .from('shares')
    .select('id, org_id, file_id, folder_id, shared_with')
    .eq('id', id).maybeSingle()
  if (!share) return Errors.notFound()

  const { error } = await ctx.supabase.from('shares').delete().eq('id', id)
  if (error) {
    if (error.code === '42501') return Errors.forbidden()
    return Errors.server(error.message)
  }

  await audit({
    req, orgId: share.org_id, actorId: ctx.userId, action: 'unshare',
    targetType: share.file_id ? 'file' : 'folder',
    targetId: (share.file_id ?? share.folder_id)!,
    metadata: { revoked_user: share.shared_with },
  })
  return ok({ revoked: true })
}
