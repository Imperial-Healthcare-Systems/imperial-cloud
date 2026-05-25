import { NextResponse, type NextRequest } from 'next/server'
import { getAuth, audit } from '@/lib/api'

export async function POST(req: NextRequest) {
  const ctx = await getAuth()
  if (ctx) {
    await audit({ req, orgId: null, actorId: ctx.userId, action: 'logout' })
    await ctx.supabase.auth.signOut()
  }
  return NextResponse.redirect(new URL('/login', req.url), { status: 303 })
}
