// =============================================================================
// /api/sharing — internal shares + external tokenized links.
// Shows two access models:
//   • internal shares: RLS-governed inserts (the sharer must own/edit + have file.share)
//   • public links: resolved server-side via the service client, since an
//     anonymous visitor has no session/RLS context. The token is the capability.
// =============================================================================

import { type NextRequest } from 'next/server'
import { createHash, randomBytes } from 'node:crypto'
import {
  getAuth, requirePermission, parse, ok, Errors, rateLimit, audit, serviceClient,
} from '@/lib/api'
import { createShareSchema, createLinkSchema } from '@/lib/validation'

// ── POST /api/sharing/share — share with an org member ──────────────────────
export async function POST(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const rl = await rateLimit(req, ctx.userId, 'sharing')
  if (!rl.ok) return Errors.rateLimited(rl.retryAfter)

  const parsed = await parse(req, createShareSchema)
  if ('error' in parsed) return parsed.error
  const { orgId, fileId, folderId, sharedWith, permission } = parsed.data

  if (!(await requirePermission(ctx, orgId, 'file.share'))) return Errors.forbidden()

  // RLS WITH CHECK on `shares` re-verifies the sharer owns/can-edit the target.
  const { data, error } = await ctx.supabase
    .from('shares')
    .insert({ org_id: orgId, file_id: fileId ?? null, folder_id: folderId ?? null,
              shared_by: ctx.userId, shared_with: sharedWith, permission })
    .select().single()
  if (error) {
    if (error.code === '42501') return Errors.forbidden('You cannot share this item')
    if (error.code === '23505') return Errors.validation('Already shared with this user')
    return Errors.server(error.message)
  }

  // Notify the recipient (RLS allows insert by org members).
  await ctx.supabase.from('notifications').insert({
    org_id: orgId, recipient_id: sharedWith, kind: 'collaboration',
    title: 'A file was shared with you', target_type: fileId ? 'file' : 'folder',
    target_id: fileId ?? folderId,
  })

  await audit({ req, orgId, actorId: ctx.userId, action: 'share', targetType: fileId ? 'file' : 'folder', targetId: (fileId ?? folderId)!, metadata: { sharedWith, permission } })
  return ok(data, { status: 201 })
}

// ── PUT /api/sharing/link — mint a public share link ────────────────────────
export async function PUT(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const parsed = await parse(req, createLinkSchema)
  if ('error' in parsed) return parsed.error
  const { orgId, fileId, folderId, permission, password, maxDownloads, expiresInDays } = parsed.data

  if (!(await requirePermission(ctx, orgId, 'file.share'))) return Errors.forbidden()

  // Generate a high-entropy token; store only its hash. The raw token is shown
  // to the creator once and embedded in the URL.
  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const passwordHash = password ? createHash('sha256').update(password).digest('hex') : null
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString() : null

  const { data, error } = await ctx.supabase
    .from('shared_links')
    .insert({ org_id: orgId, file_id: fileId ?? null, folder_id: folderId ?? null,
              created_by: ctx.userId, token_hash: tokenHash, permission,
              password_hash: passwordHash, max_downloads: maxDownloads ?? null,
              expires_at: expiresAt })
    .select('id,permission,expires_at,max_downloads').single()
  if (error) {
    if (error.code === '42501') return Errors.forbidden()
    return Errors.server(error.message)
  }

  await audit({ req, orgId, actorId: ctx.userId, action: 'share', targetType: 'link', targetId: data.id })
  // Return the raw token exactly once.
  return ok({ ...data, url: `/s/${rawToken}` }, { status: 201 })
}

// ── GET /api/sharing/resolve?token= — anonymous link resolution ─────────────
// No session here. We use the SERVICE client (bypasses RLS) and treat the token
// as the capability. We validate status/expiry/limits before returning a
// short-lived signed Storage URL.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const rawToken = searchParams.get('token')
  if (!rawToken) return Errors.validation('token required')

  // Rate-limit anonymous resolution by IP to blunt token brute-forcing.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'anon'
  const rl = await rateLimit(req, ip, 'link:resolve')
  if (!rl.ok) return Errors.rateLimited(rl.retryAfter)

  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const svc = serviceClient()

  const { data: link } = await svc
    .from('shared_links')
    .select('id,file_id,folder_id,permission,status,expires_at,max_downloads,download_count,org_id')
    .eq('token_hash', tokenHash).eq('status', 'active').maybeSingle()

  if (!link) return Errors.notFound('Link not found or revoked')
  if (link.expires_at && new Date(link.expires_at) < new Date()) return Errors.notFound('Link expired')
  if (link.max_downloads && link.download_count >= link.max_downloads)
    return Errors.forbidden('Download limit reached')

  // For a file link, sign a short-lived URL to the current version's object.
  let signedUrl: string | null = null
  if (link.file_id) {
    const { data: file } = await svc.from('files')
      .select('current_version_id')
      .eq('id', link.file_id).maybeSingle()
    if (file?.current_version_id) {
      const { data: ver } = await svc.from('file_versions')
        .select('storage_path').eq('id', file.current_version_id).maybeSingle()
      if (ver?.storage_path) {
        const { data: signed } = await svc.storage.from('imperial-files')
          .createSignedUrl(ver.storage_path, 120)
        signedUrl = signed?.signedUrl ?? null
        await svc.from('shared_links')
          .update({ download_count: link.download_count + 1 }).eq('id', link.id)
      }
    }
  }

  await audit({ req, orgId: link.org_id, actorId: null, action: 'download', targetType: 'link', targetId: link.id, metadata: { anonymous: true } })
  return ok({ permission: link.permission, signedUrl })
}
