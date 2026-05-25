// =============================================================================
// /api/files — create, list, and version files.
// Demonstrates the full handler pattern: rate limit → auth → validate →
// permission → action (RLS-backed or SECURITY DEFINER RPC) → audit.
// =============================================================================

import { type NextRequest } from 'next/server'
import {
  getAuth, requirePermission, parse, ok, Errors, rateLimit, audit,
} from '@/lib/api'
import { createFileSchema, uploadVersionSchema, rollbackSchema } from '@/lib/validation'

// ── POST /api/files — create a new (empty) file record ──────────────────────
export async function POST(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const rl = await rateLimit(req, ctx.userId, 'files:write')
  if (!rl.ok) return Errors.rateLimited(rl.retryAfter)

  const parsed = await parse(req, createFileSchema)
  if ('error' in parsed) return parsed.error
  const { orgId, folderId, name, mimeType } = parsed.data

  // Defense in depth: gate here even though RLS also enforces file.create.
  if (!(await requirePermission(ctx, orgId, 'file.create'))) return Errors.forbidden()

  // Insert via the user client — RLS WITH CHECK is the final authority.
  const { data, error } = await ctx.supabase
    .from('files')
    .insert({ org_id: orgId, folder_id: folderId ?? null, owner_id: ctx.userId, name, mime_type: mimeType })
    .select()
    .single()

  if (error) {
    if (error.code === '42501') return Errors.forbidden()        // RLS denial
    if (error.code === '23505') return Errors.validation('A file with that name already exists here')
    return Errors.server(error.message)
  }

  await audit({ req, orgId, actorId: ctx.userId, action: 'upload', targetType: 'file', targetId: data.id, metadata: { name } })
  return ok(data, { status: 201 })
}

// ── GET /api/files?orgId=&folderId= — list a folder's contents ──────────────
export async function GET(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  const folderId = searchParams.get('folderId')
  const limit = Math.min(Number(searchParams.get('limit') ?? 50), 100)
  const cursor = searchParams.get('cursor') // ISO created_at for keyset pagination
  if (!orgId) return Errors.validation('orgId is required')

  // RLS automatically restricts rows to those the user may see — no manual
  // ownership filter needed, which is what makes this IDOR-proof.
  let q = ctx.supabase
    .from('files')
    .select('id,name,mime_type,size_bytes,folder_id,owner_id,is_starred,created_at,updated_at')
    .eq('org_id', orgId)
    .eq('is_trashed', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  q = folderId ? q.eq('folder_id', folderId) : q.is('folder_id', null)
  if (cursor) q = q.lt('created_at', cursor)

  const { data, error } = await q
  if (error) return Errors.server(error.message)

  const nextCursor = data.length === limit ? data[data.length - 1].created_at : null
  return ok({ items: data, nextCursor })
}

// ── PUT /api/files — upload a new version (after object is in Storage) ──────
// The client uploads bytes directly to Storage via a signed URL, then calls
// this to register the version. We use the SECURITY DEFINER RPC so the version
// append + current repoint + quota delta happen atomically server-side.
export async function PUT(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const rl = await rateLimit(req, ctx.userId, 'files:upload')
  if (!rl.ok) return Errors.rateLimited(rl.retryAfter)

  const parsed = await parse(req, uploadVersionSchema)
  if ('error' in parsed) return parsed.error
  const { fileId, storagePath, sizeBytes, mimeType, checksumSha256, changeNote } = parsed.data

  // Resolve the file's org to check permission (RLS lets us read it only if allowed).
  const { data: file, error: fErr } = await ctx.supabase
    .from('files').select('id,org_id').eq('id', fileId).single()
  if (fErr || !file) return Errors.notFound('File not found or not accessible')
  if (!(await requirePermission(ctx, file.org_id, 'file.upload'))) return Errors.forbidden()

  // Atomic version creation via RPC. Quota errors surface as check_violation.
  const { data, error } = await ctx.supabase.rpc('create_file_version', {
    p_file_id: fileId, p_storage_path: storagePath, p_size: sizeBytes,
    p_mime: mimeType ?? null, p_checksum: checksumSha256 ?? null,
    p_uploader: ctx.userId, p_note: changeNote ?? null,
  })
  if (error) {
    if (error.message.includes('quota')) return Errors.quota()
    return Errors.server(error.message)
  }

  await audit({ req, orgId: file.org_id, actorId: ctx.userId, action: 'version.create', targetType: 'file', targetId: fileId, metadata: { sizeBytes, storagePath } })
  return ok(data, { status: 201 })
}

// ── PATCH /api/files — rollback to a prior version ──────────────────────────
export async function PATCH(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const parsed = await parse(req, rollbackSchema)
  if ('error' in parsed) return parsed.error
  const { fileId, versionNumber } = parsed.data

  const { data: file, error: fErr } = await ctx.supabase
    .from('files').select('id,org_id,owner_id').eq('id', fileId).single()
  if (fErr || !file) return Errors.notFound()
  if (file.owner_id !== ctx.userId && !(await requirePermission(ctx, file.org_id, 'file.edit')))
    return Errors.forbidden()

  const { error } = await ctx.supabase.rpc('rollback_file_version', {
    p_file_id: fileId, p_version: versionNumber,
  })
  if (error) return Errors.server(error.message)

  await audit({ req, orgId: file.org_id, actorId: ctx.userId, action: 'version.rollback', targetType: 'file', targetId: fileId, metadata: { versionNumber } })
  return ok({ rolledBackTo: versionNumber })
}
