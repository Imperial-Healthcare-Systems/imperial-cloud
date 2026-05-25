import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(req: NextRequest) {
  return updateSession(req)
}

export const config = {
  // Run on everything except static assets. Auth gating + session refresh live
  // in updateSession(); RLS is still the real authority on data access.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|brand/).*)'],
}
