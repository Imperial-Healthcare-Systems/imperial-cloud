// =============================================================================
// POST /api/storage/upload-url — mint a one-shot signed upload URL.
// Client uploads bytes directly to Storage (never through this server), then
// POSTs PUT /api/files to register the new version.
// =============================================================================

import { type NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import {
  getAuth, requirePermission, parse, ok, Errors, rateLimit, serviceClient,
} from '@/lib/api'
import { uploadUrlSchema } from '@/lib/validation'

const BUCKET = 'imperial-files'

export async function POST(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const rl = await rateLimit(req, ctx.userId, 'storage:upload-url')
  if (!rl.ok) return Errors.rateLimited(rl.retryAfter)

  const parsed = await parse(req, uploadUrlSchema)
  if ('error' in parsed) return parsed.error
  const { orgId, fileId } = parsed.data

  if (!(await requirePermission(ctx, orgId, 'file.upload'))) return Errors.forbidden()

  // Verify the caller can see this file (RLS).
  const { data: file } = await ctx.supabase.from('files')
    .select('id,org_id').eq('id', fileId).maybeSingle()
  if (!file || file.org_id !== orgId) return Errors.notFound('File not found')

  // Object key: {orgId}/{fileId}/{versionToken}. Storage policies (migration 08)
  // require the leading orgId segment for write authorization.
  const versionToken = randomUUID()
  const path = `${orgId}/${fileId}/${versionToken}`

  // Sign via service client; user-bound auth.uploadToSignedUrl on the client.
  const svc = serviceClient()
  const { data, error } = await svc.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) return Errors.server(error.message)

  return ok({ bucket: BUCKET, path, token: data.token, signedUrl: data.signedUrl })
}
