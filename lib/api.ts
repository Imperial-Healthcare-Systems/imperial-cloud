// =============================================================================
// Imperial Cloud — API infrastructure: clients, auth/RBAC middleware,
// rate limiting, standardized responses, audit logging.
// =============================================================================

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

// ── Clients ─────────────────────────────────────────────────────────────────

/** Request-scoped client that respects the caller's session + RLS. Use for all
 *  normal data access — RLS does the authorization. */
export async function userClient() {
  const store = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          try { list.forEach(({ name, value, options }) => store.set(name, value, options)) } catch { /* read-only context */ }
        },
      },
    }
  )
}

/** Service-role client that BYPASSES RLS. Use ONLY for trusted server
 *  operations: SECURITY DEFINER RPCs, audit writes, admin user creation,
 *  shared-link token resolution. Never expose to the browser. */
export function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// ── Standardized responses ──────────────────────────────────────────────────

export type ApiError = { code: string; message: string; details?: unknown }

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init)
}
export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, details } as ApiError }, { status })
}

// Common failures
export const Errors = {
  unauthorized: () => fail(401, 'unauthorized', 'Authentication required'),
  forbidden: (msg = 'You do not have permission to perform this action') => fail(403, 'forbidden', msg),
  notFound: (msg = 'Resource not found') => fail(404, 'not_found', msg),
  rateLimited: (retryAfter: number) =>
    fail(429, 'rate_limited', 'Too many requests', { retryAfter }),
  validation: (details: unknown) => fail(422, 'validation_error', 'Invalid request', details),
  quota: () => fail(413, 'quota_exceeded', 'Storage quota exceeded'),
  server: (msg = 'Internal error') => fail(500, 'server_error', msg),
}

// ── Auth + RBAC guard ───────────────────────────────────────────────────────

export interface AuthContext {
  userId: string
  supabase: Awaited<ReturnType<typeof userClient>>
}

/** Resolve the authenticated user or null. */
export async function getAuth(): Promise<AuthContext | null> {
  const supabase = await userClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return { userId: user.id, supabase }
}

/**
 * Permission gate. Calls the in-database has_permission() so the *same* logic
 * that backs RLS also gates the API surface (defense in depth — even if a
 * policy were missing, the handler still refuses).
 */
export async function requirePermission(
  ctx: AuthContext, orgId: string, permission: string
): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc('has_permission', {
    p_org: orgId, p_perm: permission,
  })
  if (error) return false
  return data === true
}

// ── Validation helper ───────────────────────────────────────────────────────

export async function parse<T extends z.ZodTypeAny>(
  req: NextRequest, schema: T
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  let body: unknown
  try { body = await req.json() } catch { return { error: Errors.validation('Body must be JSON') } }
  const result = schema.safeParse(body)
  if (!result.success) return { error: Errors.validation(result.error.flatten()) }
  return { data: result.data }
}

// ── Rate limiting (Upstash Redis sliding window) ────────────────────────────
// Falls back to allow if Redis isn't configured (dev), so local works without it.

const RL = { windowMs: 60_000, max: 120 } // 120 req/min/identity per route group

export async function rateLimit(req: NextRequest, identity: string, bucket: string)
  : Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return { ok: true } // not configured — allow

  const key = `rl:${bucket}:${identity}`
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['PEXPIRE', key, RL.windowMs, 'NX']]),
      cache: 'no-store',
    })
    if (!res.ok) return { ok: true }
    const body = await res.json() as Array<{ result?: number }>
    const count = body?.[0]?.result ?? 0
    if (count > RL.max) return { ok: false, retryAfter: Math.ceil(RL.windowMs / 1000) }
    return { ok: true }
  } catch {
    // Don't block users if the rate-limit backend is unreachable.
    return { ok: true }
  }
}

// ── Audit logging ───────────────────────────────────────────────────────────
// Writes through the service client because audit_logs has no client insert
// policy (append-only via trusted server only). Captures IP + UA from request.

export async function audit(opts: {
  req: NextRequest
  orgId: string | null
  actorId: string | null
  action: string
  targetType?: string
  targetId?: string
  metadata?: Record<string, unknown>
}) {
  const svc = serviceClient()
  const ip = opts.req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
  const ua = opts.req.headers.get('user-agent') ?? null
  await svc.from('audit_logs').insert({
    org_id: opts.orgId, actor_id: opts.actorId, action: opts.action,
    target_type: opts.targetType ?? null, target_id: opts.targetId ?? null,
    ip_address: ip, user_agent: ua, metadata: opts.metadata ?? {},
  })
}
