// =============================================================================
// POST /api/files/rename — rename a file. Storage objects keep their keys;
// only `files.name` changes (which also drives the search vector via trigger).
// =============================================================================

import { type NextRequest } from 'next/server'
import { getAuth, requirePermission, parse, ok, Errors, audit } from '@/lib/api'
import { renameFileSchema } from '@/lib/validation'

export async function POST(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const parsed = await parse(req, renameFileSchema)
  if ('error' in parsed) return parsed.error
  const { fileId, name } = parsed.data

  const { data: file } = await ctx.supabase
    .from('files')
    .select('id, org_id, owner_id, name')
    .eq('id', fileId).maybeSingle()
  if (!file) return Errors.notFound()
  const canEdit = file.owner_id === ctx.userId
    || (await requirePermission(ctx, file.org_id, 'file.edit'))
  if (!canEdit) return Errors.forbidden()
  if (file.name === name) return ok({ renamed: false, fileId, name })

  const { error } = await ctx.supabase
    .from('files').update({ name }).eq('id', fileId)
  if (error) {
    if (error.code === '23505') return Errors.validation('A file with that name already exists here')
    if (error.code === '42501') return Errors.forbidden()
    return Errors.server(error.message)
  }

  await audit({
    req, orgId: file.org_id, actorId: ctx.userId, action: 'rename',
    targetType: 'file', targetId: fileId, metadata: { from: file.name, to: name },
  })
  return ok({ renamed: true, fileId, name })
}
