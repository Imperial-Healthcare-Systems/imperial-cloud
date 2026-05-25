// =============================================================================
// POST /api/files/trash — soft-trash a file (sets is_trashed = true).
// Separate route from /api/files because the canonical /api/files PATCH is
// reserved for version rollback.
// =============================================================================

import { type NextRequest } from 'next/server'
import { getAuth, requirePermission, parse, ok, Errors, audit } from '@/lib/api'
import { trashSchema } from '@/lib/validation'

export async function POST(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const parsed = await parse(req, trashSchema)
  if ('error' in parsed) return parsed.error
  const { fileId } = parsed.data
  if (!fileId) return Errors.validation('fileId is required')

  const { data: file } = await ctx.supabase.from('files')
    .select('id,org_id,owner_id').eq('id', fileId).single()
  if (!file) return Errors.notFound()
  if (file.owner_id !== ctx.userId && !(await requirePermission(ctx, file.org_id, 'file.delete')))
    return Errors.forbidden()

  const { error } = await ctx.supabase.from('files')
    .update({ is_trashed: true, trashed_at: new Date().toISOString() })
    .eq('id', fileId)
  if (error) return Errors.server(error.message)

  await audit({ req, orgId: file.org_id, actorId: ctx.userId, action: 'delete',
    targetType: 'file', targetId: fileId })
  return ok({ trashed: true })
}

// Restore from trash.
export async function PATCH(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const parsed = await parse(req, trashSchema)
  if ('error' in parsed) return parsed.error
  const { fileId, folderId } = parsed.data

  if (fileId) {
    const { data: f } = await ctx.supabase.from('files').select('id,org_id,owner_id').eq('id', fileId).single()
    if (!f) return Errors.notFound()
    if (f.owner_id !== ctx.userId && !(await requirePermission(ctx, f.org_id, 'file.edit')))
      return Errors.forbidden()
    const { error } = await ctx.supabase.from('files')
      .update({ is_trashed: false, trashed_at: null }).eq('id', fileId)
    if (error) return Errors.server(error.message)
    await audit({ req, orgId: f.org_id, actorId: ctx.userId, action: 'restore', targetType: 'file', targetId: fileId })
    return ok({ restored: true })
  }

  if (folderId) {
    const { data: fo } = await ctx.supabase.from('folders').select('id,org_id,owner_id').eq('id', folderId).single()
    if (!fo) return Errors.notFound()
    if (fo.owner_id !== ctx.userId && !(await requirePermission(ctx, fo.org_id, 'folder.edit')))
      return Errors.forbidden()
    const { error } = await ctx.supabase.from('folders')
      .update({ is_trashed: false, trashed_at: null }).eq('id', folderId)
    if (error) return Errors.server(error.message)
    await audit({ req, orgId: fo.org_id, actorId: ctx.userId, action: 'restore', targetType: 'folder', targetId: folderId })
    return ok({ restored: true })
  }

  return Errors.validation('fileId or folderId required')
}
