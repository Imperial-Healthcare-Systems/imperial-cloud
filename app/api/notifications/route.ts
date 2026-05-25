// =============================================================================
// /api/notifications — list current user's notifications; mark read.
// RLS limits rows to recipient_id = auth.uid().
// =============================================================================

import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuth, parse, ok, Errors } from '@/lib/api'

export async function GET(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const { searchParams } = new URL(req.url)
  const unreadOnly = searchParams.get('unread') === '1'
  let q = ctx.supabase
    .from('notifications')
    .select('id,kind,title,body,target_type,target_id,is_read,created_at')
    .order('created_at', { ascending: false }).limit(50)
  if (unreadOnly) q = q.eq('is_read', false)

  const { data, error } = await q
  if (error) return Errors.server(error.message)
  return ok({ items: data ?? [] })
}

const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  all: z.boolean().optional(),
}).refine(d => !!d.ids || d.all === true, { message: 'Provide ids[] or all=true' })

export async function PATCH(req: NextRequest) {
  const ctx = await getAuth()
  if (!ctx) return Errors.unauthorized()

  const parsed = await parse(req, markReadSchema)
  if ('error' in parsed) return parsed.error
  const { ids, all } = parsed.data

  const now = new Date().toISOString()
  let q = ctx.supabase.from('notifications').update({ is_read: true, read_at: now })
  if (ids && ids.length) q = q.in('id', ids)
  else if (all) q = q.eq('is_read', false)

  const { error } = await q
  if (error) return Errors.server(error.message)
  return ok({ updated: true })
}
