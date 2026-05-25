// =============================================================================
// POST /api/storage/download-url — mint a short-lived signed download URL.
// RLS on `files` decides visibility; we re-check `file.download` for defense.
// =============================================================================

import { type NextRequest } from 'next/server'
import {
  getAuth, requirePermission, parse, ok, Errors, audit, serviceClient,
} from '@/lib/api'
import { downloadUrlSchema } from '@/lib/validation'

const BUCKET = 'imperial-files'
const TTL_SEC = 120

export async function POST(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const parsed = await parse(req, downloadUrlSchema)
  if ('error' in parsed) return parsed.error
  const { fileId, versionNumber } = parsed.data

  const { data: file } = await ctx.supabase.from('files')
    .select('id, org_id, current_version_id, name').eq('id', fileId).maybeSingle()
  if (!file) return Errors.notFound()
  if (!(await requirePermission(ctx, file.org_id, 'file.download'))) return Errors.forbidden()

  // Resolve the target version's storage_path.
  let storagePath: string | null = null
  if (versionNumber !== undefined) {
    const { data: v } = await ctx.supabase.from('file_versions')
      .select('storage_path').eq('file_id', fileId).eq('version_number', versionNumber).maybeSingle()
    storagePath = v?.storage_path ?? null
  } else if (file.current_version_id) {
    const { data: v } = await ctx.supabase.from('file_versions')
      .select('storage_path').eq('id', file.current_version_id).maybeSingle()
    storagePath = v?.storage_path ?? null
  }
  if (!storagePath) return Errors.notFound('No version available to download')

  const svc = serviceClient()
  const { data, error } = await svc.storage.from(BUCKET)
    .createSignedUrl(storagePath, TTL_SEC, { download: file.name ?? undefined })
  if (error) return Errors.server(error.message)

  await audit({ req, orgId: file.org_id, actorId: ctx.userId, action: 'download',
    targetType: 'file', targetId: fileId, metadata: { versionNumber: versionNumber ?? null } })
  return ok({ signedUrl: data.signedUrl, expiresIn: TTL_SEC })
}
