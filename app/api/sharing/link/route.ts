// =============================================================================
// /api/sharing/link — read or revoke the active public share link.
//   GET ?fileId= | ?folderId=  → returns { active: boolean, info: {…} | null }
//   DELETE ?id=                → revokes (sets status = 'revoked')
//
// The raw token is NEVER readable once stored (we keep only its hash). Creating
// a new link lives in /api/sharing PUT. This endpoint exists so the share
// dialog can show "link is active" + a revoke control without exposing tokens.
// =============================================================================

import { type NextRequest } from 'next/server'
import { getAuth, ok, Errors, audit } from '@/lib/api'

export async function GET(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const { searchParams } = new URL(req.url)
  const fileId = searchParams.get('fileId')
  const folderId = searchParams.get('folderId')
  if (!fileId && !folderId) return Errors.validation('fileId or folderId required')

  let q = ctx.supabase.from('shared_links')
    .select('id, permission, status, expires_at, max_downloads, download_count, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
  q = fileId ? q.eq('file_id', fileId) : q.eq('folder_id', folderId!)

  const { data, error } = await q.maybeSingle()
  if (error && error.code !== 'PGRST116') return Errors.server(error.message)
  return ok({ active: !!data, info: data ?? null })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return Errors.validation('id is required')

  const { data: link } = await ctx.supabase
    .from('shared_links')
    .select('id, org_id, file_id, folder_id')
    .eq('id', id).maybeSingle()
  if (!link) return Errors.notFound()

  // Soft-revoke (preserves audit trail). Token hash is left intact but cannot
  // be redeemed because the resolver filters by status = 'active'.
  const { error } = await ctx.supabase
    .from('shared_links').update({ status: 'revoked' }).eq('id', id)
  if (error) {
    if (error.code === '42501') return Errors.forbidden()
    return Errors.server(error.message)
  }

  await audit({
    req, orgId: link.org_id, actorId: ctx.userId, action: 'unshare',
    targetType: 'link', targetId: id,
  })
  return ok({ revoked: true })
}
