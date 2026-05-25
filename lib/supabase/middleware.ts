import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth cookie on every request so that Server
 * Components and route handlers see a valid session. Also gates the protected
 * route tree: unauthenticated users hitting an /(app) route are redirected
 * to /login; authenticated users hitting /login are bounced to /drive.
 *
 * Authorization is NOT enforced here — RLS is. This only handles presence.
 */
export async function updateSession(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const path = req.nextUrl.pathname
  const isAuthRoute =
    path === '/login' || path === '/signup' || path.startsWith('/auth/')
  const isPublic =
    path === '/' ||
    isAuthRoute ||
    path.startsWith('/s/') ||           // public share links
    path.startsWith('/invite/') ||      // team-invitation landing pages
    path.startsWith('/api/sharing') ||  // includes anonymous /resolve
    path.startsWith('/_next') ||
    path.startsWith('/brand') ||
    path === '/favicon.ico'

  if (!user && !isPublic) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  if (user && isAuthRoute) {
    const url = req.nextUrl.clone()
    url.pathname = '/drive'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return res
}
