// =============================================================================
// GET /api/search?orgId=&q=&limit=  — global ⌘K palette source.
//
// Returns a grouped payload: { files, folders, people }. Each query runs in
// parallel via Promise.all; RLS scopes every read so users only see resources
// they may access. Files use the existing FTS+trigram RPC (search_files);
// folders + people use trigram ILIKE for fuzzy name/email match.
// =============================================================================

import { type NextRequest } from 'next/server'
import { getAuth, ok, Errors, rateLimit } from '@/lib/api'

// Escapes the three ILIKE wildcards so user-supplied input doesn't widen the
// match. Trigram operators are unaffected; this only matters for the LIKE step.
function safeIlike(s: string): string {
  return s.replace(/[\\%_]/g, '\\$&')
}

interface FileHit {
  id: string; name: string; mime_type: string | null
  size_bytes: number; folder_id: string | null; rank: number
}
interface FolderHit {
  id: string; name: string; parent_id: string | null; path: string
}
interface PersonHit {
  id: string; email: string; full_name: string | null; avatar_url: string | null
}

export async function GET(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const rl = await rateLimit(req, ctx.userId, 'search')
  if (!rl.ok) return Errors.rateLimited(rl.retryAfter)

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId')
  const q = (searchParams.get('q') ?? '').trim()
  const perGroup = Math.min(Math.max(Number(searchParams.get('limit') ?? 6) || 6, 1), 20)
  if (!orgId) return Errors.validation('orgId is required')
  if (q.length === 0) return ok({ files: [], folders: [], people: [] })

  const ilike = `%${safeIlike(q)}%`

  const [filesRes, foldersRes, byNameRes, byEmailRes] = await Promise.all([
    ctx.supabase.rpc('search_files', {
      p_org: orgId, p_query: q, p_kind: 'all', p_limit: perGroup,
    }),
    ctx.supabase
      .from('folders')
      .select('id, name, parent_id, path')
      .eq('org_id', orgId).eq('is_trashed', false)
      .ilike('name', ilike)
      .order('name', { ascending: true })
      .limit(perGroup),
    // People search: name + email run as two queries so commas/special chars
    // in `q` don't have to be escaped for PostgREST's .or() comma-separated
    // grammar. RLS limits results to peers in shared orgs.
    ctx.supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .ilike('full_name', ilike)
      .limit(perGroup),
    ctx.supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .ilike('email', ilike)
      .limit(perGroup),
  ])

  if (filesRes.error) return Errors.server(filesRes.error.message)
  if (foldersRes.error) return Errors.server(foldersRes.error.message)

  // Merge + dedupe people by id, prefer name matches first (already sorted).
  const seen = new Set<string>()
  const people: PersonHit[] = []
  for (const arr of [byNameRes.data ?? [], byEmailRes.data ?? []]) {
    for (const p of arr as PersonHit[]) {
      if (!seen.has(p.id)) { seen.add(p.id); people.push(p) }
      if (people.length >= perGroup) break
    }
  }

  return ok({
    files: (filesRes.data ?? []) as FileHit[],
    folders: (foldersRes.data ?? []) as FolderHit[],
    people,
  })
}
