// =============================================================================
// /api/folders — CRUD for folders. Hierarchy is maintained by triggers on
// folders.path; cycle detection is server-side. We only orchestrate.
// =============================================================================

import { type NextRequest } from 'next/server'
import { getAuth, requirePermission, parse, ok, Errors, rateLimit, audit } from '@/lib/api'
import { createFolderSchema, updateFolderSchema } from '@/lib/validation'

export async function POST(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const rl = await rateLimit(req, ctx.userId, 'folders:write')
  if (!rl.ok) return Errors.rateLimited(rl.retryAfter)

  const parsed = await parse(req, createFolderSchema)
  if ('error' in parsed) return parsed.error
  const { orgId, name, parentId } = parsed.data

  if (!(await requirePermission(ctx, orgId, 'folder.create'))) return Errors.forbidden()

  const { data, error } = await ctx.supabase
    .from('folders')
    .insert({ org_id: orgId, name, parent_id: parentId ?? null, owner_id: ctx.userId })
    .select().single()
  if (error) {
    if (error.code === '42501') return Errors.forbidden()
    if (error.code === '23505') return Errors.validation('A folder with that name already exists here')
    return Errors.server(error.message)
  }

  await audit({ req, orgId, actorId: ctx.userId, action: 'settings.change',
    targetType: 'folder', targetId: data.id, metadata: { event: 'folder.create', name } })
  return ok(data, { status: 201 })
}

export async function GET(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  const parentId = searchParams.get('parentId')
  const all = searchParams.get('all') === '1'
  if (!orgId) return Errors.validation('orgId is required')

  let q = ctx.supabase
    .from('folders')
    .select('id,name,parent_id,owner_id,depth,path,created_at,updated_at')
    .eq('org_id', orgId).eq('is_trashed', false)
    .order('name', { ascending: true })

  // `all=1` returns the entire org's folder set (RLS still scopes to caller's
  // visible folders). Used by the move modal's tree picker.
  if (!all) {
    q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null)
  }

  const { data, error } = await q
  if (error) return Errors.server(error.message)
  return ok({ items: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const parsed = await parse(req, updateFolderSchema)
  if ('error' in parsed) return parsed.error
  const { folderId, name, parentId } = parsed.data

  // Read the folder via RLS to resolve org + ensure visibility.
  const { data: folder, error: fErr } = await ctx.supabase
    .from('folders').select('id,org_id,owner_id').eq('id', folderId).single()
  if (fErr || !folder) return Errors.notFound()
  if (folder.owner_id !== ctx.userId && !(await requirePermission(ctx, folder.org_id, 'folder.edit')))
    return Errors.forbidden()

  const patch: Record<string, unknown> = {}
  if (name !== undefined) patch.name = name
  if (parentId !== undefined) patch.parent_id = parentId
  const { data, error } = await ctx.supabase.from('folders')
    .update(patch).eq('id', folderId).select().single()
  if (error) {
    if (/subtree/.test(error.message)) return Errors.validation('Cannot move folder into its own subtree')
    if (error.code === '23505') return Errors.validation('A folder with that name already exists here')
    return Errors.server(error.message)
  }

  await audit({ req, orgId: folder.org_id, actorId: ctx.userId,
    action: parentId !== undefined ? 'move' : 'rename',
    targetType: 'folder', targetId: folderId, metadata: patch })
  return ok(data)
}

// Soft-trash. Permanent delete is a separate operation reserved for purge jobs.
export async function DELETE(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const { searchParams } = new URL(req.url)
  const folderId = searchParams.get('id')
  if (!folderId) return Errors.validation('id is required')

  const { data: folder } = await ctx.supabase.from('folders')
    .select('id,org_id,owner_id').eq('id', folderId).single()
  if (!folder) return Errors.notFound()
  if (folder.owner_id !== ctx.userId && !(await requirePermission(ctx, folder.org_id, 'folder.delete')))
    return Errors.forbidden()

  const { error } = await ctx.supabase.from('folders')
    .update({ is_trashed: true, trashed_at: new Date().toISOString() })
    .eq('id', folderId)
  if (error) return Errors.server(error.message)

  await audit({ req, orgId: folder.org_id, actorId: ctx.userId, action: 'delete',
    targetType: 'folder', targetId: folderId })
  return ok({ trashed: true })
}
