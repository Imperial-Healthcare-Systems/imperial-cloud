// =============================================================================
// POST /api/files/move — move a file into a folder (or to the root).
// Storage objects do NOT move; only the logical folder_id pointer.
// Cross-org moves are impossible (server checks file.org_id === folder.org_id).
// =============================================================================

import { type NextRequest } from 'next/server'
import { getAuth, requirePermission, parse, ok, Errors, rateLimit, audit } from '@/lib/api'
import { moveFileSchema } from '@/lib/validation'

export async function POST(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const rl = await rateLimit(req, ctx.userId, 'files:move')
  if (!rl.ok) return Errors.rateLimited(rl.retryAfter)

  const parsed = await parse(req, moveFileSchema)
  if ('error' in parsed) return parsed.error
  const { fileId, folderId } = parsed.data

  // Read the file (RLS scopes visibility). Authorization to edit ≡ owner OR file.edit.
  const { data: file, error: fErr } = await ctx.supabase
    .from('files')
    .select('id, org_id, owner_id, folder_id, name, is_trashed')
    .eq('id', fileId)
    .maybeSingle()
  if (fErr || !file) return Errors.notFound('File not found')
  if (file.is_trashed) return Errors.validation('Restore the file from Trash before moving it')

  const canEdit = file.owner_id === ctx.userId
    || (await requirePermission(ctx, file.org_id, 'file.edit'))
  if (!canEdit) return Errors.forbidden()

  // Same-org check for the destination. RLS would block cross-org reads, so
  // a non-null folderId we can read here is guaranteed in the caller's orgs —
  // we still confirm org_id equality explicitly as defense in depth.
  if (folderId) {
    const { data: folder } = await ctx.supabase
      .from('folders')
      .select('id, org_id, is_trashed')
      .eq('id', folderId)
      .maybeSingle()
    if (!folder) return Errors.notFound('Destination folder not found')
    if (folder.org_id !== file.org_id) return Errors.forbidden('Cannot move across workspaces')
    if (folder.is_trashed) return Errors.validation('Destination folder is in Trash')
  }

  if ((file.folder_id ?? null) === (folderId ?? null)) {
    // No-op; respond OK so the client UX stays smooth.
    return ok({ moved: false, fileId, folderId: folderId ?? null })
  }

  const { error: uErr } = await ctx.supabase
    .from('files')
    .update({ folder_id: folderId ?? null })
    .eq('id', fileId)
  if (uErr) {
    // 23505 = unique (org_id, folder_id, name) collision — another file with
    // this name already exists in the destination.
    if (uErr.code === '23505') return Errors.validation('A file with this name already exists in the destination')
    if (uErr.code === '42501') return Errors.forbidden()
    return Errors.server(uErr.message)
  }

  await audit({
    req, orgId: file.org_id, actorId: ctx.userId, action: 'move',
    targetType: 'file', targetId: fileId,
    metadata: { from: file.folder_id ?? null, to: folderId ?? null, name: file.name },
  })

  return ok({ moved: true, fileId, folderId: folderId ?? null })
}
